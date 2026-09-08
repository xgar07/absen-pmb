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

  // Late Reason State
  const [isLate, setIsLate] = useState(false);
  const [lateReason, setLateReason] = useState('');
  const [scannedToken, setScannedToken] = useState(null);
  const [isSubmittingReason, setIsSubmittingReason] = useState(false);

  useEffect(() => {
    // Check if user is authenticated and is panitia
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('is_active').eq('id', user.id).single();
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        window.alert('Akun Anda sedang dinonaktifkan oleh administrator.');
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

  const submitToken = async (token, reason = null) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_attendance', { 
        qr_token: token,
        p_reason: reason
      });
      
      if (rpcError) {
        throw new Error('GAGAL TERHUBUNG KE SERVER');
      }

      if (data && data.success) {
        setSuccess(data.message);
        setScanStatus('Selesai');
        setIsLate(false);
        setError(null);
      } else {
        const errorCode = data?.error;
        if (errorCode === 'LATE_REASON_REQUIRED') {
           setIsLate(true);
           setScannedToken(token);
           setError(data.message);
           setScanStatus('Menunggu Keterangan');
           return;
        }

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
      await submitToken(decodedText);
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
    setIsLate(false);
    setLateReason('');
    setScannedToken(null);
    setScanStatus('Mengulang...');
    navigate('/scan', { replace: true });
    
    if (scannerInstance && !scannerInstance.isScanning) {
      scannerInstance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (scannerInstance.isScanning) {
            await scannerInstance.stop();
            setIsScanning(false);
          }
          navigate('/scan', { replace: true });
        },
        () => {}
      ).catch(err => {
        setError('AKSES KAMERA DITOLAK');
      });
    }
  };

  const handleSubmitReason = async (e) => {
    e.preventDefault();
    if (!lateReason.trim()) return;
    setIsSubmittingReason(true);
    await submitToken(scannedToken, lateReason);
    setIsSubmittingReason(false);
  };

  return (
    <div className="dashboard-layout">
      <nav className="navbar">
        <div className="container">
          <div className="navbar-brand">Scan Absensi</div>
          <button type="button" onClick={() => navigate('/')} className="btn-logout" style={{ color: 'var(--primary-color)' }}>Kembali</button>
        </div>
      </nav>

      <main className="dashboard-content container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Arahkan Kamera ke QR</h2>
        
        {error && !isLate && (
          <div className="alert alert-error text-center" style={{ width: '100%', maxWidth: '400px' }}>
            <strong>{error}</strong>
          </div>
        )}

        {success && (
          <div className="alert text-center" style={{ backgroundColor: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0', width: '100%', maxWidth: '400px' }}>
            <strong>{success}</strong>
          </div>
        )}

        {isLate ? (
          <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderTop: '4px solid #f59e0b' }}>
            <h3 style={{ color: '#d97706', marginBottom: '1rem', textAlign: 'center' }}>Anda Terlambat</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
              Batas toleransi keterlambatan telah lewat. Mohon isi keterangan/alasan singkat untuk dapat melanjutkan absen.
            </p>
            <form onSubmit={handleSubmitReason}>
              <div className="form-group">
                <label>Alasan Keterlambatan</label>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  value={lateReason}
                  onChange={(e) => setLateReason(e.target.value)}
                  placeholder="Contoh: Macet di perjalanan, dll."
                  required
                ></textarea>
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1rem', backgroundColor: '#f59e0b' }}
                disabled={isSubmittingReason || !lateReason.trim()}
              >
                {isSubmittingReason ? 'Menyimpan...' : 'Submit Keterangan'}
              </button>
            </form>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', maxWidth: '400px', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
            <div id="reader" style={{ width: '100%', minHeight: '300px' }}></div>
            {!isScanning && scanStatus !== 'Selesai' && !error && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}>
                <p>{scanStatus}</p>
              </div>
            )}
          </div>
        )}

        {(error || success) && !isLate && (
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button type="button" onClick={() => navigate('/')} className="btn btn-primary" style={{ backgroundColor: '#64748b' }}>Kembali ke Dashboard</button>
            <button type="button" onClick={handleRetry} className="btn btn-primary">Scan Ulang</button>
          </div>
        )}
      </main>
    </div>
  );
}
