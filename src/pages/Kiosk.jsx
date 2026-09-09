import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';
import { getVal, setVal, clearDB } from '../lib/idb';

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export default function Kiosk() {
  const [tokens, setTokens] = useState([]);
  const [currentToken, setCurrentToken] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const [status, setStatus] = useState('Memuat...');
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isPaired, setIsPaired] = useState(null);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingError, setPairingError] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  
  // Use a ref to prevent double fetching during StrictMode double-invocations
  const fetchingRef = useRef(false);

  useEffect(() => {
    checkPairingStatus();
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  const checkPairingStatus = async () => {
    const stationId = await getVal('station_id');
    const privateKey = await getVal('private_key');
    if (stationId && privateKey) {
      setIsPaired(true);
      fetchTokens(stationId, privateKey);
    } else {
      setIsPaired(false);
      setStatus('PAIRING REQUIRED');
    }
  };

  const handlePairing = async (e) => {
    e.preventDefault();
    setIsPairing(true);
    setPairingError('');

    try {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, 
        ['sign']
      );

      const exportedPubKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const pubKeyBase64 = arrayBufferToBase64(exportedPubKey);

      const { data, error } = await supabase.functions.invoke('kiosk-auth', {
        body: { action: 'pair', pairing_code: pairingCode, public_key: pubKeyBase64 }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Gagal pairing');

      await setVal('private_key', keyPair.privateKey);
      await setVal('station_id', data.station_id);

      setIsPaired(true);
      setPairingCode('');
      fetchTokens(data.station_id, keyPair.privateKey);
    } catch (err) {
      setPairingError(err.message || 'Kode tidak valid atau kadaluwarsa');
    } finally {
      setIsPairing(false);
    }
  };

  const fetchTokens = async (stationId, privateKey) => {
    if (!stationId || !privateKey) return;
    if (fetchingRef.current) return;
    
    fetchingRef.current = true;
    setStatus('Mengambil token...');
    try {
      const { data: challengeData, error: challengeError } = await supabase.functions.invoke('kiosk-auth', {
        body: { action: 'challenge', station_id: stationId }
      });
      
      if (challengeError) {
        // Try to extract specific error from Edge Function response
        let msg = 'AKSES DITOLAK / DISABLED';
        if (challengeError.message?.includes('dinonaktifkan')) msg = 'STATION DINONAKTIFKAN';
        if (challengeError.message?.includes('pair ulang')) msg = 'STATION PERLU DI-PAIR ULANG';
        throw new Error(msg);
      }
      if (!challengeData?.success) {
        throw new Error(challengeData?.error || 'AKSES DITOLAK / DISABLED');
      }

      const dataBuffer = new TextEncoder().encode(challengeData.challenge);
      const signatureBuffer = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        privateKey,
        dataBuffer
      );
      const signatureBase64 = arrayBufferToBase64(signatureBuffer);

      const { data: tokensData, error: tokensError } = await supabase.functions.invoke('kiosk-auth', {
        body: {
          action: 'get_tokens',
          station_id: stationId,
          challenge_id: challengeData.challenge_id,
          signature: signatureBase64
        }
      });
      
      if (tokensError || !tokensData?.success) throw new Error('Authorization ditolak');

      if (tokensData.tokens && tokensData.tokens.length > 0) {
        setTokens(tokensData.tokens);
        setStatus('ACTIVE');
      } else {
        setStatus('Gagal memuat token');
      }
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'NOT AUTHORIZED');
      setTokens([]);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (!isPaired) return;
    
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const currentWindow = Math.floor(now / 60);
      const secondsLeft = 60 - (now % 60);
      
      setCountdown(secondsLeft);

      const validToken = tokens.find(t => t.window === currentWindow);
      
      if (validToken) {
        setCurrentToken(validToken.token);
        if (secondsLeft <= 10) {
          setStatus('EXPIRING');
        } else if (status !== 'ACTIVE' && status !== 'NOT AUTHORIZED') {
          setStatus('ACTIVE');
        }
      } else {
        setCurrentToken(null);
        if (tokens.length > 0) {
          const maxWindow = Math.max(...tokens.map(t => t.window));
          if (currentWindow >= maxWindow) {
             if (status !== 'NOT AUTHORIZED' && !fetchingRef.current) {
               setStatus('WAITING NEW TOKEN');
               getVal('station_id').then(sId => getVal('private_key').then(pk => fetchTokens(sId, pk)));
             }
          } else if (currentWindow === maxWindow - 1) {
             if (status !== 'NOT AUTHORIZED' && !fetchingRef.current) {
               getVal('station_id').then(sId => getVal('private_key').then(pk => fetchTokens(sId, pk)));
             }
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [tokens, status, isPaired]);

  const formatDate = (date) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  const formatTime = (date) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date) + ' WIB';

  const unpairDevice = async () => {
    if (!window.confirm('Yakin ingin unpair device ini? Kiosk akan berhenti beroperasi.')) return;
    await clearDB();
    setIsPaired(false);
    setTokens([]);
    setCurrentToken(null);
    setStatus('PAIRING REQUIRED');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', color: '#f8fafc', padding: '0', overflow: 'hidden' }}>
      
      {/* Header */}
      <header style={{ padding: '1.5rem 3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '0.05em', margin: 0, color: '#38bdf8' }}>PMB // ATTENDANCE KIOSK</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#38bdf8', fontFamily: 'monospace' }}>{formatTime(currentTime)}</div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        
        {isPaired === false ? (
          <div style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem', lineHeight: 1.2 }}>
              Kiosk Belum <span style={{ color: '#38bdf8' }}>Terdaftar</span>
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginBottom: '2.5rem', lineHeight: 1.6 }}>
              Station ini membutuhkan otorisasi dari Dosen untuk dapat beroperasi sebagai Attendance Kiosk resmi.
            </p>
            <form onSubmit={handlePairing} style={{ backgroundColor: '#1e293b', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', textAlign: 'left' }}>
              {pairingError && <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', border: '1px solid #7f1d1d' }}>{pairingError}</div>}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 'bold' }}>Pairing PIN (6 Digit)</label>
                <input 
                  type="text" 
                  maxLength="6"
                  value={pairingCode}
                  onChange={e => setPairingCode(e.target.value)}
                  placeholder="000000"
                  style={{ width: '100%', padding: '1.25rem', fontSize: '2.5rem', textAlign: 'center', letterSpacing: '0.5em', borderRadius: '12px', border: '2px solid #334155', backgroundColor: '#0f172a', color: 'white', fontFamily: 'monospace', outline: 'none' }}
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={isPairing || pairingCode.length < 6}
                style={{ width: '100%', padding: '1.25rem', backgroundColor: (isPairing || pairingCode.length < 6) ? '#475569' : '#38bdf8', color: (isPairing || pairingCode.length < 6) ? '#94a3b8' : '#020617', border: 'none', borderRadius: '12px', fontSize: '1.2rem', fontWeight: 'bold', cursor: (isPairing || pairingCode.length < 6) ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s' }}
              >
                {isPairing ? 'Memproses...' : 'Pair Device'}
              </button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '600px', width: '100%' }}>
            
            {/* QR Section */}
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', marginBottom: '2rem' }}>
              {currentToken ? (
                <QRCodeSVG value={currentToken} size={320} level="M" includeMargin={true} />
              ) : (
                <div style={{ width: 320, height: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '4px dashed #cbd5e1', borderRadius: '16px', backgroundColor: '#f8fafc', padding: '1rem', textAlign: 'center' }}>
                  <p style={{ color: status.includes('PAIR ULANG') ? '#f59e0b' : '#ef4444', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem' }}>
                    {status === 'STATION DINONAKTIFKAN' ? 'STATION DINONAKTIFKAN' : (status === 'STATION PERLU DI-PAIR ULANG' ? 'STATION PERLU DI-PAIR ULANG' : 'AKSES DITOLAK / DISABLED')}
                  </p>
                  {status === 'STATION PERLU DI-PAIR ULANG' && (
                    <button onClick={unpairDevice} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                      PAIR ULANG
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Instructions */}
            <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>
              Arahkan kamera HP ke QR ini
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#94a3b8', margin: '0 0 2rem 0' }}>
              Buka menu scan absen di sistem PMB
            </p>

            {/* Timer Progress Bar */}
            {currentToken && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', maxWidth: '400px', marginBottom: '3rem' }}>
                <span style={{ fontSize: '1rem', color: '#cbd5e1', fontWeight: '600' }}>Berlaku</span>
                <div style={{ flex: 1, height: '8px', backgroundColor: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(countdown / 60) * 100}%`, height: '100%', backgroundColor: countdown <= 10 ? '#ef4444' : (countdown <= 20 ? '#f59e0b' : '#38bdf8'), transition: 'width 1s linear, background-color 0.3s' }}></div>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', fontFamily: 'monospace', color: countdown <= 10 ? '#ef4444' : '#e2e8f0', minWidth: '65px', textAlign: 'right' }}>
                  00:{countdown.toString().padStart(2, '0')}
                </div>
              </div>
            )}

            {/* System Status Pill & Unpair */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: currentToken ? '0' : '2rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#1e293b', padding: '0.5rem 1.25rem', borderRadius: '9999px', border: '1px solid #334155' }}>
                <div style={{ 
                    width: '10px', height: '10px', borderRadius: '50%', 
                    backgroundColor: status === 'ACTIVE' ? '#22c55e' : (status === 'EXPIRING' || status === 'WAITING NEW TOKEN' ? '#eab308' : '#ef4444'), 
                    boxShadow: `0 0 10px ${status === 'ACTIVE' ? '#22c55e' : (status === 'EXPIRING' || status === 'WAITING NEW TOKEN' ? '#eab308' : '#ef4444')}` 
                }}></div>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#cbd5e1' }}>
                  Sistem {status === 'ACTIVE' ? 'aktif' : (status === 'EXPIRING' ? 'aktif (expiring)' : status.toLowerCase())}
                </div>
              </div>
              <button onClick={unpairDevice} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.9rem', cursor: 'pointer', textDecoration: 'underline' }} onMouseOver={e => e.target.style.color = '#ef4444'} onMouseOut={e => e.target.style.color = '#64748b'}>
                Unpair
              </button>
            </div>
            
          </div>
        )}
      </main>
    </div>
  );
}
