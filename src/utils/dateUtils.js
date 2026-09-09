export const getJakartaDayBounds = () => {
  // Gunakan formatToParts untuk mengambil tahun, bulan, dan hari di zona waktu Jakarta
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  // Format menjadi YYYY-MM-DD
  const dateStr = `${year}-${month}-${day}`;
  
  // Awal hari ini di Jakarta (UTC+7)
  const startOfDay = new Date(`${dateStr}T00:00:00+07:00`);
  
  // Awal hari berikutnya di Jakarta (24 jam kemudian)
  const startOfNextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  
  return { 
    start: startOfDay.toISOString(), 
    end: startOfNextDay.toISOString(),
    dateStr
  };
};

export const formatTimeWIB = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `${formatter.format(date)} WIB`;
};
