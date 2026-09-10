export default function KpiSummary({ monitoringData }) {
  if (!monitoringData) return null;

  // Hitung unik berdasarkan id panitia, bukan jumlah baris shift
  const scheduledIds = new Set(monitoringData.map(m => m.id));
  const totalScheduled = scheduledIds.size;

  const hadirIds = new Set(monitoringData.filter(m => m.in_record).map(m => m.id));
  const hadir = hadirIds.size;

  const terlambat = monitoringData.filter(m => m.in_record?.late_status === 'terlambat').length;

  const belumIds = new Set(monitoringData.filter(m => !m.in_record).map(m => m.id));
  const belumAbsen = belumIds.size;

  return (
    <div className="stat-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
      <div className="stat-card" style={{ borderLeft: '4px solid #10b981', padding: '1.5rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Hadir Hari Ini</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>{hadir} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>/ {totalScheduled}</span></p>
      </div>
      <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b', padding: '1.5rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Belum Absen</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>{belumAbsen}</p>
      </div>
      <div className="stat-card" style={{ borderLeft: '4px solid #ef4444', padding: '1.5rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Terlambat</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: 'var(--error-color)' }}>{terlambat}</p>
      </div>
      <div className="stat-card" style={{ borderLeft: '4px solid var(--primary-color)', padding: '1.5rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Terjadwal</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>{totalScheduled}</p>
      </div>
    </div>
  );
}
