export default function KpiSummary({ monitoringData, panitiaList }) {
  if (!monitoringData || !panitiaList) return null;
  
  const total = panitiaList.filter(p => p.is_active !== false).length;
  // A panitia is considered 'hadir' if they have an attendance record for today
  const hadir = monitoringData.filter(m => m.attendance).length;
  const terlambat = monitoringData.filter(m => m.attendance && m.attendance.late_status === 'terlambat').length;
  
  return (
    <div className="stat-cards-grid">
      <div className="stat-card">
        <h3>Hadir Hari Ini</h3>
        <p>{hadir} / {monitoringData.length}</p>
      </div>
      <div className="stat-card">
        <h3>Terlambat</h3>
        <p style={{ color: 'var(--error-color)' }}>{terlambat}</p>
      </div>
      <div className="stat-card">
        <h3>Total Panitia Aktif</h3>
        <p>{total}</p>
      </div>
    </div>
  );
}
