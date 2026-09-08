import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';

export default function Kiosk() {
  const [tokens, setTokens] = useState([]);
  const [currentToken, setCurrentToken] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const [status, setStatus] = useState('Memuat Kiosk...');
  
  const fetchTokens = async () => {
    setStatus('Mengambil token dari server...');
    try {
      const { data, error } = await supabase.rpc('get_kiosk_tokens', { batch_size: 5 });
      if (error) throw error;
      if (data && data.length > 0) {
        setTokens(data);
        setStatus('AKTIF');
      } else {
        setStatus('Gagal memuat token (kosong)');
      }
    } catch (err) {
      console.error(err);
      setStatus('KONEKSI KIOSK TERPUTUS');
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const currentWindow = Math.floor(now / 60);
      const secondsLeft = 60 - (now % 60);
      
      setCountdown(secondsLeft);

      // Cari token yang valid untuk window saat ini
      const validToken = tokens.find(t => t.window === currentWindow);
      
      if (validToken) {
        setCurrentToken(validToken.token);
        if (status !== 'AKTIF') setStatus('AKTIF');
      } else {
        setCurrentToken(null);
        if (tokens.length > 0) {
          // Cek apakah batch sudah mau habis (kurang dari 2 window tersisa) atau sudah habis
          const maxWindow = Math.max(...tokens.map(t => t.window));
          
          if (currentWindow >= maxWindow) {
             setStatus('KONEKSI KIOSK TERPUTUS — MENUNGGU TOKEN BARU');
             fetchTokens(); // coba fetch ulang
          } else if (currentWindow === maxWindow - 1) {
             // Fetch di background jika sisa 1 window agar seamless
             fetchTokens();
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [tokens, status]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '2rem' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#0f172a' }}>PMB</h1>
      <h2 style={{ fontSize: '1.5rem', color: '#64748b', marginBottom: '3rem' }}>ABSENSI PANITIA</h2>
      
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}>
        {currentToken ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <QRCodeSVG value={currentToken} size={300} />
            <div style={{ marginTop: '2rem', fontSize: '3rem', fontWeight: 'bold', fontFamily: 'monospace', color: '#3b82f6' }}>
              00:{countdown.toString().padStart(2, '0')}
            </div>
            <p style={{ marginTop: '1rem', color: '#64748b', fontWeight: '500', textAlign: 'center' }}>SCAN QR INI UNTUK ABSEN</p>
          </div>
        ) : (
          <div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1' }}>
            <p style={{ color: '#ef4444', fontWeight: 'bold', textAlign: 'center' }}>{status}</p>
          </div>
        )}
      </div>
      
      <p style={{ marginTop: '2rem', color: '#94a3b8', fontSize: '0.875rem' }}>Status: {status}</p>
    </div>
  );
}
