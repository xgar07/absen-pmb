import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let loginEmail = formData.identifier.trim();
      
      // Jika tidak mengandung '@', asumsikan ini adalah username panitia
      if (!loginEmail.includes('@')) {
        loginEmail = `${loginEmail.toLowerCase()}@panitia.pmb.local`;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: formData.password,
      });

      if (authError) throw authError;

      // Cek is_active
      if (data?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.user.id)
          .single();
        
        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          throw new Error('Akun Anda sedang dinonaktifkan oleh administrator.');
        }
      }

      // Berhasil login, arahkan ke dashboard
      navigate('/');
    } catch (err) {
      setError(err.message || 'Username/Email atau password salah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Login</h1>
        <p>Sistem Absensi & Akuntabilitas PMB</p>
        
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="identifier">Username (Panitia) / Email (Dosen)</label>
            <input
              type="text"
              id="identifier"
              name="identifier"
              className="form-control"
              value={formData.identifier}
              onChange={handleChange}
              required
              placeholder="Masukkan username atau email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              className="form-control"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Masukkan password Anda"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>

        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>PC meja pendaftaran?</p>
          <Link to="/kiosk" className="btn btn-primary" style={{ backgroundColor: '#0f172a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            🖥️ Buka Attendance Kiosk
          </Link>
        </div>
      </div>
    </div>
  );
}
