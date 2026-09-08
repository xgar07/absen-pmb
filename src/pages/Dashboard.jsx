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
  const [progressFormData, setProgressFormData] = useState({ progress: 0, report: '' });

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
        const { data: tasksData } = await supabase.from('tasks').select('*, profiles:current_pic_id(full_name)').order('deadline', { ascending: true }).order('created_at', { ascending: false });
        setTasks(tasksData || []);
      } 
      else if (profileData.role === 'dosen') {
        // Monitoring
        const [profilesRes, attendancesRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name').eq('role', 'panitia'),
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
        const { data: tasksData } = await supabase.from('tasks').select('*, profiles:current_pic_id(full_name)').order('deadline', { ascending: true }).order('created_at', { ascending: false });
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
                      <span>👤 PIC: {task.profiles?.full_name || 'Belum ada PIC'}</span>
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

            {/* Phase C: MONITORING */}
            <h2 style={{ marginBottom: '1rem' }}>MONITORING ABSENSI HARI INI</h2>
            {monitoringData && (
              <div className="table-responsive">
                <table className="monitoring-table">
                  <thead><tr><th>Nama Panitia</th><th>Waktu Absen (WIB)</th><th>Status</th></tr></thead>
                  <tbody>
                    {monitoringData.map(row => (
                      <tr key={row.id}>
                        <td>{row.full_name}</td>
                        <td>{row.attendance ? formatTimeWIB(row.attendance.waktu_absen) : '-'}</td>
                        <td><span className={row.attendance ? 'badge-hadir' : 'badge-belum'}>{row.attendance ? 'Hadir' : 'Belum Absen'}</span></td>
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
                        <span>👤 {task.profiles?.full_name || 'Belum ada PIC'}</span>
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
                <p style={{ fontSize: '0.9rem' }}><strong>PIC Aktif:</strong> {selectedTask.profiles?.full_name || 'Belum ada PIC'}</p>

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
    </div>
  );
}
