const getDressCode = (dateStr, settings = []) => {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  const localDate = new Date(year, month - 1, day);
  const dayOfWeek = localDate.getDay(); 
  
  // Find the Monday of the current week
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayDate = new Date(localDate);
  mondayDate.setDate(localDate.getDate() + diffToMonday);
  
  const mondayYear = mondayDate.getFullYear();
  const mondayMonth = mondayDate.getMonth() + 1; // 1-12
  const mondayDay = mondayDate.getDate();
  
  // The week number relative to the Monday's month
  const weekOfMonth = Math.ceil(mondayDay / 7);
  
  // Phase 11: Get first week type from settings or default to GANJIL
  let firstWeekType = 'GANJIL';
  const setting = settings.find(s => s.year === mondayYear && s.month === mondayMonth);
  if (setting && setting.first_week_type) {
    firstWeekType = setting.first_week_type;
  }
  
  const weekType = weekOfMonth % 2 === 1 
    ? firstWeekType 
    : (firstWeekType === 'GANJIL' ? 'GENAP' : 'GANJIL');
  
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = days[dayOfWeek];
  
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { dayName, weekType, dressCode: null };
  }
  
  let dressCode = null;
  if (weekType === "GANJIL") {
    const map = { 1: "Batik", 2: "Mustard", 3: "Navy", 4: "Batik", 5: "Mustard" };
    dressCode = map[dayOfWeek];
  } else {
    const map = { 1: "Navy", 2: "Batik", 3: "Mustard", 4: "Navy", 5: "Batik" };
    dressCode = map[dayOfWeek];
  }
  
  return { date: dateStr, dayName, weekType, dressCode };
};

const settingsGanjil = [{ year: 2026, month: 9, first_week_type: 'GANJIL' }];
const settingsGenap = [{ year: 2026, month: 9, first_week_type: 'GENAP' }];

const testDates = [
  "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
  "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
  "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25",
  "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"
];

console.log("=== TEST GANJIL ===");
testDates.forEach(d => {
  const r = getDressCode(d, settingsGanjil);
  console.log(d + " (" + r.dayName + ") -> " + r.weekType + " [" + r.dressCode + "]");
});

console.log("\n=== TEST GENAP ===");
testDates.forEach(d => {
  const r = getDressCode(d, settingsGenap);
  console.log(d + " (" + r.dayName + ") -> " + r.weekType + " [" + r.dressCode + "]");
});
