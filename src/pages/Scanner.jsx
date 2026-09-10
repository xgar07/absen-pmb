import { useState, useEffect, useRef } from 'react';
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

  // Preview & Confirm State
  const [showConfirm, setShowConfirm] = useState(false);
  const [previewData, setPreviewData] = useState(null); // { action, shift_id, shift_name, is_early_checkout }
  const [availableActions, setAvailableActions] = useState([]);
  const [showActionSelection, setShowActionSelection] = useState(false);
  
  // Reason State (used for both late IN and early OUT)
  const [reason, setReason] = useState('');
  const [isLate, setIsLate] = useState(false); // true if IN requires late reason
  const [scannedToken, setScannedToken] = useState(null);
  const [isSubmittingReason, setIsSubmittingReason] = useState(false);
  
  const isRequestingRef = useRef(false);

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
    if (!scannerInstance) {
      const html5QrCode = new Html5Qrcode("reader");
      setScannerInstance(html5QrCode);
    }
  }, [scannerInstance]);

  const mapError = (errorCode, dataMsg) => {
    let uiError = dataMsg || 'QR TIDAK VALID';
    if (errorCode === 'FUTURE_TOKEN') uiError = 'QR BELUM AKTIF';
    if (errorCode === 'EXPIRED_TOKEN') uiError = 'QR KADALUARSA';
    if (errorCode === 'DUPLICATE') uiError = dataMsg || 'ANDA SUDAH ABSEN';
    if (errorCode === 'INVALID_SIGNATURE' || errorCode === 'INVALID_PAYLOAD' || errorCode === 'INVALID_FORMAT') uiError = 'QR TIDAK VALID';
    if (errorCode === 'UNAUTHORIZED' || errorCode === 'FORBIDDEN') uiError = 'AKSES DITOLAK';
    if (errorCode === 'NO_SHIFT') uiError = 'TIDAK ADA JADWAL SHIFT UNTUK ANDA HARI INI';
    if (errorCode === 'SHIFT_COMPLETED') uiError = 'SHIFT ANDA SUDAH SELESAI (Sudah Absen Masuk & Pulang)';
    if (errorCode === 'EARLY_ATTENDANCE') uiError = 'BELUM WAKTUNYA SHIFT DIMULAI';
    if (errorCode === 'SERVER_ERROR') uiError = dataMsg || 'TERJADI KESALAHAN SERVER';
    return uiError;
  };

  const startScanning = async () => {
    if (!scannerInstance) return;
    
    isRequestingRef.current = false;
    setError(null);
    setSuccess(null);
    setIsLate(false);
    setShowConfirm(false);
    setShowActionSelection(false);
    setPreviewData(null);
    setAvailableActions([]);
    setReason('');
    setScannedToken(null);
    setScanStatus('Meminta akses kamera...');
    
    try {
      await scannerInstance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (isRequestingRef.current) return;
          isRequestingRef.current = true;
          
          try {
            await scannerInstance.stop();
            setIsScanning(false);
          } catch (err) { console.error(err); }
          
          setScanStatus('Memverifikasi...');
          setError(null);
          await handleScanResult(decodedText);
        },
        () => {}
      );
      setIsScanning(true);
      setScanStatus('Scanning...');
    } catch (err) {
      console.error(err);
      setError('AKSES KAMERA DITOLAK');
      setScanStatus('Kamera gagal dimuat');
    }
  };

  useEffect(() => {
    if (scannerInstance) {
      startScanning();
    }
    return () => {
      if (scannerInstance && scannerInstance.isScanning) {
        scannerInstance.stop().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerInstance]);

  const handleScanResult = async (token) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('preview_attendance_action', { qr_token: token });
      
      if (rpcError) {
        throw new Error(`GAGAL TERHUBUNG KE SERVER: ${rpcError.message || JSON.stringify(rpcError)}`);
      }

      if (data && data.success) {
        setScannedToken(token);
        if (data.actions && data.actions.length > 1) {
          setAvailableActions(data.actions);
          setShowActionSelection(true);
          setScanStatus('Pilih Aksi Absensi');
        } else if (data.actions && data.actions.length === 1) {
          setPreviewData(data.actions[0]);
          setShowConfirm(true);
          setScanStatus('Konfirmasi Absen');
        } else {
          setError('TIDAK ADA AKSI ABSENSI YANG VALID');
          setScanStatus('Gagal');
        }
      } else {
        if (data?.error === 'SHIFT_MISSED') {
           setError('Anda melewatkan jam absen untuk shift terjadwal hari ini');
        } else {
           setError(mapError(data?.error, data?.message));
        }
        setScanStatus('Gagal');
      }
    } catch (err) {
      setError(err.message || 'GAGAL TERHUBUNG KE SERVER');
      setScanStatus('Gagal');
    }
  };

  const submitToken = async (token, reasonText = null) => {
    try {
      setIsSubmittingReason(true);
      const { data, error: rpcError } = await supabase.rpc('submit_attendance', { 
        qr_token: token,
        p_shift_id: previewData.shift_id,
        p_action: previewData.action,
        p_reason: reasonText
      });
      
      if (rpcError) {
        throw new Error(`GAGAL TERHUBUNG KE SERVER: ${rpcError.message || JSON.stringify(rpcError)}`);
      }

      if (data && data.success) {
        setSuccess(data.message);
        setScanStatus('Selesai');
        setIsLate(false);
        setShowConfirm(false);
        setError(null);
      } else {
        const errorCode = data?.error;
        if (errorCode === 'LATE_REASON_REQUIRED') {
           setIsLate(true);
           setShowConfirm(false);
           setScannedToken(token);
           setError(data.message);
           setScanStatus('Menunggu Keterangan');
        } else if (errorCode === 'EXPIRED_TOKEN') {
           setError('QR KADALUARSA saat konfirmasi, silakan scan ulang');
           setScanStatus('Gagal');
           setShowConfirm(false);
        } else if (errorCode === 'SHIFT_MISSED') {
           setError('Anda melewatkan jam absen untuk shift terjadwal hari ini');
           setScanStatus('Gagal');
           setShowConfirm(false);
        } else {
           setError(mapError(errorCode, data?.message));
           setScanStatus('Gagal');
           setShowConfirm(false);
        }
      }
    } catch (err) {
      setError(err.message || 'GAGAL TERHUBUNG KE SERVER');
      setScanStatus('Gagal');
      setShowConfirm(false);
    } finally {
      setIsSubmittingReason(false);
    }
  };

  const handleSubmitReason = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    await submitToken(scannedToken, reason);
  };

  const handleConfirmSubmit = async (e) => {
    e.preventDefault();
    if (previewData?.is_early_checkout && !reason.trim()) return;
    await submitToken(scannedToken, previewData?.is_early_checkout ? reason : null);
  };

  const handleSelectAction = (actionItem) => {
    setShowActionSelection(false);
    setPreviewData(actionItem);
    setShowConfirm(true);
    setScanStatus('Konfirmasi Absen');
  };

  const handleRetry = () => {
    startScanning();
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

        {isLate && (
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
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Macet di perjalanan, dll."
                  required
                ></textarea>
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1rem', backgroundColor: '#f59e0b' }}
                disabled={isSubmittingReason || !reason.trim()}
              >
                {isSubmittingReason ? 'Menyimpan...' : 'Submit Keterangan'}
              </button>
            </form>
          </div>
        )}

        {showActionSelection && !isLate && (
          <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderTop: '4px solid #6366f1' }}>
            <h3 style={{ color: '#312e81', marginBottom: '1rem', textAlign: 'center' }}>Pilih Aksi Absensi</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
              Anda memiliki beberapa absensi yang dapat dilakukan saat ini. Silakan pilih salah satu:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {availableActions.map((actionItem, idx) => (
                <div key={idx} style={{ border: '1px solid #e0e7ff', borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#3730a3' }}>{actionItem.shift_name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {actionItem.start_time.substring(0,5)} — {actionItem.end_time.substring(0,5)}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSelectAction(actionItem)} 
                    className="btn btn-primary" 
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    {actionItem.action === 'IN' ? 'Masuk' : 'Pulang'}
                  </button>
                </div>
              ))}
            </div>
            <button 
              type="button" 
              onClick={handleRetry} 
              className="btn" 
              style={{ width: '100%', marginTop: '1.5rem', backgroundColor: '#e2e8f0', color: '#475569' }}
            >
              Batal
            </button>
          </div>
        )}

        {showConfirm && previewData && !isLate && (
          <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderTop: '4px solid #38bdf8' }}>
            <h3 style={{ color: '#0f172a', marginBottom: '1rem', textAlign: 'center' }}>Konfirmasi Absen</h3>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center', fontSize: '1rem' }}>
              Anda akan Absen <strong>{previewData.action === 'IN' ? 'MASUK' : 'PULANG'}</strong> untuk Shift <strong>{previewData.shift_name}</strong>. Lanjutkan?
            </p>

            <form onSubmit={handleConfirmSubmit}>
              {previewData.is_early_checkout && (
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label style={{ color: '#d97706', fontWeight: 'bold' }}>Alasan Pulang Cepat (Wajib)</label>
                  <textarea 
                    className="form-control" 
                    rows="3" 
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Contoh: Izin urusan keluarga, dll."
                    required
                  ></textarea>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button" 
                  onClick={handleRetry} 
                  className="btn" 
                  style={{ flex: 1, backgroundColor: '#e2e8f0', color: '#475569' }}
                  disabled={isSubmittingReason}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1 }}
                  disabled={isSubmittingReason || (previewData.is_early_checkout && !reason.trim())}
                >
                  {isSubmittingReason ? 'Menyimpan...' : 'Ya, Lanjutkan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {!isLate && !showConfirm && (
          <div style={{ position: 'relative', width: '100%', maxWidth: '400px', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
            <div id="reader" style={{ width: '100%', minHeight: '300px' }}></div>
            {!isScanning && scanStatus !== 'Selesai' && !error && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}>
                <p>{scanStatus}</p>
              </div>
            )}
          </div>
        )}

        {(error || success) && !isLate && !showConfirm && (
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button type="button" onClick={() => navigate('/')} className="btn btn-primary" style={{ backgroundColor: '#64748b' }}>Kembali ke Dashboard</button>
            <button type="button" onClick={handleRetry} className="btn btn-primary">Scan Ulang</button>
          </div>
        )}
      </main>
    </div>
  );
}
