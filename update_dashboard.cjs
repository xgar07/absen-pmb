const fs = require('fs');

let content = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8');

// ==== PRIORITY 1 ====
content = content.replace(
  `<thead><tr><th>Nama Panitia</th><th>Waktu Absen (WIB)</th><th>Status</th></tr></thead>`,
  `<thead><tr><th>Nama Panitia</th><th>Waktu Absen (WIB)</th><th>Status</th><th>Keterangan</th></tr></thead>`
);

content = content.replace(
  `<td><span className={row.attendance ? 'badge-hadir' : 'badge-belum'}>{row.attendance ? 'Hadir' : 'Belum Absen'}</span></td>`,
  `<td>
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
                        </td>`
);

content = content.replace(
  `<span className="badge-hadir" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem' }}>HADIR</span>
                    <p style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1.5rem' }}>{formatTimeWIB(attendanceData.waktu_absen)}</p>`,
  `{attendanceData.late_status === 'terlambat' ? (
                      <span className="badge-belum" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem', backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>TERLAMBAT</span>
                    ) : (
                      <span className="badge-hadir" style={{ fontSize: '1.2rem', padding: '0.5rem 1.5rem' }}>TEPAT WAKTU</span>
                    )}
                    <p style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1.5rem' }}>{formatTimeWIB(attendanceData.waktu_absen)}</p>
                    {attendanceData.late_reason && <p style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', marginTop: '0.5rem' }}>"{attendanceData.late_reason}"</p>}`
);

// ==== PRIORITY 2-4 STATES ====
content = content.replace(
  "const [taskFormData, setTaskFormData] = useState({ title: '', description: '', deadline: '' });",
  `const [taskFormData, setTaskFormData] = useState({ title: '', description: '', deadline: '' });
  const [myActivityTasks, setMyActivityTasks] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [taskHistoryLogs, setTaskHistoryLogs] = useState([]);`
);

// ==== PANITIA FETCH ====
content = content.replace(
  `const { data: tasksData } = await supabase.from('tasks').select('*, profiles:current_pic_id(full_name)').order('deadline', { ascending: true }).order('created_at', { ascending: false });`,
  `const { data: tasksData } = await supabase.from('tasks').select('*, profiles:last_updated_by(full_name)').neq('status', 'completed').order('deadline', { ascending: true }).order('created_at', { ascending: false });

        // Priority 4: Tasks I Interacted With
        const { data: interactedTasksData } = await supabase.from('task_progress_logs').select('task_id').eq('user_id', user.id);
        const interactedIds = [...new Set((interactedTasksData || []).map(log => log.task_id))];
        if (interactedIds.length > 0) {
          const { data: myActivityTasksData } = await supabase.from('tasks').select('*, profiles:last_updated_by(full_name)').in('id', interactedIds).order('updated_at', { ascending: false });
          setMyActivityTasks(myActivityTasksData || []);
        } else {
          setMyActivityTasks([]);
        }`
);

// ==== DOSEN FETCH ====
content = content.replace(
  `const { data: tasksData } = await supabase.from('tasks').select('*, profiles:current_pic_id(full_name)').order('deadline', { ascending: true }).order('created_at', { ascending: false });`,
  `const { data: tasksData } = await supabase.from('tasks').select('*, profiles:last_updated_by(full_name)').order('deadline', { ascending: true }).order('created_at', { ascending: false });

        // Priority 3: History for Dosen
        const [allAttRes, allLogsRes] = await Promise.all([
          supabase.from('attendance').select('*, profiles:panitia_id(full_name)').order('waktu_absen', { ascending: false }).limit(100),
          supabase.from('task_progress_logs').select('*, tasks:task_id(title, status, created_at), profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(200)
        ]);
        setAttendanceHistory(allAttRes.data || []);
        setTaskHistoryLogs(allLogsRes.data || []);`
);

// ==== TASK UI (REPLACE "PIC" WITH "Terakhir Diupdate") ====
content = content.replace(/profiles\?\.full_name \|\| 'Belum ada PIC'/g, "profiles?.full_name || 'Belum ada'");
content = content.replace(/👤 PIC:/g, "👤 Terakhir Diupdate:");
content = content.replace(/👤 PIC Aktif:/g, "👤 Terakhir Diupdate:");

// ==== TASK MODAL UI ====
const oldModal = `{taskModalMode === 'detail_panitia' && (
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
                )}`;

const newModal = `{taskModalMode === 'detail_panitia' && (
                  <div style={{ marginBottom: '2rem' }}>
                    {selectedTask.status !== 'completed' ? (
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
                        <p style={{ marginBottom: '1rem', color: 'var(--success-color, #10b981)', fontWeight: 'bold' }}>Tugas ini sudah selesai.</p>
                      </div>
                    )}
                  </div>
                )}`;

content = content.replace(oldModal, newModal);

// ==== TASK HISTORY LOG IN MODAL ====
content = content.replace(
  `Progress: {log.progress_percent}%</div>`,
  `Progress: {log.progress_percent}%</div>
                      {log.previous_status && log.new_status && log.previous_status !== log.new_status && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Status: {log.previous_status.replace('_', ' ')} &rarr; {log.new_status.replace('_', ' ')}</div>
                      )}`
);

// ==== PANITIA "KEGIATAN SAYA" -> "RIWAYAT TASK" ====
const oldKegiatanSaya = `<h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>KEGIATAN SAYA</h3>
                <div className="event-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {events.map(event => (
                    <div key={event.id} className="event-card">
                      <h3>{event.name}</h3>
                      <p>📅 {formatDate(event.date)}</p>
                      <p>⏰ {formatTime(event.start_time)} - {formatTime(event.end_time)}</p>
                    </div>
                  ))}
                  {events.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada penugasan kegiatan.</p>}
                </div>`;

const newKegiatanSaya = `<h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>KEGIATAN SAYA (Riwayat Task)</h3>
                <div className="event-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {myActivityTasks.map(task => (
                    <div key={task.id} className="task-card">
                      <div className="task-header">
                        <h3 className="task-title">{task.title}</h3>
                        <span className={\`task-status status-\${task.status}\`}>{task.status.replace('_', ' ')}</span>
                      </div>
                      <p className="task-desc">{task.description}</p>
                      <button type="button" onClick={() => openTaskDetail(task, 'detail_panitia')} className="btn btn-primary btn-small" style={{ marginTop: '1rem' }}>Buka Task</button>
                    </div>
                  ))}
                  {myActivityTasks.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada riwayat update task.</p>}
                </div>`;

content = content.replace(oldKegiatanSaya, newKegiatanSaya);

// ==== DOSEN RIWAYAT TUGAS DAN ABSENSI ====
content = content.replace(
  `{/* Phase C: MONITORING */}`,
  `{/* Phase E: RIWAYAT TUGAS */}
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

            {/* Phase C: MONITORING */}`
);

fs.writeFileSync('src/pages/Dashboard.jsx', content);
