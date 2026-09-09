export default function TaskList({ tasks, formatDate, openTaskDetail }) {
  return (
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
  );
}
