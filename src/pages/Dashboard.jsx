import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getJakartaDayBounds, formatTimeWIB } from '../utils/dateUtils';

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  
  // Phase C States
  const [attendanceData, setAttendanceData] = useState(null);
  const [monitoringData, setMonitoringData] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
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

        // Fetch Phase C Data based on Role
        const bounds = getJakartaDayBounds();

        if (profileData.role === 'panitia') {
          const { data: attData, error: attError } = await supabase
            .from('attendance')
            .select('*')
            .eq('panitia_id', user.id)
            .gte('waktu_absen', bounds.start)
            .lt('waktu_absen', bounds.end)
            .maybeSingle();
            
          if (attError) throw attError;
          setAttendanceData(attData);
        } 
        else if (profileData.role === 'dosen') {
          // Merge in frontend (profiles + attendance)
          const [profilesRes, attendancesRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name').eq('role', 'panitia'),
            supabase.from('attendance').select('*').gte('waktu_absen', bounds.start).lt('waktu_absen', bounds.end)
          ]);
          
          if (profilesRes.error) throw profilesRes.error;
          if (attendancesRes.error) throw attendancesRes.error;

          const merged = profilesRes.data.map(p => {
            const att = attendancesRes.data.find(a => a.panitia_id === p.id);
            return {
              ...p,
              attendance: att || null
            };
          });

          // Sort alphabetically by name
          merged.sort((a, b) => a.full_name.localeCompare(b.full_name));
          setMonitoringData(merged);
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error.message);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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
          <button type="button" onClick={handleLogout} className="btn btn-primary mt-md" style={{ width: 'auto' }}>
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
            <button type="button" onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </nav>

      <main className="dashboard-content container">
        {profile.role === 'dosen' ? (
          <div className="dashboard-placeholder dosen-view" style={{ padding: '2rem', display: 'block', textAlign: 'left' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>MONITORING ABSENSI HARI INI</h2>
            
            {monitoringData && (
              <>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <div className="stat-card">
                    <h3>Total Panitia</h3>
                    <p>{monitoringData.length}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Hadir</h3>
                    <p>{monitoringData.filter(m => m.attendance).length}</p>
                  </div>
                  <div className="stat-card">
                    <h3>Belum Absen</h3>
                    <p>{monitoringData.filter(m => !m.attendance).length}</p>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="monitoring-table">
                    <thead>
                      <tr>
                        <th>Nama Panitia</th>
                        <th>Waktu Absen (WIB)</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitoringData.map(row => (
                        <tr key={row.id}>
                          <td>{row.full_name}</td>
                          <td>{row.attendance ? formatTimeWIB(row.attendance.waktu_absen) : '-'}</td>
                          <td>
                            <span className={row.attendance ? 'badge-hadir' : 'badge-belum'}>
                              {row.attendance ? 'Hadir' : 'Belum Absen'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {monitoringData.length === 0 && (
                        <tr>
                          <td colSpan="3" className="text-center">Belum ada data panitia terdaftar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="dashboard-placeholder panitia-view" style={{ padding: '2rem' }}>
            <h2>DASHBOARD PANITIA</h2>
            <p>Selamat datang, {profile.full_name}.</p>
            
            <div className="attendance-section" style={{ marginTop: '2rem', padding: '2rem', backgroundColor: '#f1f5f9', borderRadius: '12px', width: '100%', maxWidth: '400px', margin: '2rem auto 0' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>ABSENSI HARI INI</h3>
              
              {attendanceData ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge-hadir" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem' }}>HADIR</span>
                  <p style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1.5rem' }}>
                    {formatTimeWIB(attendanceData.waktu_absen)}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge-belum" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem' }}>BELUM ABSEN</span>
                </div>
              )}
            </div>
            
            <div style={{ marginTop: '2rem' }}>
              <button type="button" onClick={() => navigate('/scan')} className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                📷 Scan Absen
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
