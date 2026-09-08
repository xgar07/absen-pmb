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
      if (challengeError || !challengeData?.success) throw new Error('Station dinonaktifkan atau dihapus');

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
      setStatus('NOT AUTHORIZED');
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
      <header style={{ padding: '1.5rem 3rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '0.05em', margin: 0, color: '#38bdf8' }}>PMB // ATTENDANCE KIOSK</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.25rem', letterSpacing: '0.1em' }}>SISTEM OPERASIONAL MEJA PENDAFTARAN</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#e2e8f0' }}>{formatDate(currentTime)}</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#38bdf8', fontFamily: 'monospace' }}>{formatTime(currentTime)}</div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4rem', alignItems: 'center', justifyContent: 'center', maxWidth: '1200px', width: '100%' }}>
          
          {/* Instructions Left */}
          <div style={{ flex: '1 1 400px' }}>
            {isPaired === false ? (
              <>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1.5rem', lineHeight: 1.2 }}>
                  Kiosk Belum <span style={{ color: '#38bdf8' }}>Terdaftar</span>
                </h2>
                <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginBottom: '2rem', lineHeight: 1.6 }}>
                  Station ini membutuhkan otorisasi dari Dosen untuk dapat beroperasi sebagai Attendance Kiosk resmi.
                </p>
                <form onSubmit={handlePairing} style={{ backgroundColor: '#1e293b', padding: '2rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                  {pairingError && <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', border: '1px solid #7f1d1d' }}>{pairingError}</div>}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 'bold' }}>Pairing PIN (6 Digit)</label>
                    <input 
                      type="text" 
                      maxLength="6"
                      value={pairingCode}
                      onChange={e => setPairingCode(e.target.value)}
                      placeholder="000000"
                      style={{ width: '100%', padding: '1rem', fontSize: '2rem', textAlign: 'center', letterSpacing: '0.5em', borderRadius: '8px', border: '2px solid #334155', backgroundColor: '#0f172a', color: 'white', fontFamily: 'monospace', outline: 'none' }}
                      required
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isPairing || pairingCode.length < 6}
                    style={{ width: '100%', padding: '1rem', backgroundColor: (isPairing || pairingCode.length < 6) ? '#475569' : '#38bdf8', color: (isPairing || pairingCode.length < 6) ? '#94a3b8' : '#020617', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: (isPairing || pairingCode.length < 6) ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s' }}
                  >
                    {isPairing ? 'Memproses...' : 'Pair Device'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1.5rem', lineHeight: 1.2 }}>
                  Silakan Scan QR<br/>Untuk Melakukan<br/><span style={{ color: '#38bdf8' }}>Absensi</span>
                </h2>
                <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginBottom: '2.5rem', maxWidth: '400px', lineHeight: 1.6 }}>
                  Pastikan Anda sudah login ke sistem PMB di perangkat Anda, lalu buka menu <strong>Scan Absen</strong>.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5rem', backgroundColor: '#1e293b', padding: '1.25rem 2rem', borderRadius: '12px' }}>
                    <div style={{ 
                        width: '16px', height: '16px', borderRadius: '50%', 
                        backgroundColor: status === 'ACTIVE' ? '#22c55e' : (status === 'EXPIRING' || status === 'WAITING NEW TOKEN' ? '#eab308' : '#ef4444'), 
                        boxShadow: `0 0 15px ${status === 'ACTIVE' ? '#22c55e' : (status === 'EXPIRING' || status === 'WAITING NEW TOKEN' ? '#eab308' : '#ef4444')}` 
                    }}></div>
                    <div>
                      <div style={{ fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SYSTEM STATUS</div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: status === 'ACTIVE' ? '#22c55e' : (status === 'EXPIRING' || status === 'WAITING NEW TOKEN' ? '#eab308' : '#ef4444') }}>
                        {status}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <button onClick={unpairDevice} style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => {e.target.style.color = '#ef4444'; e.target.style.borderColor = '#ef4444';}} onMouseOut={e => {e.target.style.color = '#64748b'; e.target.style.borderColor = '#334155';}}>
                      Unpair Device
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* QR Display Right */}
          {isPaired !== false && (
            <div style={{ backgroundColor: 'white', padding: '3.5rem', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {currentToken ? (
                <>
                  <div style={{ padding: '1.5rem', border: '4px solid #f1f5f9', borderRadius: '16px', backgroundColor: 'white' }}>
                     <QRCodeSVG value={currentToken} size={400} level="M" includeMargin={true} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: '2.5rem', padding: '0 1rem' }}>
                    <span style={{ fontSize: '1.2rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valid for</span>
                    <div style={{ fontSize: '3.5rem', fontWeight: 'bold', fontFamily: 'monospace', color: countdown <= 10 ? '#ef4444' : '#0f172a', transition: 'color 0.3s', lineHeight: 1 }}>
                      00:{countdown.toString().padStart(2, '0')}
                    </div>
                  </div>
                  {/* Progress bar visual for countdown */}
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', marginTop: '1.5rem', overflow: 'hidden' }}>
                    <div style={{ width: `${(countdown / 60) * 100}%`, height: '100%', backgroundColor: countdown <= 10 ? '#ef4444' : '#38bdf8', transition: 'width 1s linear, background-color 0.3s' }}></div>
                  </div>
                </>
              ) : (
                <div style={{ width: 400, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px dashed #cbd5e1', borderRadius: '16px', backgroundColor: '#f8fafc' }}>
                  <p style={{ color: status === 'NOT AUTHORIZED' ? '#ef4444' : '#94a3b8', fontWeight: 'bold', textAlign: 'center', fontSize: '1.2rem' }}>
                    {status === 'NOT AUTHORIZED' ? 'AKSES DITOLAK / DISABLED' : status}
                  </p>
                </div>
              )}
            </div>
          )}
          
        </div>
      </main>
    </div>
  );
}
