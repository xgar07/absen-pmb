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

  // Phase D States
  const [events, setEvents] = useState([]);
  const [panitiaList, setPanitiaList] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState({ id: null, name: '', date: '', start_time: '', end_time: '', selectedPanitia: [] });

  // Phase E States
  const [tasks, setTasks] = useState([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState('create'); // create, detail_dosen, detail_panitia
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskLogs, setTaskLogs] = useState([]);
  const [taskFormData, setTaskFormData] = useState({ title: '', description: '', deadline: '' });
  const [myActivityTasks, setMyActivityTasks] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [taskHistoryLogs, setTaskHistoryLogs] = useState([]);
  const [progressFormData, setProgressFormData] = useState({ progress: 0, report: '' });

  // Phase F States
  const [isPanitiaModalOpen, setIsPanitiaModalOpen] = useState(false);
  const [panitiaModalMode, setPanitiaModalMode] = useState('create');
  const [panitiaFormData, setPanitiaFormData] = useState({ nama: '', nim: '', username: '', password: '' });
  const [selectedPanitia, setSelectedPanitia] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        navigate('/login');
        return;
      }

      let { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();

      if (profileError && profileError.code === 'PGRST116') {
        await new Promise(r => setTimeout(r, 1000));
        const retry = await supabase.from('profiles').select('*').eq('id', user.id).single();
        profileData = retry.data;
        profileError = retry.error;
      }

      if (profileError) throw profileError;
      
      if (profileData.is_active === false) {
        await supabase.auth.signOut();
        window.alert('Akun Anda sedang dinonaktifkan oleh administrator.');
        navigate('/login');
        return;
      }

      setProfile(profileData);

      const bounds = getJakartaDayBounds();

      if (profileData.role === 'panitia') {
        // Attendance
        const { data: attData } = await supabase.from('attendance').select('*').eq('panitia_id', user.id).gte('waktu_absen', bounds.start).lt('waktu_absen', bounds.end).maybeSingle();
        setAttendanceData(attData);

        // Events
        const { data: eventsData } = await supabase.from('events').select('*').order('date', { ascending: true }).order('start_time', { ascending: true });
        setEvents(eventsData || []);

        // Tasks (Phase E) - Panitia sees all
        const { data: tasksData } = await supabase.from('tasks').select('*, profiles:last_updated_by(full_name)').neq('status', 'completed').order('deadline', { ascending: true }).order('created_at', { ascending: false });

        // Priority 4: Tasks I Interacted With
        const { data: interactedTasksData } = await supabase.from('task_progress_logs').select('task_id').eq('user_id', user.id);
        const interactedIds = [...new Set((interactedTasksData || []).map(log => log.task_id))];
        if (interactedIds.length > 0) {
          const { data: myActivityTasksData } = await supabase.from('tasks').select('*, profiles:last_updated_by(full_name)').in('id', interactedIds).order('updated_at', { ascending: false });
          setMyActivityTasks(myActivityTasksData || []);
        } else {
          setMyActivityTasks([]);
        }
        setTasks(tasksData || []);
      } 
      else if (profileData.role === 'dosen') {
        // Monitoring
        const [profilesRes, attendancesRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name, username, nim, is_active').eq('role', 'panitia'),
          supabase.from('attendance').select('*').gte('waktu_absen', bounds.start).lt('waktu_absen', bounds.end)
        ]);
        
        if (profilesRes.data) {
          const sortedProfiles = [...profilesRes.data].sort((a, b) => a.full_name.localeCompare(b.full_name));
          setPanitiaList(sortedProfiles);
          if (attendancesRes.data) {
            const merged = sortedProfiles.map(p => ({
              ...p,
              attendance: attendancesRes.data.find(a => a.panitia_id === p.id) || null
            }));
            setMonitoringData(merged);
          }
        }

        // Events
        const { data: eventsData } = await supabase.from('events').select('*, event_members (panitia_id)').order('date', { ascending: false }).order('start_time', { ascending: false });
        setEvents(eventsData || []);

        // Tasks (Phase E) - Dosen sees own
        const { data: tasksData } = await supabase.from('tasks').select('*, profiles:last_updated_by(full_name)').order('deadline', { ascending: true }).order('created_at', { ascending: false });

        // Priority 3: History for Dosen
        const [allAttRes, allLogsRes] = await Promise.all([
          supabase.from('attendance').select('*, profiles:panitia_id(full_name)').order('waktu_absen', { ascending: false }).limit(100),
          supabase.from('task_progress_logs').select('*, tasks:task_id(title, status, created_at), profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(200)
        ]);
        setAttendanceHistory(allAttRes.data || []);
        setTaskHistoryLogs(allLogsRes.data || []);
        setTasks(tasksData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error.message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  // ============================
  // PHASE D: EVENT LOGIC
  // ============================
  const openCreateModal = () => {
    setModalMode('create');
    setFormData({ id: null, name: '', date: '', start_time: '', end_time: '', selectedPanitia: [] });
    setFormError(''); setIsModalOpen(true);
  };
  const openEditModal = (event) => {
    setModalMode('edit');
    setFormData({ id: event.id, name: event.name, date: event.date, start_time: event.start_time, end_time: event.end_time, selectedPanitia: event.event_members ? event.event_members.map(em => em.panitia_id) : [] });
    setFormError(''); setIsModalOpen(true);
  };
  const handlePanitiaCheckbox = (id) => {
    setFormData(prev => ({ ...prev, selectedPanitia: prev.selectedPanitia.includes(id) ? prev.selectedPanitia.filter(pid => pid !== id) : [...prev.selectedPanitia, id] }));
  };
  const submitEvent = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      if (!formData.name || !formData.date || !formData.start_time || !formData.end_time) throw new Error('Semua field wajib diisi');
      if (formData.end_time <= formData.start_time) throw new Error('Waktu selesai salah');
      
      const payload = { name: formData.name, date: formData.date, start_time: formData.start_time, end_time: formData.end_time, created_by: profile.id };
      let newId = formData.id;

      if (modalMode === 'create') {
        const { data, error } = await supabase.from('events').insert(payload).select().single();
        if (error) throw error; newId = data.id;
      } else {
        const { error } = await supabase.from('events').update(payload).eq('id', newId);
        if (error) throw error;
      }
      if (modalMode === 'edit') {
        const { error } = await supabase.from('event_members').delete().eq('event_id', newId);
        if (error) throw error;
      }
      if (formData.selectedPanitia.length > 0) {
        const p = formData.selectedPanitia.map(pid => ({ event_id: newId, panitia_id: pid }));
        const { error } = await supabase.from('event_members').insert(p);
        if (error) throw error;
      }
      setIsModalOpen(false); fetchDashboardData(); 
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };
  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Hapus event?')) return;
    await supabase.from('events').delete().eq('id', id);
    fetchDashboardData();
  };

  // ============================
  // PHASE E: TASK LOGIC
  // ============================
  const openCreateTaskModal = () => {
    setTaskModalMode('create');
    setTaskFormData({ title: '', description: '', deadline: '' });
    setFormError(''); setIsTaskModalOpen(true);
  };

  const submitCreateTask = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      if (!taskFormData.title || !taskFormData.deadline) throw new Error('Judul dan Deadline wajib');
      const { error } = await supabase.from('tasks').insert({
        title: taskFormData.title, description: taskFormData.description, deadline: taskFormData.deadline, created_by: profile.id
      });
      if (error) throw error;
      setIsTaskModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };

  const openTaskDetail = async (task, mode) => {
    setFormError(''); setSelectedTask(task); setTaskModalMode(mode);
    setProgressFormData({ progress: task.progress_percent, report: '' });
    setIsTaskModalOpen(true);
    setTaskLogs([]);
    
    const { data } = await supabase.from('task_progress_logs').select('*, profiles:user_id(full_name)').eq('task_id', task.id).order('created_at', { ascending: false });
    setTaskLogs(data || []);
  };

  const handleClaimTask = async () => {
    setFormError(''); setFormLoading(true);
    try {
      const { data, error } = await supabase.rpc('claim_task', { p_task_id: selectedTask.id });
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      setIsTaskModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };

  const submitProgress = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      if (!progressFormData.report) throw new Error('Laporan wajib diisi');
      const prog = parseInt(progressFormData.progress);
      if (prog < 0 || prog > 100) throw new Error('Progress 0 - 100');
      
      const { data, error } = await supabase.rpc('add_task_progress', {
        p_task_id: selectedTask.id, p_progress: prog, p_report: progressFormData.report
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      setIsTaskModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Hapus task?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    fetchDashboardData();
  };

  // ============================
  // PHASE F: PANITIA MANAGEMENT
  // ============================
  const openCreatePanitiaModal = () => {
    setPanitiaModalMode('create');
    setPanitiaFormData({ nama: '', nim: '', username: '', password: '' });
    setFormError(''); setIsPanitiaModalOpen(true);
  };

  const openResetPasswordModal = (panitia) => {
    setPanitiaModalMode('reset');
    setSelectedPanitia(panitia);
    setPanitiaFormData({ nama: '', nim: '', username: panitia.username || '', password: '' });
    setFormError(''); setIsPanitiaModalOpen(true);
  };

  const submitPanitia = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      // Dapatkan session JWT aktif untuk header request (opsional, tapi supabase.functions.invoke otomatis mengirim auth token)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Sesi tidak valid. Silakan login kembali.');

      if (panitiaModalMode === 'create') {
        const { data, error } = await supabase.functions.invoke('auth-admin', {
          body: {
            action: 'create',
            username: panitiaFormData.username,
            password: panitiaFormData.password,
            nama: panitiaFormData.nama,
            nim: panitiaFormData.nim
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || data?.message || 'Gagal membuat akun');
      } else {
        const { data, error } = await supabase.functions.invoke('auth-admin', {
          body: {
            action: 'reset_password',
            user_id: selectedPanitia.id,
            password: panitiaFormData.password
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || data?.message || 'Gagal mereset password');
      }
      setIsPanitiaModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message || 'Terjadi kesalahan pada server'); } finally { setFormLoading(false); }
  };

  const handleToggleActive = async (panitia) => {
    const actionText = panitia.is_active ? 'Nonaktifkan' : 'Aktifkan';
    if (!window.confirm(`${actionText} akun ${panitia.full_name}? ${panitia.is_active ? 'Akun tidak dapat login, tetapi seluruh riwayat tetap disimpan.' : ''}`)) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('auth-admin', {
        body: { action: 'set_active', user_id: panitia.id, is_active: !panitia.is_active }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || data?.message);
      fetchDashboardData();
    } catch (err) {
      window.alert(err.message || 'Terjadi kesalahan pada server');
    }
  };

  // Formatting helpers
  const formatDate = (dateStr) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(dateStr));
  const formatTime = (timeStr) => timeStr.substring(0, 5) + ' WIB';

  if (loading) return <div className="dashboard-layout"><div className="dashboard-content"><p>Memuat...</p></div></div>;
  if (!profile) return <div className="dashboard-layout"><div className="dashboard-content"><button onClick={handleLogout} className="btn btn-primary">Logout</button></div></div>;

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
          <div className="dashboard-placeholder dosen-view" style={{ padding: '2rem', display: 'block', textAlign: 'left', border: 'none' }}>
            
            {/* Phase E: TASK / ASSIGNMENT */}
            <div className="task-section" style={{ marginTop: 0, marginBottom: '4rem' }}>
              <div className="event-header">
                <h2>TASK / ASSIGNMENT</h2>
                <button type="button" onClick={openCreateTaskModal} className="btn btn-primary" style={{ width: 'auto' }}>+ Buat Task</button>
              </div>
              <div className="event-grid">
                {tasks.map(task => (
                  <div key={task.id} className="task-card">
                    <div className="task-header">
                      <h3 className="task-title">{task.title}</h3>
                      <span className={`task-status status-${task.status}`}>{task.status.replace('_', ' ')}</span>
                    </div>
                    <p className="task-desc">{task.description}</p>
                    <div className="task-meta">
                      <span>📅 Deadline: {formatDate(task.deadline)}</span>
                      <span>👤 Terakhir Diupdate: {task.profiles?.full_name || 'Belum ada'}</span>
                    </div>
                    <div className="progress-container"><div className="progress-bar" style={{ width: `${task.progress_percent}%` }}></div></div>
                    <span style={{ fontSize: '0.8rem', textAlign: 'right' }}>{task.progress_percent}%</span>
                    
                    <div className="task-actions" style={{ marginTop: '1rem' }}>
                      <button type="button" onClick={() => openTaskDetail(task, 'detail_dosen')} className="btn btn-primary btn-small">Lihat Detail</button>
                      <button type="button" onClick={() => handleDeleteTask(task.id)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--error-color)' }}>Hapus</button>
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada task.</p>}
              </div>
            </div>

            {/* Phase D: EVENT MANAGEMENT */}
            <div className="event-section" style={{ marginTop: 0, marginBottom: '4rem' }}>
              <div className="event-header">
                <h2>EVENT MANAGEMENT</h2>
                <button type="button" onClick={openCreateModal} className="btn btn-primary" style={{ width: 'auto' }}>+ Buat Event</button>
              </div>
              <div className="event-grid">
                {events.map(event => (
                  <div key={event.id} className="event-card">
                    <h3>{event.name}</h3>
                    <p>📅 {formatDate(event.date)}</p>
                    <p>⏰ {formatTime(event.start_time)} - {formatTime(event.end_time)}</p>
                    <p>👥 {event.event_members?.length || 0} Panitia Ditugaskan</p>
                    <div className="event-card-actions">
                      <button type="button" onClick={() => openEditModal(event)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--accent-color)' }}>Edit</button>
                      <button type="button" onClick={() => handleDeleteEvent(event.id)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--error-color)' }}>Hapus</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Phase F: MANAJEMEN PANITIA */}
            <div className="event-section" style={{ marginTop: 0, marginBottom: '4rem' }}>
              <div className="event-header">
                <h2>MANAJEMEN PANITIA</h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ marginRight: '0.5rem' }} />
                    Tampilkan Panitia Nonaktif
                  </label>
                  <button type="button" onClick={openCreatePanitiaModal} className="btn btn-primary" style={{ width: 'auto' }}>+ Tambah Panitia</button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="monitoring-table">
                  <thead><tr><th>Nama</th><th>Username</th><th>NIM</th><th>Status</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {panitiaList.filter(p => showInactive || p.is_active !== false).map(panitia => (
                      <tr key={panitia.id}>
                        <td>{panitia.full_name}</td>
                        <td>{panitia.username || '-'}</td>
                        <td>{panitia.nim || '-'}</td>
                        <td>
                          {panitia.is_active === false ? <span style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>○ NONAKTIF</span> : <span style={{ color: 'var(--success-color, #10b981)', fontWeight: 'bold' }}>● AKTIF</span>}
                        </td>
                        <td>
                          {panitia.username && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button type="button" onClick={() => openResetPasswordModal(panitia)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--accent-color)', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Reset Password</button>
                              <button type="button" onClick={() => handleToggleActive(panitia)} className="btn btn-primary btn-small" style={{ backgroundColor: panitia.is_active ? 'var(--error-color)' : '#10b981', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                                {panitia.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Phase E: RIWAYAT TUGAS */}
            <div className="event-section" style={{ marginTop: 0, marginBottom: '4rem' }}>
              <div className="event-header">
                <h2>RIWAYAT TUGAS (AUDIT LOG)</h2>
              </div>
              <div className="history-timeline" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                {taskHistoryLogs.map(log => {
                  const createdDate = new Date(log.tasks?.created_at || log.created_at);
                  const isOldIncomplete = log.tasks?.status !== 'completed' && createdDate < new Date(new Date().setHours(0,0,0,0));
                  return (
                    <div key={log.id} className="history-item" style={{ borderLeftColor: isOldIncomplete ? '#ef4444' : '#3b82f6', backgroundColor: isOldIncomplete ? '#fef2f2' : 'transparent', padding: isOldIncomplete ? '0.5rem 1rem' : '0 0 0 1rem', borderRadius: '0 8px 8px 0', marginBottom: '1rem' }}>
                      <div className="history-meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <strong style={{ color: 'var(--primary-color)' }}>{log.profiles?.full_name}</strong>
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>mengupdate task: <strong>{log.tasks?.title}</strong></span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(log.created_at).toLocaleString('id-ID')}</span>
                      </div>
                      {isOldIncomplete && <div style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>⚠️ Tugas lintas hari belum selesai</div>}
                      {log.previous_status && log.new_status && log.previous_status !== log.new_status && (
                        <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Status: {log.previous_status.replace('_', ' ')} &rarr; <strong>{log.new_status.replace('_', ' ')}</strong></div>
                      )}
                      <p className="history-report" style={{ marginTop: '0.5rem' }}>Catatan: "{log.report}"</p>
                    </div>
                  );
                })}
                {taskHistoryLogs.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada riwayat update task.</p>}
              </div>
            </div>

            {/* RIWAYAT ABSENSI */}
            <div className="event-section" style={{ marginTop: 0, marginBottom: '4rem' }}>
              <div className="event-header">
                <h2>RIWAYAT ABSENSI KESELURUHAN</h2>
              </div>
              <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="monitoring-table">
                  <thead><tr><th>Tanggal & Waktu</th><th>Nama Panitia</th><th>Status</th><th>Keterangan</th></tr></thead>
                  <tbody>
                    {attendanceHistory.map(row => (
                      <tr key={row.id}>
                        <td>{new Date(row.waktu_absen).toLocaleString('id-ID')} WIB</td>
                        <td>{row.profiles?.full_name || 'Unknown'}</td>
                        <td>
                          {row.late_status === 'terlambat' ? 
                            <span className="badge-belum" style={{ backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>Terlambat</span> : 
                            <span className="badge-hadir">Tepat Waktu</span>
                          }
                        </td>
                        <td style={{ maxWidth: '200px', wordWrap: 'break-word', fontSize: '0.9rem' }}>{row.late_reason || '-'}</td>
                      </tr>
                    ))}
                    {attendanceHistory.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada riwayat absensi.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Phase C: MONITORING */}
            <h2 style={{ marginBottom: '1rem' }}>MONITORING ABSENSI HARI INI</h2>
            {monitoringData && (
              <div className="table-responsive">
                <table className="monitoring-table">
                  <thead><tr><th>Nama Panitia</th><th>Waktu Absen (WIB)</th><th>Status</th><th>Keterangan</th></tr></thead>
                  <tbody>
                    {monitoringData.map(row => (
                      <tr key={row.id}>
                        <td>{row.full_name}</td>
                        <td>{row.attendance ? formatTimeWIB(row.attendance.waktu_absen) : '-'}</td>
                        <td>
                          {row.attendance ? (
                            row.attendance.late_status === 'terlambat' ? 
                              <span className="badge-belum" style={{ backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>Terlambat</span> : 
                              <span className="badge-hadir">Tepat Waktu</span>
                          ) : (
                            <span className="badge-belum">Belum Absen</span>
                          )}
                        </td>
                        <td style={{ maxWidth: '200px', wordWrap: 'break-word', fontSize: '0.9rem' }}>
                          {row.attendance?.late_reason || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="dashboard-placeholder panitia-view" style={{ padding: '2rem', display: 'block', textAlign: 'left', border: 'none' }}>
            <h2>DASHBOARD PANITIA</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Selamat datang, {profile.full_name}.</p>
            
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              
              {/* Phase C: ABSENSI HARI INI */}
              <div className="attendance-section" style={{ marginTop: '2rem', padding: '2rem', backgroundColor: '#f1f5f9', borderRadius: '12px', flex: '1', minWidth: '300px' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem', textAlign: 'center' }}>ABSENSI HARI INI</h3>
                {attendanceData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge-hadir" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem' }}>HADIR</span>
                    <p style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1.5rem' }}>{formatTimeWIB(attendanceData.waktu_absen)}</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge-belum" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem' }}>BELUM ABSEN</span>
                  </div>
                )}
                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                  <button type="button" onClick={() => navigate('/scan')} className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>📷 Scan Absen</button>
                </div>
              </div>

              {/* Phase E: TASK / WORKBOARD */}
              <div className="task-section" style={{ flex: '2', minWidth: '300px', marginTop: '2rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>TASK / WORKBOARD</h3>
                <div className="event-grid">
                  {tasks.map(task => (
                    <div key={task.id} className="task-card">
                      <div className="task-header">
                        <h3 className="task-title">{task.title}</h3>
                        <span className={`task-status status-${task.status}`}>{task.status.replace('_', ' ')}</span>
                      </div>
                      <p className="task-desc">{task.description}</p>
                      <div className="task-meta">
                        <span>📅 {formatDate(task.deadline)}</span>
                        <span>👤 {task.profiles?.full_name || 'Belum ada'}</span>
                      </div>
                      <div className="progress-container"><div className="progress-bar" style={{ width: `${task.progress_percent}%` }}></div></div>
                      <span style={{ fontSize: '0.8rem', textAlign: 'right' }}>{task.progress_percent}%</span>
                      <button type="button" onClick={() => openTaskDetail(task, 'detail_panitia')} className="btn btn-primary btn-small" style={{ marginTop: '1rem' }}>Buka Task</button>
                    </div>
                  ))}
                  {tasks.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada task tersedia.</p>}
                </div>
              </div>

              {/* Phase D: EVENT / KEGIATAN */}
              <div className="event-section" style={{ flex: '1', minWidth: '300px', marginTop: '2rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>KEGIATAN SAYA</h3>
                <div className="event-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {events.map(event => (
                    <div key={event.id} className="event-card">
                      <h3>{event.name}</h3>
                      <p>📅 {formatDate(event.date)}</p>
                      <p>⏰ {formatTime(event.start_time)} - {formatTime(event.end_time)}</p>
                    </div>
                  ))}
                  {events.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada penugasan kegiatan.</p>}
                </div>
              </div>
              
            </div>
          </div>
        )}
      </main>

      {/* Modal Phase D: Events */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '1.5rem' }}>{modalMode === 'create' ? 'Buat Event Baru' : 'Edit Event'}</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={submitEvent}>
              <div className="form-group">
                <label>Nama Kegiatan</label>
                <input type="text" className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Tanggal</label>
                <input type="date" className="form-control" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Waktu Mulai</label>
                  <input type="time" className="form-control" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Waktu Selesai</label>
                  <input type="time" className="form-control" value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} required />
                </div>
              </div>
              <div className="form-group">
                <label>Tugaskan Panitia</label>
                <div className="checkbox-list">
                  {panitiaList.map(panitia => (
                    <label key={panitia.id} className="radio-label">
                      <input type="checkbox" checked={formData.selectedPanitia.includes(panitia.id)} onChange={() => handlePanitiaCheckbox(panitia.id)} />
                      {panitia.full_name}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Phase E: Tasks */}
      {isTaskModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            
            {taskModalMode === 'create' ? (
              <>
                <h2 style={{ marginBottom: '1.5rem' }}>Buat Task Baru</h2>
                {formError && <div className="alert alert-error">{formError}</div>}
                <form onSubmit={submitCreateTask}>
                  <div className="form-group">
                    <label>Judul Task</label>
                    <input type="text" className="form-control" value={taskFormData.title} onChange={e => setTaskFormData({...taskFormData, title: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Deskripsi</label>
                    <textarea className="form-control" value={taskFormData.description} onChange={e => setTaskFormData({...taskFormData, description: e.target.value})} rows="3"></textarea>
                  </div>
                  <div className="form-group">
                    <label>Deadline</label>
                    <input type="date" className="form-control" value={taskFormData.deadline} onChange={e => setTaskFormData({...taskFormData, deadline: e.target.value})} required />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                    <button type="button" onClick={() => setIsTaskModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                    <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Simpan'}</button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h2 style={{ marginBottom: '0.5rem', color: 'var(--primary-color)' }}>{selectedTask.title}</h2>
                <span className={`task-status status-${selectedTask.status}`}>{selectedTask.status.replace('_', ' ')}</span>
                <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>{selectedTask.description}</p>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}><strong>Deadline:</strong> {formatDate(selectedTask.deadline)}</p>
                <p style={{ fontSize: '0.9rem' }}><strong>PIC Aktif:</strong> {selectedTask.profiles?.full_name || 'Belum ada'}</p>

                <div style={{ margin: '1.5rem 0', borderTop: '1px solid var(--border-color)' }}></div>

                {taskModalMode === 'detail_panitia' && (
                  <div style={{ marginBottom: '2rem' }}>
                    {selectedTask.current_pic_id === profile.id ? (
                      <form onSubmit={submitProgress} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                        <h4 style={{ marginBottom: '1rem' }}>Update Progress</h4>
                        {formError && <div className="alert alert-error">{formError}</div>}
                        <div className="form-group">
                          <label>Progress (%)</label>
                          <input type="number" min="0" max="100" className="form-control" value={progressFormData.progress} onChange={e => setProgressFormData({...progressFormData, progress: e.target.value})} required />
                        </div>
                        <div className="form-group">
                          <label>Laporan / Catatan</label>
                          <textarea className="form-control" value={progressFormData.report} onChange={e => setProgressFormData({...progressFormData, report: e.target.value})} rows="2" required></textarea>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Submit Progress'}</button>
                      </form>
                    ) : (
                      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                        {formError && <div className="alert alert-error">{formError}</div>}
                        <p style={{ marginBottom: '1rem' }}>Anda bukan PIC aktif untuk task ini.</p>
                        <button type="button" onClick={handleClaimTask} className="btn btn-primary" disabled={formLoading}>
                          {selectedTask.current_pic_id ? 'Ambil Alih Tugas' : 'Ambil Tugas'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <h3 style={{ fontSize: '1.1rem' }}>History Progress</h3>
                <div className="history-timeline">
                  {taskLogs.length > 0 ? taskLogs.map(log => (
                    <div key={log.id} className="history-item">
                      <div className="history-meta">
                        <strong>{log.profiles?.full_name}</strong>
                        <span>{new Date(log.created_at).toLocaleString('id-ID')}</span>
                      </div>
                      <div style={{ color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '0.85rem' }}>Progress: {log.progress_percent}%</div>
                      {log.previous_status && log.new_status && log.previous_status !== log.new_status && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Status: {log.previous_status.replace('_', ' ')} &rarr; {log.new_status.replace('_', ' ')}</div>
                      )}
                      <p className="history-report">{log.report}</p>
                    </div>
                  )) : (
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Belum ada progress.</p>
                  )}
                </div>

                <div style={{ marginTop: '2rem', textAlign: 'right' }}>
                  <button type="button" onClick={() => setIsTaskModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Tutup</button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Modal Phase F: Panitia Management */}
      {isPanitiaModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '1.5rem' }}>{panitiaModalMode === 'create' ? 'Tambah Akun Panitia' : `Reset Password: ${selectedPanitia?.full_name}`}</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={submitPanitia}>
              {panitiaModalMode === 'create' && (
                <>
                  <div className="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" className="form-control" value={panitiaFormData.nama} onChange={e => setPanitiaFormData({...panitiaFormData, nama: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>NIM</label>
                    <input type="text" className="form-control" value={panitiaFormData.nim} onChange={e => setPanitiaFormData({...panitiaFormData, nim: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Username (ID Login)</label>
                    <input type="text" className="form-control" value={panitiaFormData.username} onChange={e => setPanitiaFormData({...panitiaFormData, username: e.target.value})} required />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>{panitiaModalMode === 'create' ? 'Password Awal' : 'Password Baru'}</label>
                <input type="password" minLength="6" className="form-control" value={panitiaFormData.password} onChange={e => setPanitiaFormData({...panitiaFormData, password: e.target.value})} required />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setIsPanitiaModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
