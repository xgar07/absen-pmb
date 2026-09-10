import { useState } from 'react';

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
  const [openMenuId, setOpenMenuId] = useState(null);

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
      <div className="table-responsive" style={{ overflow: 'visible' }}>
        <table className="monitoring-table">
          <thead><tr><th>Nama</th><th>Username</th><th>NIM</th><th>Status</th><th style={{ width: '100px', textAlign: 'center' }}>Aksi</th></tr></thead>
          <tbody>
            {panitiaList.filter(p => showInactive || p.is_active !== false).map(panitia => (
              <tr key={panitia.id}>
                <td>{panitia.full_name}</td>
                <td>{panitia.username || '-'}</td>
                <td>{panitia.nim || '-'}</td>
                <td>
                  {panitia.is_active === false ? <span style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>○ NONAKTIF</span> : <span style={{ color: 'var(--success-color, #10b981)', fontWeight: 'bold' }}>● AKTIF</span>}
                </td>
                <td style={{ textAlign: 'center', position: 'relative' }}>
                  {panitia.username && (
                    <div style={{ display: 'inline-block' }}>
                      <button 
                        type="button" 
                        onClick={() => setOpenMenuId(openMenuId === panitia.id ? null : panitia.id)} 
                        style={{ background: 'none', border: '1px solid #e2e8f0', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)' }}
                      >
                        ⋯
                      </button>
                      {openMenuId === panitia.id && (
                        <>
                          <div 
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} 
                            onClick={() => setOpenMenuId(null)} 
                          />
                          <div style={{ position: 'absolute', right: '50%', transform: 'translateX(50%)', top: '100%', marginTop: '4px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 10, minWidth: '160px', padding: '0.5rem 0', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.25rem', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Kelola Shift</div>
                            {shiftsList.map(s => (
                              <button key={s.id} onClick={() => { handleQuickAssignShift(s.id, panitia.id); setOpenMenuId(null); }} style={{ background: 'none', border: 'none', padding: '0.5rem 1rem', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--primary-color)' }}>+ {s.name}</button>
                            ))}
                            <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.25rem 0' }} />
                            <button onClick={() => { openResetPasswordModal(panitia); setOpenMenuId(null); }} style={{ background: 'none', border: 'none', padding: '0.5rem 1rem', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}>Reset Password</button>
                            <button onClick={() => { handleToggleActive(panitia); setOpenMenuId(null); }} style={{ background: 'none', border: 'none', padding: '0.5rem 1rem', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: panitia.is_active ? 'var(--error-color)' : '#10b981' }}>{panitia.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                          </div>
                        </>
                      )}
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
