export default function PanitiaTable({ 
  panitiaList, 
  showInactive, 
  setShowInactive, 
  openCreatePanitiaModal, 
  openResetPasswordModal, 
  handleToggleActive, 
  handleQuickAssignShift, 
  shiftsList 
}) {
  return (
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
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button type="button" onClick={() => openResetPasswordModal(panitia)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--accent-color)', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Reset Password</button>
                      <button type="button" onClick={() => handleToggleActive(panitia)} className="btn btn-primary btn-small" style={{ backgroundColor: panitia.is_active ? 'var(--error-color)' : '#10b981', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                        {panitia.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <select 
                        onChange={(e) => handleQuickAssignShift(e.target.value, panitia.id)}
                        value=""
                        className="form-control" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 'auto', marginLeft: '0.5rem' }}
                      >
                        <option value="" disabled>+ Shift Hari Ini</option>
                        {shiftsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
