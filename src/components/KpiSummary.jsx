export default function KpiSummary({ monitoringData }) {
  if (!monitoringData) return null;

  // Hitung unik berdasarkan id panitia, bukan jumlah baris shift
  const scheduledIds = new Set(monitoringData.map(m => m.id));
  const totalScheduled = scheduledIds.size;

  const hadirIds = new Set(monitoringData.filter(m => m.in_record).map(m => m.id));
  const hadir = hadirIds.size;

  const terlambat = monitoringData.filter(m => m.in_record?.late_status === 'terlambat').length;

  return (
    <div className="stat-cards-grid">
      <div className="stat-card">
        <h3>Hadir Hari Ini</h3>
        <p>{hadir} / {totalScheduled}</p>
      </div>
      <div className="stat-card">
        <h3>Terlambat</h3>
        <p style={{ color: 'var(--error-color)' }}>{terlambat}</p>
      </div>
      <div className="stat-card">
        <h3>Total Terjadwal Hari Ini</h3>
        <p>{totalScheduled}</p>
      </div>
    </div>
  );
}
