import { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Scanner() {
  const navigate = useNavigate();
  const [scanStatus, setScanStatus] = useState('Meminta akses kamera...');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [scannerInstance, setScannerInstance] = useState(null);

  useEffect(() => {
    // Check if user is authenticated and is panitia
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
      }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    // Only initialize scanner once
    if (!scannerInstance) {
      const html5QrCode = new Html5Qrcode("reader");
      setScannerInstance(html5QrCode);
    }
  }, [scannerInstance]);

  useEffect(() => {
    if (!scannerInstance) return;

    let isRequesting = false; // Prevent multiple requests

    const onScanSuccess = async (decodedText) => {
      if (isRequesting) return; // Prevent double submit
      isRequesting = true;
      
      // Stop scanning to prevent multiple reads
      try {
        await scannerInstance.stop();
        setIsScanning(false);
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }

      setScanStatus('Memverifikasi...');
      setError(null);

      try {
        const { data, error: rpcError } = await supabase.rpc('submit_attendance', { qr_token: decodedText });
        
        if (rpcError) {
          throw new Error('GAGAL TERHUBUNG KE SERVER');
        }

        if (data && data.success) {
          setSuccess(data.message);
          setScanStatus('Selesai');
        } else {
          // Map error code to UI messages
          const errorCode = data?.error;
          let uiError = 'QR TIDAK VALID';
          if (errorCode === 'FUTURE_TOKEN') uiError = 'QR BELUM AKTIF';
          if (errorCode === 'EXPIRED_TOKEN') uiError = 'QR KADALUARSA';
          if (errorCode === 'DUPLICATE') uiError = 'ANDA SUDAH ABSEN';
          if (errorCode === 'INVALID_SIGNATURE' || errorCode === 'INVALID_PAYLOAD' || errorCode === 'INVALID_FORMAT') uiError = 'QR TIDAK VALID';
          if (errorCode === 'UNAUTHORIZED' || errorCode === 'FORBIDDEN') uiError = 'AKSES DITOLAK';
          
          setError(uiError);
          setScanStatus('Gagal');
        }
      } catch (err) {
        setError(err.message || 'GAGAL TERHUBUNG KE SERVER');
        setScanStatus('Gagal');
      }
    };

    const startScanner = async () => {
      try {
        setScanStatus('Meminta akses kamera...');
        await scannerInstance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          () => {
            // Ignore scan failures (happens on every frame without QR)
          }
        );
        setIsScanning(true);
        setScanStatus('Scanning...');
      } catch (err) {
        console.error(err);
        setError('AKSES KAMERA DITOLAK');
        setScanStatus('Kamera gagal dimuat');
      }
    };

    startScanner();

    // Cleanup on unmount
    return () => {
      if (scannerInstance && scannerInstance.isScanning) {
        scannerInstance.stop().catch(console.error);
      }
    };
  }, [scannerInstance]);

  const handleRetry = () => {
    setError(null);
    setSuccess(null);
    setScanStatus('Mengulang...');
    
    // Start scanner again
    if (scannerInstance && !scannerInstance.isScanning) {
      scannerInstance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Stop scanner immediately on success
          if (scannerInstance.isScanning) {
            await scannerInstance.stop();
            setIsScanning(false);
          }
          // The effect above will handle the submission, but wait, the effect's onScanSuccess closure might be stale.
          // Better to just reload the page or navigate back to /scan
          window.location.reload();
        },
        () => {}
      ).catch(err => {
        setError('AKSES KAMERA DITOLAK');
      });
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="dashboard-layout">
      <nav className="navbar">
        <div className="container">
          <div className="navbar-brand">Scan Absensi</div>
          <button onClick={() => navigate('/')} className="btn-logout" style={{ color: 'var(--primary-color)' }}>Kembali</button>
        </div>
      </nav>

      <main className="dashboard-content container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Arahkan Kamera ke QR</h2>
        
        {error && (
          <div className="alert alert-error text-center" style={{ width: '100%', maxWidth: '400px' }}>
            <strong>{error}</strong>
          </div>
        )}

        {success && (
          <div className="alert text-center" style={{ backgroundColor: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', width: '100%', maxWidth: '400px' }}>
            <strong>{success}</strong>
          </div>
        )}

        <div style={{ position: 'relative', width: '100%', maxWidth: '400px', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
          <div id="reader" style={{ width: '100%', minHeight: '300px' }}></div>
          {!isScanning && scanStatus !== 'Selesai' && !error && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}>
              <p>{scanStatus}</p>
            </div>
          )}
        </div>

        {(error || success) && (
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-primary" style={{ backgroundColor: '#64748b' }}>Kembali ke Dashboard</button>
            <button onClick={handleRetry} className="btn btn-primary">Scan Ulang</button>
          </div>
        )}
      </main>
    </div>
  );
}
