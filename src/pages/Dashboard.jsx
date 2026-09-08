import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          navigate('/login');
          return;
        }

        let { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError && profileError.code === 'PGRST116') {
          // Retry once after 1 second to handle race condition during register
          await new Promise(r => setTimeout(r, 1000));
          const retry = await supabase.from('profiles').select('*').eq('id', user.id).single();
          profileData = retry.data;
          profileError = retry.error;
        }

        if (profileError) throw profileError;

        setProfile(profileData);
      } catch (error) {
        console.error('Error fetching profile:', error.message);
        // Do NOT navigate to /login here to prevent infinite loop.
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="dashboard-layout">
        <div className="dashboard-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <p>Memuat data...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="dashboard-layout">
        <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="alert alert-error text-center" style={{ maxWidth: '400px' }}>
            <p><strong>Profil tidak ditemukan!</strong></p>
            <p style={{ marginTop: '0.5rem' }}>Data profil Anda tidak dapat dimuat atau belum dibuat.</p>
          </div>
          <button onClick={handleLogout} className="btn btn-primary mt-md" style={{ width: 'auto' }}>
            Logout & Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <nav className="navbar">
        <div className="container">
          <div className="navbar-brand">Sistem PMB</div>
          
          <div className="user-menu">
            <span className="user-name">{profile.full_name}</span>
            <span className="user-role">{profile.role}</span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </nav>

      <main className="dashboard-content container">
        {profile.role === 'dosen' ? (
          <div className="dashboard-placeholder dosen-view">
            <h2>DASHBOARD DOSEN</h2>
            <p>Selamat datang, {profile.full_name}. Ini adalah halaman untuk memantau tugas dan absensi panitia.</p>
            <p className="mt-md" style={{ color: 'var(--text-secondary)' }}>(Fitur riwayat absensi & pembuatan tugas akan hadir di Fase selanjutnya)</p>
          </div>
        ) : (
          <div className="dashboard-placeholder panitia-view">
            <h2>DASHBOARD PANITIA</h2>
            <p>Selamat datang, {profile.full_name}. Ini adalah halaman untuk scan absen dan melihat tugas hari ini.</p>
            
            <div style={{ marginTop: '2rem' }}>
              <button onClick={() => navigate('/scan')} className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                📷 Scan Absen
              </button>
            </div>

            <p className="mt-md" style={{ color: 'var(--text-secondary)' }}>(Fitur list tugas akan hadir di Fase selanjutnya)</p>
          </div>
        )}
      </main>
    </div>
  );
}
