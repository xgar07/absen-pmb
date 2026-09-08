import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';

export default function Kiosk() {
  const [tokens, setTokens] = useState([]);
  const [currentToken, setCurrentToken] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const [status, setStatus] = useState('Memuat Kiosk...');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const fetchTokens = async () => {
    setStatus('Mengambil token...');
    try {
      const { data, error } = await supabase.rpc('get_kiosk_tokens', { batch_size: 5 });
      if (error) throw error;
      if (data && data.length > 0) {
        setTokens(data);
        setStatus('ACTIVE');
      } else {
        setStatus('Gagal memuat token');
      }
    } catch (err) {
      console.error(err);
      setStatus('OFFLINE - KONEKSI TERPUTUS');
    }
  };

  useEffect(() => {
    fetchTokens();
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
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
        } else if (status !== 'ACTIVE') {
          setStatus('ACTIVE');
        }
      } else {
        setCurrentToken(null);
        if (tokens.length > 0) {
          const maxWindow = Math.max(...tokens.map(t => t.window));
          if (currentWindow >= maxWindow) {
             setStatus('WAITING NEW TOKEN');
             fetchTokens(); 
          } else if (currentWindow === maxWindow - 1) {
             fetchTokens();
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [tokens, status]);

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  };
  const formatTime = (date) => {
    return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date) + ' WIB';
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
            <h2 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1.5rem', lineHeight: 1.2 }}>
              Silakan Scan QR<br/>Untuk Melakukan<br/><span style={{ color: '#38bdf8' }}>Absensi</span>
            </h2>
            <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginBottom: '2.5rem', maxWidth: '400px', lineHeight: 1.6 }}>
              Pastikan Anda sudah login ke sistem PMB di perangkat Anda, lalu buka menu <strong>Scan Absen</strong>.
            </p>
            
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5rem', backgroundColor: '#1e293b', padding: '1.25rem 2rem', borderRadius: '12px' }}>
              <div style={{ 
                  width: '16px', height: '16px', borderRadius: '50%', 
                  backgroundColor: status === 'ACTIVE' ? '#22c55e' : status === 'EXPIRING' ? '#eab308' : '#ef4444', 
                  boxShadow: `0 0 15px ${status === 'ACTIVE' ? '#22c55e' : status === 'EXPIRING' ? '#eab308' : '#ef4444'}` 
              }}></div>
              <div>
                <div style={{ fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SYSTEM STATUS</div>
                <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: status === 'ACTIVE' ? '#22c55e' : status === 'EXPIRING' ? '#eab308' : '#ef4444' }}>
                  {status}
                </div>
              </div>
            </div>
          </div>
          
          {/* QR Display Right */}
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
              <div style={{ width: 400, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px dashed #cbd5e1', borderRadius: '16px' }}>
                <p style={{ color: '#ef4444', fontWeight: 'bold', textAlign: 'center', fontSize: '1.2rem' }}>{status}</p>
              </div>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
}
