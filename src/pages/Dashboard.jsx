import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getJakartaDayBounds, formatTimeWIB } from '../utils/dateUtils';
import KpiSummary from '../components/KpiSummary';
import TaskList from '../components/TaskList';
import PanitiaTable from '../components/PanitiaTable';

function downloadCSV(filename, headers, rows) {
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const getDressCode = (dateStr) => {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const localDate = new Date(year, month, day);
  const dayOfWeek = localDate.getDay(); 
  const dayOfMonth = localDate.getDate();
  
  const weekOfMonth = Math.ceil(dayOfMonth / 7);
  const weekType = weekOfMonth % 2 === 1 ? "GANJIL" : "GENAP";
  
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
  
  return { dayName, weekType, dressCode };
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const roleLabel = (role) => role === 'panitia' ? 'Petugas' : role === 'dosen' ? 'Dosen' : role;
  
  // Phase C States
  const [attendanceData, setAttendanceData] = useState(null);
  const [monitoringData, setMonitoringData] = useState(null);

  // Phase D States
  const [events, setEvents] = useState([]);
  const [panitiaList, setPanitiaList] = useState([]); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Jadwal Keseluruhan
  const [allSchedules, setAllSchedules] = useState([]);
  const [allSchedulesLimit, setAllSchedulesLimit] = useState(20);
  const [showPastAllSchedules, setShowPastAllSchedules] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState({ id: null, name: '', date: '', start_time: '', end_time: '', selectedPanitia: [] });

  // Phase E States
  const [tasks, setTasks] = useState([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState('create'); // create, edit, detail_dosen, detail_panitia
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskLogs, setTaskLogs] = useState([]);
  const [taskFormData, setTaskFormData] = useState({ title: '', description: '', deadline: '' });
  const [myActivityTasks, setMyActivityTasks] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [taskHistoryLogs, setTaskHistoryLogs] = useState([]);
  const [taskAuditLogs, setTaskAuditLogs] = useState([]);
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [attendanceShiftFilter, setAttendanceShiftFilter] = useState('all');
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState('all');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [progressFormData, setProgressFormData] = useState({ progress: 0, report: '' });

  // Phase F States
  const [isPanitiaModalOpen, setIsPanitiaModalOpen] = useState(false);
  const [panitiaModalMode, setPanitiaModalMode] = useState('create');
  const [panitiaFormData, setPanitiaFormData] = useState({ nama: '', nim: '', username: '', password: '' });
  const [selectedPanitia, setSelectedPanitia] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  // Phase 7B States
  const [stationsList, setStationsList] = useState([]);
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [stationFormData, setStationFormData] = useState({ name: '' });
  const [pairingResult, setPairingResult] = useState(null);

  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Phase 8A States
  const [shiftsList, setShiftsList] = useState([]);
  const [schedulesList, setSchedulesList] = useState([]);
  const [mySchedules, setMySchedules] = useState([]);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftFormData, setShiftFormData] = useState({ shift_id: '', schedule_date: '' });
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [memberFormData, setMemberFormData] = useState({ selectedPanitia: [] });
  const [scheduleDisplayLimit, setScheduleDisplayLimit] = useState(7);
  const [showPastSchedules, setShowPastSchedules] = useState(false);

  const isShiftEnded = (schedule) => {
    if (!schedule?.schedule_date || !schedule?.shifts?.end_time) return false;
    const endDateTimeStr = `${schedule.schedule_date}T${schedule.shifts.end_time}`;
    const nowJakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const endJakarta = new Date(new Date(endDateTimeStr).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    return nowJakarta > endJakarta;
  };

  const handleOpenMemberModal = (schedule) => {
    if (isShiftEnded(schedule)) {
      const confirmed = window.confirm(
        `Shift ${schedule.shifts?.name} tanggal ${new Date(schedule.schedule_date).toLocaleDateString('id-ID')} sudah berakhir. Perubahan anggota tidak akan berpengaruh ke absensi shift ini. Lanjutkan mengedit?`
      );
      if (!confirmed) return;
    }
    setSelectedSchedule(schedule);
    setMemberFormData({ selectedPanitia: (schedule.shift_members || []).map(m => m.user_id) });
    setIsMemberModalOpen(true);
  };

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
      
      if (profileData.is_active === false) {
        await supabase.auth.signOut();
        window.alert('Akun Anda sedang dinonaktifkan oleh administrator.');
        navigate('/login');
        return;
      }

      setProfile(profileData);

      const bounds = getJakartaDayBounds();

      if (profileData.role === 'panitia') {
        // Attendance
        const { data: attData } = await supabase.from('attendance').select('*').eq('panitia_id', user.id).gte('waktu_absen', bounds.start).lt('waktu_absen', bounds.end);
        setAttendanceData(attData || []);

        // Events
        const { data: eventsData } = await supabase.from('events').select('*').order('date', { ascending: true }).order('start_time', { ascending: true });
        setEvents(eventsData || []);

        // Phase 8A: Panitia Shifts
        const todayStr = bounds.dateStr;
        const { data: rawMyShifts } = await supabase.from('shift_members').select('schedule_id, shift_schedules(schedule_date, shifts(name, start_time, end_time))').eq('user_id', user.id);
        const validShifts = (rawMyShifts || []).filter(x => x.shift_schedules && x.shift_schedules.schedule_date >= todayStr).sort((a,b) => a.shift_schedules.schedule_date.localeCompare(b.shift_schedules.schedule_date));
        setMySchedules(validShifts);

        // Phase 8G: Jadwal Keseluruhan
        const { data: allSchedulesData } = await supabase.from('shift_schedules')
          .select('*, shifts(*), shift_members(*, profiles(full_name))');
        setAllSchedules(allSchedulesData || []);

        // Tasks (Phase E) - Panitia sees all
        const { data: tasksData } = await supabase.from('tasks').select('*, creator:created_by(full_name, role), profiles:last_updated_by(full_name)').eq('is_deleted', false).order('deadline', { ascending: true }).order('created_at', { ascending: false });

        // Priority 4: Tasks I Interacted With
        const { data: interactedTasksData } = await supabase.from('task_progress_logs').select('task_id').eq('user_id', user.id);
        const interactedIds = [...new Set((interactedTasksData || []).map(log => log.task_id))];
        if (interactedIds.length > 0) {
          const { data: myActivityTasksData } = await supabase.from('tasks').select('*, creator:created_by(full_name, role), profiles:last_updated_by(full_name)').eq('is_deleted', false).in('id', interactedIds).order('updated_at', { ascending: false });
          setMyActivityTasks(myActivityTasksData || []);
        } else {
          setMyActivityTasks([]);
        }
        setTasks(tasksData || []);
      } 
      else if (profileData.role === 'dosen') {
        // Phase 8A: Dosen Shifts
        const { data: shiftsData } = await supabase.from('shifts').select('*').order('start_time');
        setShiftsList(shiftsData || []);
        const { data: schedulesData } = await supabase.from('shift_schedules').select('*, shifts(*), shift_members(*, profiles(full_name))').order('schedule_date', { ascending: false });
        setSchedulesList(schedulesData || []);

        const scheduledPanitiaIds = new Set(
          (schedulesData || [])
            .filter(s => s.schedule_date === bounds.dateStr)
            .flatMap(s => (s.shift_members || []).map(m => m.user_id))
        );

        // Monitoring
        const [profilesRes, attendancesRes, stationsRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name, username, nim, is_active').eq('role', 'panitia'),
          supabase.from('attendance').select('*').gte('waktu_absen', bounds.start).lt('waktu_absen', bounds.end),
          supabase.from('attendance_stations').select('*').order('created_at', { ascending: false })
        ]);
        
        if (stationsRes.data) {
          setStationsList(stationsRes.data);
        }
        
        if (profilesRes.data) {
          const sortedProfiles = [...profilesRes.data].sort((a, b) => a.full_name.localeCompare(b.full_name));
          setPanitiaList(sortedProfiles);
          if (attendancesRes.data && schedulesData) {
            const todaysSchedules = schedulesData.filter(s => s.schedule_date === bounds.dateStr);
            const shiftAwareMonitoring = [];

            todaysSchedules.forEach(schedule => {
              (schedule.shift_members || []).forEach(member => {
                const profile = sortedProfiles.find(p => p.id === member.user_id);
                if (profile) {
                   const shiftAtt = attendancesRes.data.filter(a => a.panitia_id === member.user_id && a.shift_schedule_id === schedule.id);
                   const inAtt = shiftAtt.find(a => a.attendance_type === 'IN');
                   const outAtt = shiftAtt.find(a => a.attendance_type === 'OUT');
                   
                   shiftAwareMonitoring.push({
                     ...profile,
                     shift: schedule.shifts,
                     schedule_id: schedule.id,
                     in_record: inAtt || null,
                     out_record: outAtt || null
                   });
                }
              });
            });

            shiftAwareMonitoring.sort((a, b) => {
               if (a.full_name !== b.full_name) return a.full_name.localeCompare(b.full_name);
               if (a.shift && b.shift) return a.shift.start_time.localeCompare(b.shift.start_time);
               return 0;
            });
            
            setMonitoringData(shiftAwareMonitoring);
          }
        }

        // Events
        const { data: eventsData } = await supabase.from('events').select('*, event_members (panitia_id)').order('date', { ascending: false }).order('start_time', { ascending: false });
        setEvents(eventsData || []);

        // Tasks (Phase E) - Dosen sees own
        const { data: tasksData } = await supabase.from('tasks').select('*, creator:created_by(full_name, role), profiles:last_updated_by(full_name)').eq('is_deleted', false).order('deadline', { ascending: true }).order('created_at', { ascending: false });

        // Priority 3: History for Dosen
        const [allAttRes, allLogsRes, allAuditRes] = await Promise.all([
          supabase.from('attendance').select('*, profiles:panitia_id(full_name), shift_schedules(schedule_date, shifts(name, start_time, end_time))').order('waktu_absen', { ascending: false }).limit(1000),
          supabase.from('task_progress_logs').select('*, tasks:task_id(title, status, created_at), profiles:user_id(full_name)').order('created_at', { ascending: false }).limit(1000),
          supabase.from('task_audit_logs').select('*, profiles:performed_by(full_name)').order('created_at', { ascending: false }).limit(1000)
        ]);
        
        const rawHistory = allAttRes.data || [];
        const historyMap = new Map();
        
        rawHistory.forEach(att => {
          if (!att.shift_schedule_id) return; // Skip legacy non-shift attendance to prevent errors
          const key = `${att.panitia_id}_${att.shift_schedule_id}`;
          if (!historyMap.has(key)) {
             historyMap.set(key, {
                panitia_id: att.panitia_id,
                shift_schedule_id: att.shift_schedule_id,
                full_name: att.profiles?.full_name || '-',
                schedule_date: att.shift_schedules?.schedule_date,
                shift_name: att.shift_schedules?.shifts?.name || '-',
                shift_start: att.shift_schedules?.shifts?.start_time,
                shift_end: att.shift_schedules?.shifts?.end_time,
                in_record: null,
                out_record: null
             });
          }
          const group = historyMap.get(key);
          if (att.attendance_type === 'IN') group.in_record = att;
          if (att.attendance_type === 'OUT') group.out_record = att;
        });

        const historyArr = Array.from(historyMap.values()).sort((a,b) => {
           if (a.schedule_date !== b.schedule_date) return (b.schedule_date || '').localeCompare(a.schedule_date || '');
           return (b.shift_start || '').localeCompare(a.shift_start || '');
        });
        
        setAttendanceHistory(historyArr);
        setTaskHistoryLogs(allLogsRes.data || []);
        setTaskAuditLogs(allAuditRes.data || []);
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

  const openEditTaskModal = (task) => {
    setTaskModalMode('edit');
    setSelectedTask(task);
    setTaskFormData({ title: task.title, description: task.description || '', deadline: task.deadline });
    setFormError(''); setIsTaskModalOpen(true);
  };

  const submitCreateTask = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      if (!taskFormData.title || !taskFormData.deadline) throw new Error('Judul dan Deadline wajib');
      const { data, error } = await supabase.rpc('create_task_logged', {
        p_title: taskFormData.title, p_description: taskFormData.description, p_deadline: taskFormData.deadline
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setIsTaskModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };

  const submitEditTask = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      if (!taskFormData.title || !taskFormData.deadline) throw new Error('Judul dan Deadline wajib');
      const { data, error } = await supabase.rpc('edit_task_logged', {
        p_task_id: selectedTask.id, p_title: taskFormData.title, p_description: taskFormData.description, p_deadline: taskFormData.deadline
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
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


  const submitProgress = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      if (!progressFormData.report) throw new Error('Laporan wajib diisi');
      const prog = parseInt(progressFormData.progress);
      if (prog < 1 || prog > 100) throw new Error('Kontribusi minimal 1% dan maksimal 100%');
      
      const { data, error } = await supabase.rpc('add_task_progress', {
        p_task_id: selectedTask.id, p_contribution: prog, p_report: progressFormData.report
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      setIsTaskModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Hapus task?')) return;
    try {
      const { data, error } = await supabase.rpc('delete_task_logged', { p_task_id: id });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      fetchDashboardData();
    } catch (err) { alert(err.message); }
  };

  const handleExportAttendance = () => {
    const headers = ['Tanggal', 'Nama Petugas', 'Shift', 'Jam Mulai', 'Jam Selesai', 'IN', 'OUT', 'Status Telat', 'Alasan Telat', 'Alasan Pulang Cepat'];
    const rows = filteredAttendanceHistory.map(row => [
      row.schedule_date ? new Date(row.schedule_date).toLocaleDateString('id-ID') : '-',
      row.full_name,
      row.shift_name,
      row.shift_start?.substring(0,5) || '-',
      row.shift_end?.substring(0,5) || '-',
      row.in_record ? formatTimeWIB(row.in_record.waktu_absen) : '-',
      row.out_record ? formatTimeWIB(row.out_record.waktu_absen) : '-',
      row.in_record?.late_status === 'terlambat' ? 'Terlambat' : 'Tepat Waktu',
      row.in_record?.late_reason || '-',
      row.out_record?.early_checkout_reason || '-'
    ]);
    downloadCSV(`riwayat-absensi-pmb-${logDateFrom || 'semua'}-sd-${logDateTo || 'semua'}.csv`, headers, rows);
  };

  const handleExportTaskHistory = () => {
    const headers = ['Tanggal & Waktu', 'Nama Petugas', 'Judul Task', 'Status Sebelum', 'Status Sesudah', 'Catatan'];
    const rows = filteredTaskHistoryLogs.map(log => [
      new Date(log.created_at).toLocaleString('id-ID'),
      log.profiles?.full_name || '-',
      log.tasks?.title || '-',
      log.previous_status?.replace('_', ' ') || '-',
      log.new_status?.replace('_', ' ') || '-',
      log.report || '-'
    ]);
    downloadCSV(`riwayat-tugas-pmb-${logDateFrom || 'semua'}-sd-${logDateTo || 'semua'}.csv`, headers, rows);
  };

  const handleExportTaskAuditLogs = () => {
    const headers = ['Tanggal & Waktu', 'Aksi', 'Judul Task', 'Dilakukan Oleh', 'Detail'];
    const rows = filteredTaskAuditLogs.map(log => [
      new Date(log.created_at).toLocaleString('id-ID'),
      log.action.toUpperCase(),
      log.task_title_snapshot || '-',
      log.profiles?.full_name || '-',
      log.detail ? JSON.stringify(log.detail) : '-'
    ]);
    downloadCSV(`audit-tugas-pmb-${logDateFrom || 'semua'}-sd-${logDateTo || 'semua'}.csv`, headers, rows);
  };

  // ============================
  // PHASE F: PANITIA MANAGEMENT
  // ============================
  const openCreatePanitiaModal = () => {
    setPanitiaModalMode('create');
    setPanitiaFormData({ nama: '', nim: '', username: '', password: '' });
    setFormError(''); setIsPanitiaModalOpen(true);
  };

  const openResetPasswordModal = (panitia) => {
    setPanitiaModalMode('reset');
    setSelectedPanitia(panitia);
    setPanitiaFormData({ nama: '', nim: '', username: panitia.username || '', password: '' });
    setFormError(''); setIsPanitiaModalOpen(true);
  };

  const submitPanitia = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Sesi tidak valid. Silakan login kembali.');

      if (panitiaModalMode === 'create') {
        const { data, error } = await supabase.functions.invoke('auth-admin', {
          body: {
            action: 'create',
            username: panitiaFormData.username,
            password: panitiaFormData.password,
            nama: panitiaFormData.nama,
            nim: panitiaFormData.nim
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || data?.message || 'Gagal membuat akun');
      } else {
        const { data, error } = await supabase.functions.invoke('auth-admin', {
          body: {
            action: 'reset_password',
            user_id: selectedPanitia.id,
            password: panitiaFormData.password
          }
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || data?.message || 'Gagal mereset password');
      }
      setIsPanitiaModalOpen(false); fetchDashboardData();
    } catch (err) { setFormError(err.message || 'Terjadi kesalahan pada server'); } finally { setFormLoading(false); }
  };

  const handleToggleActive = async (panitia) => {
    const actionText = panitia.is_active ? 'Nonaktifkan' : 'Aktifkan';
    if (!window.confirm(`${actionText} akun ${panitia.full_name}? ${panitia.is_active ? 'Akun tidak dapat login, tetapi seluruh riwayat tetap disimpan.' : ''}`)) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('auth-admin', {
        body: { action: 'set_active', user_id: panitia.id, is_active: !panitia.is_active }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || data?.message);
      fetchDashboardData();
    } catch (err) {
      window.alert(err.message || 'Terjadi kesalahan pada server');
    }
  };

  // ============================
  // PHASE 7B: KIOSK MANAGEMENT
  // ============================
  const submitStation = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true); setPairingResult(null);
    try {
      const { data, error } = await supabase.rpc('create_kiosk_pairing', { p_name: stationFormData.name });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setPairingResult(data);
      fetchDashboardData();
    } catch (err) { setFormError(err.message); } finally { setFormLoading(false); }
  };

  const handleToggleStation = async (station) => {
    try {
      const { error } = await supabase.from('attendance_stations').update({ is_active: !station.is_active }).eq('id', station.id);
      if (error) throw error;
      fetchDashboardData();
    } catch (err) { window.alert(err.message); }
  };

  const handleRepairStation = async (id) => {
    if (!window.confirm('Station akan terputus dari perangkat lamanya. Lanjutkan Pair Ulang?')) return;
    setFormError(''); setFormLoading(true);
    try {
      const { data, error } = await supabase.rpc('repair_kiosk_station', { p_station_id: id });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      setPairingResult({ station_id: data.station_id, pairing_code: data.pairing_code, is_repair: true });
      setIsStationModalOpen(true);
      fetchDashboardData();
    } catch (err) {
      alert(err.message || 'Gagal me-reset Kiosk');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddShiftSchedule = async (e) => {
    e.preventDefault();
    setFormLoading(true); setFormError('');
    try {
      const { data, error } = await supabase.rpc('create_daily_shifts', {
        p_schedule_date: shiftFormData.schedule_date
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setIsShiftModalOpen(false);
      fetchDashboardData();
    } catch (err) { setFormError(err.message || 'Gagal menyimpan jadwal'); }
    finally { setFormLoading(false); }
  };

  const handleUpdateMembers = async (e) => {
    e.preventDefault();
    setFormLoading(true); setFormError('');
    try {
      const { data, error } = await supabase.rpc('manage_shift_members', {
        p_schedule_id: selectedSchedule.id,
        p_user_ids: memberFormData.selectedPanitia
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setIsMemberModalOpen(false);
      fetchDashboardData();
    } catch (err) { setFormError(err.message || 'Gagal update member'); }
    finally { setFormLoading(false); }
  };

  const handleQuickAssignShift = async (shiftId, panitiaId) => {
    if (!shiftId) return;
    try {
      setFormLoading(true);
      const { data, error } = await supabase.rpc('assign_panitia_to_shift_today', {
        p_shift_id: shiftId,
        p_user_id: panitiaId
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      window.alert(data.message);
      fetchDashboardData();
    } catch (err) {
      window.alert(err.message || 'Gagal menambahkan shift');
    } finally {
      setFormLoading(false);
    }
  };

  // Formatting helpers
  const formatDate = (dateStr) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(dateStr));
  const formatTime = (timeStr) => timeStr.substring(0, 5) + ' WIB';

  const filteredAttendanceHistory = attendanceHistory.filter(row => {
    if (logDateFrom && row.schedule_date < logDateFrom) return false;
    if (logDateTo && row.schedule_date > logDateTo) return false;
    
    if (attendanceShiftFilter !== 'all' && row.shift_name !== attendanceShiftFilter) return false;
    
    if (attendanceSearchQuery) {
      const q = attendanceSearchQuery.toLowerCase();
      if (!row.full_name?.toLowerCase().includes(q) && !row.username?.toLowerCase().includes(q) && !row.nim?.toLowerCase().includes(q)) {
        return false;
      }
    }

    if (attendanceStatusFilter !== 'all') {
      let currentStatus = 'Belum Absen';
      if (row.in_record && !row.out_record) {
        currentStatus = 'Sedang Bertugas';
      } else if (row.in_record && row.out_record) {
        if (row.in_record.late_status === 'terlambat') {
          currentStatus = 'Terlambat';
        } else {
          currentStatus = 'Selesai';
        }
      }
      if (currentStatus !== attendanceStatusFilter) return false;
    }

    return true;
  });

  const filteredTaskHistoryLogs = taskHistoryLogs.filter(log => {
    const logDate = log.created_at?.substring(0, 10);
    if (logDateFrom && logDate < logDateFrom) return false;
    if (logDateTo && logDate > logDateTo) return false;
    return true;
  });

  const filteredTaskAuditLogs = taskAuditLogs.filter(log => {
    const logDate = log.created_at?.substring(0, 10);
    if (logDateFrom && logDate < logDateFrom) return false;
    if (logDateTo && logDate > logDateTo) return false;
    return true;
  });

  if (loading) return (
    <div className="loader-container">
      <div className="spinner"></div>
    </div>
  );
  if (!profile) return <div className="dashboard-layout"><div className="dashboard-content"><button onClick={handleLogout} className="btn btn-primary">Logout</button></div></div>;

  return (
    <div className="dashboard-layout">
      {/* SIDEBAR NAVIGATION */}
      <div className="dashboard-sidebar">
        <div className="navbar-brand">Sistem PMB</div>

        {profile?.role === 'dosen' && (
          <div className="sidebar-nav">
            <div className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              Dashboard
            </div>
            <div className={`sidebar-nav-item ${activeTab === 'jadwal' ? 'active' : ''}`} onClick={() => { setActiveTab('jadwal'); setScheduleDisplayLimit(7); setShowPastSchedules(false); }}>
              Jadwal Shift
            </div>
            <div className={`sidebar-nav-item ${activeTab === 'event' ? 'active' : ''}`} onClick={() => setActiveTab('event')}>
              Manajemen Event
            </div>
            <div className={`sidebar-nav-item ${activeTab === 'panitia' ? 'active' : ''}`} onClick={() => setActiveTab('panitia')}>
              Manajemen Petugas
            </div>
            <div className={`sidebar-nav-item ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
              Riwayat & Log
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="user-menu" style={{ flexDirection: 'column', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.25rem' }}>
            <span className="user-name" style={{ fontWeight: 'bold' }}>{profile?.full_name}</span>
            <span className="user-role">{roleLabel(profile?.role)}</span>
          </div>
          <button onClick={handleLogout} className="btn-logout" style={{ width: '100%' }}>Logout</button>
        </div>
      </div>

      <main className="dashboard-main">
        <div className="dashboard-content">
          {profile.role === 'dosen' ? (
            <div className="dashboard-placeholder dosen-view view-inner">
              
              {/* TAB 1: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <>
                  <div style={{ marginBottom: '2rem' }}>
                    <h2 className="page-title" style={{ marginBottom: '0.25rem' }}>DASHBOARD DOSEN</h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Pantau kehadiran petugas dan kelancaran kegiatan PMB.</p>
                  </div>
                  
                  <KpiSummary monitoringData={monitoringData} panitiaList={panitiaList} />
                  
                  {/* Phase C: MONITORING (GROUPED BY SHIFT) */}
                  <div className="event-section" style={{ marginTop: '2.5rem', marginBottom: '2rem' }}>
                    <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem', fontSize: '1.25rem' }}>MONITORING ABSENSI HARI INI</h2>
                    {(() => {
                      if (!monitoringData || monitoringData.length === 0) {
                        return <p style={{ color: 'var(--text-secondary)' }}>Belum ada data monitoring untuk hari ini.</p>;
                      }

                      // Group monitoring data by shift
                      const shiftsMap = new Map();
                      monitoringData.forEach(row => {
                        const shiftKey = `${row.shift?.name || 'Unknown'}_${row.shift?.start_time || '00:00'}`;
                        if (!shiftsMap.has(shiftKey)) {
                          shiftsMap.set(shiftKey, {
                            name: row.shift?.name || 'Unknown',
                            startTime: row.shift?.start_time?.substring(0, 5) || '00:00',
                            endTime: row.shift?.end_time?.substring(0, 5) || '00:00',
                            members: []
                          });
                        }
                        shiftsMap.get(shiftKey).members.push(row);
                      });

                      const shiftGroups = Array.from(shiftsMap.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                          {shiftGroups.map(group => {
                            const isPagi = group.startTime === '08:00';
                            const accentColor = isPagi ? '#ea580c' : 'var(--primary-color)';
                            const bgColor = isPagi ? '#fff7ed' : '#f0f9ff';
                            const borderColor = isPagi ? '#fdba74' : '#bae6fd';

                            return (
                              <div key={group.startTime} style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ backgroundColor: bgColor, padding: '1rem 1.5rem', borderBottom: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <h3 style={{ margin: 0, color: accentColor, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                      {group.name.toUpperCase()}
                                    </h3>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', fontWeight: '500' }}>
                                      {group.startTime} — {group.endTime}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: accentColor, backgroundColor: 'white', padding: '0.25rem 0.75rem', borderRadius: '999px', border: `1px solid ${borderColor}` }}>
                                    {group.members.length} Petugas
                                  </div>
                                </div>
                                <div className="table-responsive" style={{ margin: 0, border: 'none' }}>
                                  <table className="monitoring-table" style={{ margin: 0, borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: 'white' }}>
                                      <tr><th style={{ borderBottom: `1px solid ${borderColor}` }}>Nama Petugas</th><th style={{ borderBottom: `1px solid ${borderColor}` }}>IN</th><th style={{ borderBottom: `1px solid ${borderColor}` }}>OUT</th><th style={{ borderBottom: `1px solid ${borderColor}` }}>Status</th><th style={{ borderBottom: `1px solid ${borderColor}` }}>Keterangan</th></tr>
                                    </thead>
                                    <tbody style={{ backgroundColor: 'white' }}>
                                      {group.members.map(row => {
                                        const reasons = [];
                                        if (row.in_record?.late_reason) reasons.push('Terlambat: ' + row.in_record.late_reason);
                                        if (row.out_record?.early_checkout_reason) reasons.push('Pulang cepat: ' + row.out_record.early_checkout_reason);
                                        const keterangan = reasons.length > 0 ? reasons.join('; ') : '-';

                                        let statusEl = <span className="badge-belum">Belum Absen</span>;
                                        if (row.in_record && !row.out_record) {
                                          statusEl = <span className="badge-hadir" style={{ backgroundColor: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd' }}>Sedang Bertugas</span>;
                                        } else if (row.in_record && row.out_record) {
                                          if (row.in_record.late_status === 'terlambat') {
                                            statusEl = <span className="badge-belum" style={{ backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>Selesai (Terlambat)</span>;
                                          } else {
                                            statusEl = <span className="badge-hadir">Selesai</span>;
                                          }
                                        }

                                        return (
                                          <tr key={`${row.id}_${row.schedule_id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ fontWeight: '500' }}>{row.full_name}</td>
                                            <td>{row.in_record ? formatTimeWIB(row.in_record.waktu_absen) : '—'}</td>
                                            <td>{row.out_record ? formatTimeWIB(row.out_record.waktu_absen) : '—'}</td>
                                            <td>{statusEl}</td>
                                            <td style={{ maxWidth: '200px', wordWrap: 'break-word', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                              {keterangan}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Phase 8A: JADWAL HARI INI & BESOK (Compact) */}
                  <div className="event-section" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
                    <div className="event-header">
                      <h2 style={{ fontSize: '1.1rem' }}>JADWAL HARI INI & BESOK</h2>
                      <button type="button" onClick={() => { setActiveTab('jadwal'); setScheduleDisplayLimit(7); setShowPastSchedules(false); }} className="btn btn-primary btn-small" style={{ width: 'auto', backgroundColor: 'var(--text-secondary)' }}>
                        Lihat Semua Jadwal
                      </button>
                    </div>
                    {(() => {
                      const todayStr = getJakartaDayBounds().dateStr;
                      const tomorrowDate = new Date();
                      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                      const tomorrowStr = getJakartaDayBounds(tomorrowDate).dateStr;
                      
                      const relevantSchedules = schedulesList
                        .filter(s => s.schedule_date === todayStr || s.schedule_date === tomorrowStr)
                        .sort((a, b) => {
                          if (a.schedule_date !== b.schedule_date) {
                            return a.schedule_date.localeCompare(b.schedule_date);
                          }
                          return (a.shifts?.start_time || '').localeCompare(b.shifts?.start_time || '');
                        });
                      
                      if (relevantSchedules.length === 0) {
                        return <p style={{ color: 'var(--text-secondary)' }}>Belum ada jadwal untuk hari ini atau besok.</p>;
                      }
                      
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                          {relevantSchedules.map(sched => (
                            <div key={sched.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                              <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 'bold' }}>
                                  {sched.schedule_date === todayStr ? 'HARI INI' : 'BESOK'}
                                </div>
                                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary-color)' }}>
                                  {sched.shifts?.name}
                                </div>
                                <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                  {sched.shifts?.start_time?.substring(0,5)}–{sched.shifts?.end_time?.substring(0,5)} · <strong>{sched.shift_members?.length || 0} Petugas</strong>
                                </div>
                              </div>
                              <button onClick={() => handleOpenMemberModal(sched)} className="btn btn-primary btn-small" style={{ padding: '0.4rem 0.8rem' }}>
                                Kelola
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Phase E: TASK / ASSIGNMENT */}
                  <div className="event-section" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
                    <div className="event-header">
                      <h2 style={{ fontSize: '1.1rem' }}>TUGAS (TODO & IN PROGRESS)</h2>
                      <button type="button" onClick={openCreateTaskModal} className="btn btn-primary btn-small" style={{ width: 'auto' }}>+ Buat Task</button>
                    </div>
                    {tasks.length > 0 ? (
                      <TaskList 
                        tasks={tasks} 
                        formatDate={formatDate}
                        currentUserRole={profile?.role}
                        openTaskDetail={openTaskDetail} 
                        openEditTaskModal={openEditTaskModal}
                        handleDeleteTask={handleDeleteTask}
                      />
                    ) : (
                      <p style={{ color: 'var(--text-secondary)' }}>Belum ada task.</p>
                    )}
                  </div>

                  {/* Phase 7B: KIOSK STATION MANAGEMENT */}
                  <div className="event-section" style={{ marginTop: '2rem', marginBottom: '4rem' }}>
                    <div className="event-header">
                      <h2 style={{ fontSize: '1.1rem' }}>MANAJEMEN KIOSK STATION</h2>
                      <button type="button" onClick={() => { setStationFormData({ name: '' }); setPairingResult(null); setFormError(''); setIsStationModalOpen(true); }} className="btn btn-primary btn-small" style={{ width: 'auto' }}>+ Register Kiosk</button>
                    </div>
                    <div className="table-responsive">
                      <table className="monitoring-table">
                        <thead><tr><th>Nama Station</th><th>Status</th><th>Aksi</th></tr></thead>
                        <tbody>
                          {stationsList.map(station => (
                            <tr key={station.id}>
                              <td>{station.name}</td>
                              <td>
                                {station.is_active === false ? <span style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>○ INACTIVE</span> : <span style={{ color: 'var(--success-color, #10b981)', fontWeight: 'bold' }}>● ACTIVE</span>}
                              </td>
                              <td>
                                  <button type="button" onClick={() => handleToggleStation(station)} className="btn btn-primary btn-small" style={{ backgroundColor: station.is_active ? 'var(--error-color)' : '#10b981', padding: '0.25rem 0.5rem', fontSize: '0.8rem', marginRight: '0.5rem' }}>
                                    {station.is_active ? 'Disable' : 'Activate'}
                                  </button>
                                  <button type="button" onClick={() => handleRepairStation(station.id)} className="btn btn-primary btn-small" style={{ backgroundColor: '#f59e0b', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                                    Pair Ulang
                                  </button>
                              </td>
                            </tr>
                          ))}
                          {stationsList.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada kiosk station.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: MANAJEMEN EVENT */}
              {activeTab === 'event' && (
                <>
                  <h2 className="page-title">MANAJEMEN EVENT</h2>
                  <div className="event-section" style={{ marginTop: 0, marginBottom: '4rem' }}>
                    <div className="event-header">
                      <button type="button" onClick={openCreateModal} className="btn btn-primary" style={{ width: 'auto' }}>+ Buat Event</button>
                    </div>
                    <div className="event-grid">
                      {events.map(event => (
                        <div key={event.id} className="event-card">
                          <h3>{event.name}</h3>
                          <p>📅 {formatDate(event.date)}</p>
                          <p>⏰ {formatTime(event.start_time)} - {formatTime(event.end_time)}</p>
                          <p>👥 {event.event_members?.length || 0} Petugas Ditugaskan</p>
                          <div className="event-card-actions">
                            <button type="button" onClick={() => openEditModal(event)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--accent-color)' }}>Edit</button>
                            <button type="button" onClick={() => handleDeleteEvent(event.id)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--error-color)' }}>Hapus</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* TAB 3: MANAJEMEN PETUGAS */}
              {activeTab === 'panitia' && (
                <>
                  <PanitiaTable 
                    panitiaList={panitiaList}
                    showInactive={showInactive}
                    setShowInactive={setShowInactive}
                    openCreatePanitiaModal={openCreatePanitiaModal}
                    openResetPasswordModal={openResetPasswordModal}
                    handleToggleActive={handleToggleActive}
                    handleQuickAssignShift={handleQuickAssignShift}
                    shiftsList={shiftsList}
                  />
                </>
              )}

              {/* TAB 4: RIWAYAT & LOG */}
              {activeTab === 'log' && (
                <>
                  <h2 className="page-title">RIWAYAT &amp; LOG</h2>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Dari Tanggal</label>
                      <input type="date" className="form-control" value={logDateFrom} onChange={e => setLogDateFrom(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Sampai Tanggal</label>
                      <input type="date" className="form-control" value={logDateTo} onChange={e => setLogDateTo(e.target.value)} />
                    </div>
                    <button type="button" onClick={() => { setLogDateFrom(''); setLogDateTo(''); setAttendanceShiftFilter('all'); setAttendanceStatusFilter('all'); setAttendanceSearchQuery(''); }} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--text-secondary)' }}>Reset Filter</button>
                  </div>

                  {/* Phase E: RIWAYAT TUGAS */}
                  <div className="event-section section-spacing">
                    <div className="event-header">
                      <h2>RIWAYAT TUGAS (AUDIT LOG)</h2>
                      <button type="button" onClick={handleExportTaskHistory} className="btn btn-primary btn-small" style={{ width: 'auto' }}>
                        ⬇ Export CSV
                      </button>
                    </div>
                    <div className="history-timeline" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                      {filteredTaskHistoryLogs.map(log => {
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
                      {filteredTaskHistoryLogs.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada riwayat update task.</p>}
                    </div>
                  </div>

                  {/* RIWAYAT AKSI TASK (AUDIT LOG) */}
                  <div className="event-section section-spacing">
                    <div className="event-header">
                      <h2>RIWAYAT AKSI TASK (DIBUAT/DIEDIT/DIHAPUS)</h2>
                      <button type="button" onClick={handleExportTaskAuditLogs} className="btn btn-primary btn-small" style={{ width: 'auto' }}>
                        ⬇ Export CSV
                      </button>
                    </div>
                    <div className="history-timeline" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                      {filteredTaskAuditLogs.map(log => (
                        <div key={log.id} className="history-item" style={{ borderLeftColor: log.action === 'deleted' ? '#ef4444' : log.action === 'created' ? '#10b981' : '#f59e0b', padding: '0 0 0 1rem', marginBottom: '1rem' }}>
                          <div className="history-meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                              <strong style={{ color: 'var(--primary-color)' }}>{log.profiles?.full_name}</strong>
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>telah <strong style={{ textTransform: 'uppercase' }}>{log.action}</strong> task: <strong>{log.task_title_snapshot}</strong></span>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{new Date(log.created_at).toLocaleString('id-ID')}</span>
                          </div>
                          {log.detail && (
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              <details>
                                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Lihat Detail Perubahan</summary>
                                <pre style={{ margin: '0.5rem 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem' }}>{JSON.stringify(log.detail, null, 2)}</pre>
                              </details>
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredTaskAuditLogs.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada riwayat aksi task.</p>}
                    </div>
                  </div>

                  {/* RIWAYAT ABSENSI */}
                  <div className="event-section section-spacing">
                    <div className="event-header" style={{ marginBottom: '1rem' }}>
                      <h2>RIWAYAT ABSENSI KESELURUHAN</h2>
                      <button type="button" onClick={handleExportAttendance} className="btn btn-primary btn-small" style={{ width: 'auto' }}>
                        ⬇ Export CSV
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                        <select className="form-control" value={attendanceShiftFilter} onChange={e => setAttendanceShiftFilter(e.target.value)}>
                          <option value="all">Semua Shift</option>
                          <option value="Pagi">Pagi</option>
                          <option value="Siang">Siang</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                        <select className="form-control" value={attendanceStatusFilter} onChange={e => setAttendanceStatusFilter(e.target.value)}>
                          <option value="all">Semua Status</option>
                          <option value="Belum Absen">Belum Absen</option>
                          <option value="Sedang Bertugas">Sedang Bertugas</option>
                          <option value="Terlambat">Terlambat (Selesai)</option>
                          <option value="Selesai">Selesai (Tepat Waktu)</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0, flex: '2 1 300px' }}>
                        <input type="text" className="form-control" placeholder="🔍 Cari Petugas..." value={attendanceSearchQuery} onChange={e => setAttendanceSearchQuery(e.target.value)} />
                      </div>
                    </div>
                    <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      <table className="monitoring-table">
                        <thead><tr><th>Tanggal</th><th>Nama Petugas</th><th>Shift</th><th>IN</th><th>OUT</th><th>Status</th><th>Keterangan</th></tr></thead>
                        <tbody>
                          {filteredAttendanceHistory.map(row => {
                            const reasons = [];
                            if (row.in_record?.late_reason) reasons.push('Terlambat: ' + row.in_record.late_reason);
                            if (row.out_record?.early_checkout_reason) reasons.push('Pulang cepat: ' + row.out_record.early_checkout_reason);
                            const keterangan = reasons.length > 0 ? reasons.join('; ') : '-';

                            let statusEl = <span className="badge-belum">Belum Absen</span>;
                            if (row.in_record && !row.out_record) {
                              statusEl = <span className="badge-hadir" style={{ backgroundColor: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd' }}>Sedang Bertugas</span>;
                            } else if (row.in_record && row.out_record) {
                              if (row.in_record.late_status === 'terlambat') {
                                statusEl = <span className="badge-belum" style={{ backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>Selesai (Terlambat)</span>;
                              } else {
                                statusEl = <span className="badge-hadir">Selesai</span>;
                              }
                            }

                            return (
                              <tr key={`${row.panitia_id}_${row.shift_schedule_id}`}>
                                <td>{row.schedule_date ? new Date(row.schedule_date).toLocaleDateString('id-ID') : '-'}</td>
                                <td>{row.full_name}</td>
                                <td>
                                  {row.shift_name}
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{row.shift_start?.substring(0,5)}–{row.shift_end?.substring(0,5)}</div>
                                </td>
                                <td>{row.in_record ? formatTimeWIB(row.in_record.waktu_absen) : '—'}</td>
                                <td>{row.out_record ? formatTimeWIB(row.out_record.waktu_absen) : '—'}</td>
                                <td>{statusEl}</td>
                                <td style={{ maxWidth: '200px', wordWrap: 'break-word', fontSize: '0.9rem' }}>{keterangan}</td>
                              </tr>
                            );
                          })}
                          {filteredAttendanceHistory.length === 0 && (
                            <tr>
                              <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 'bold' }}>Tidak ada data absensi</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Coba ubah filter atau kata pencarian.</div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'jadwal' && (
                <>
                  <h2 className="page-title">JADWAL SHIFT</h2>
                  <div className="event-section" style={{ marginTop: '2rem', marginBottom: '4rem' }}>
                    <div className="event-header">
                      <h2>SEMUA JADWAL SHIFT</h2>
                      <button type="button" onClick={() => { setShiftFormData({ shift_id: shiftsList[0]?.id || '', schedule_date: getJakartaDayBounds().dateStr }); setFormError(''); setIsShiftModalOpen(true); }} className="btn btn-primary" style={{ width: 'auto' }}>+ Tambah Jadwal</button>
                    </div>
                    
                    <div>
                      {(() => {
                        const todayStr = getJakartaDayBounds().dateStr;
                        const filteredSchedules = showPastSchedules 
                          ? schedulesList 
                          : schedulesList.filter(s => s.schedule_date >= todayStr);

                        const grouped = filteredSchedules.reduce((acc, curr) => {
                          const date = curr.schedule_date;
                          if (!acc[date]) acc[date] = [];
                          acc[date].push(curr);
                          return acc;
                        }, {});
                        
                        Object.keys(grouped).forEach(date => {
                          grouped[date].sort((a, b) => (a.shifts?.start_time || '').localeCompare(b.shifts?.start_time || ''));
                        });
                        
                        const allDates = Object.keys(grouped).sort((a,b) => a.localeCompare(b));
                        const datesToShow = allDates.slice(0, scheduleDisplayLimit);
                        const hasMore = allDates.length > scheduleDisplayLimit;

                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1rem', width: '100%' }}>
                              <button type="button" onClick={() => setShowPastSchedules(prev => !prev)} className="btn btn-primary btn-small" style={{ backgroundColor: 'var(--text-secondary)', width: 'auto' }}>
                                {showPastSchedules ? 'Sembunyikan Jadwal Lampau' : 'Tampilkan Jadwal Lampau'}
                              </button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem', width: '100%' }}>
                              {datesToShow.map(date => (
                                <div key={date} style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#0f172a', borderBottom: '2px solid #38bdf8', paddingBottom: '0.5rem' }}>
                                    {new Date(date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                                  </h3>
                                  {grouped[date].map(sched => (
                                    <div key={sched.id} style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <div style={{ fontWeight: 'bold', color: '#334155' }}>
                                          SHIFT {sched.shifts?.name?.toUpperCase()}
                                        </div>
                                        <span style={{ fontSize: '0.8rem', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                          {sched.shift_members?.length || 0} Petugas
                                        </span>
                                      </div>
                                      <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                        {sched.shifts?.start_time?.substring(0,5)} — {sched.shifts?.end_time?.substring(0,5)}
                                      </div>
                                      <button onClick={() => handleOpenMemberModal(sched)} className="btn btn-primary btn-small" style={{ width: '100%', fontSize: '0.85rem' }}>
                                        Kelola Member
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                            {hasMore && (
                              <div style={{ textAlign: 'center', marginTop: '1.5rem', width: '100%' }}>
                                <button type="button" onClick={() => setScheduleDisplayLimit(prev => prev + 7)} className="btn btn-primary" style={{ width: 'auto' }}>
                                  Muat {Math.min(7, allDates.length - scheduleDisplayLimit)} Hari Berikutnya
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {schedulesList.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Belum ada jadwal shift.</p>}
                    </div>
                  </div>
                </>
              )}

            </div>
          ) : (
            <div className="dashboard-placeholder panitia-view view-inner">
              
              {/* IN-PAGE PANITIA TABS */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setActiveTab('dashboard')} 
                  style={{ background: activeTab === 'dashboard' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'dashboard' ? 'white' : 'var(--text-secondary)', border: 'none', padding: '8px 16px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Dashboard
                </button>
                <button 
                  onClick={() => setActiveTab('tugas')} 
                  style={{ background: activeTab === 'tugas' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'tugas' ? 'white' : 'var(--text-secondary)', border: 'none', padding: '8px 16px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Tugas & Kegiatan
                </button>
                <button 
                  onClick={() => setActiveTab('jadwal')} 
                  style={{ background: activeTab === 'jadwal' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'jadwal' ? 'white' : 'var(--text-secondary)', border: 'none', padding: '8px 16px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Jadwal Keseluruhan
                </button>
              </div>

              {activeTab === 'dashboard' && (
                <>
                  <h2 className="page-title">DASHBOARD PETUGAS</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Selamat datang, {profile.full_name}.</p>
                  
                  {(() => {
                    const todayStr = getJakartaDayBounds().dateStr;
                    const { dayName, weekType, dressCode } = getDressCode(todayStr);
                    
                    let bg = '#f8fafc';
                    let fg = '#64748b';
                    let label = 'Tidak ada jadwal seragam';
                    
                    if (dressCode) {
                      label = dressCode.toUpperCase();
                      if (dressCode === 'Batik') {
                        bg = '#fff7ed';
                        fg = '#9a3412';
                      } else if (dressCode === 'Mustard') {
                        bg = '#fef08a';
                        fg = '#854d0e';
                      } else if (dressCode === 'Navy') {
                        bg = '#eff6ff';
                        fg = '#1e3a8a';
                      }
                    }

                    return (
                      <div className="attendance-section attendance-card" style={{ marginBottom: '2rem', borderLeft: `4px solid ${fg}` }}>
                        <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', textAlign: 'center' }}>DRESS CODE HARI INI</h3>
                        <div style={{ backgroundColor: bg, padding: '1rem', borderRadius: '8px', marginTop: '1rem', textAlign: 'center' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: fg, marginBottom: '0.25rem' }}>{label}</div>
                          {dressCode && (
                            <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                              {dayName} • Minggu {weekType}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Phase 8B: JADWAL SAYA & ATTENDANCE */}
                  <div className="attendance-section attendance-card">
                    <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem', textAlign: 'center' }}>JADWAL SAYA</h3>
                    
                    {(() => {
                      const sortedMySchedules = [...mySchedules].sort((a, b) => {
                        const dateA = a.shift_schedules?.schedule_date || '';
                        const dateB = b.shift_schedules?.schedule_date || '';
                        if (dateA !== dateB) return dateA.localeCompare(dateB);
                        
                        const timeA = a.shift_schedules?.shifts?.start_time || '';
                        const timeB = b.shift_schedules?.shifts?.start_time || '';
                        return timeA.localeCompare(timeB);
                      });

                      const todayStr = getJakartaDayBounds().dateStr;
                      const todayShifts = sortedMySchedules.filter(x => x.shift_schedules.schedule_date === todayStr);
                      const upcomingShifts = sortedMySchedules.filter(x => x.shift_schedules.schedule_date > todayStr).slice(0, 3);
                      
                      return (
                        <>
                          {todayShifts.length > 0 ? (
                            todayShifts.map(item => {
                              // Find IN and OUT records for this specific shift
                              const inRecord = Array.isArray(attendanceData) ? attendanceData.find(a => a.shift_schedule_id === item.schedule_id && a.attendance_type === 'IN') : null;
                              const outRecord = Array.isArray(attendanceData) ? attendanceData.find(a => a.shift_schedule_id === item.schedule_id && a.attendance_type === 'OUT') : null;
                              
                              let statusText = "BELUM ABSEN MASUK";
                              let statusColor = "badge-belum";
                              
                              if (inRecord && !outRecord) {
                                statusText = "SEDANG BERTUGAS";
                                statusColor = "badge-hadir";
                              } else if (inRecord && outRecord) {
                                statusText = "SHIFT SELESAI";
                                statusColor = "badge-hadir"; 
                              }

                              return (
                                <div key={item.schedule_id} style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '8px', borderLeft: '4px solid #38bdf8', marginBottom: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#0f172a' }}>
                                    SHIFT {item.shift_schedules?.shifts?.name?.toUpperCase()}
                                  </div>
                                  <div style={{ color: '#38bdf8', fontWeight: '600', marginTop: '0.25rem', marginBottom: '1rem' }}>
                                    {item.shift_schedules?.shifts?.start_time?.substring(0,5)} — {item.shift_schedules?.shifts?.end_time?.substring(0,5)}
                                  </div>
                                  
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}>IN</div>
                                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: inRecord ? '#0f172a' : '#94a3b8' }}>
                                        {inRecord ? formatTimeWIB(inRecord.waktu_absen) + ' ✓' : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}>OUT</div>
                                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: outRecord ? '#0f172a' : '#94a3b8' }}>
                                        {outRecord ? formatTimeWIB(outRecord.waktu_absen) + ' ✓' : '—'}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>STATUS</div>
                                    <span className={statusColor} style={{ display: 'inline-block' }}>{statusText}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p style={{ color: '#94a3b8', textAlign: 'center', margin: '1rem 0' }}>TIDAK ADA SHIFT HARI INI</p>
                          )}
                          
                          {todayShifts.length > 0 && (
                            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                              <button type="button" onClick={() => navigate('/scan')} className="btn btn-primary" style={{ width: '100%' }}>📷 Scan Absen (Kiosk)</button>
                            </div>
                          )}
                          
                          {upcomingShifts.length > 0 && (
                            <div style={{ marginTop: '2rem' }}>
                              <h4 style={{ fontSize: '1rem', color: '#475569', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>JADWAL BERIKUTNYA</h4>
                              {upcomingShifts.map(item => (
                                <div key={item.schedule_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                  <div>
                                    <div style={{ fontWeight: '600', color: '#334155' }}>
                                      {item.shift_schedules?.shifts?.name} ({item.shift_schedules?.shifts?.start_time?.substring(0,5)})
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                      {new Date(item.shift_schedules.schedule_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

              {activeTab === 'tugas' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className="page-title">TUGAS &amp; KEGIATAN</h2>
                    <button type="button" onClick={openCreateTaskModal} className="btn btn-primary btn-small" style={{ width: 'auto', marginBottom: '1rem' }}>+ Buat Task</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <TaskList tasks={tasks} formatDate={formatDate} currentUserRole={profile?.role} openTaskDetail={openTaskDetail} openEditTaskModal={openEditTaskModal} handleDeleteTask={handleDeleteTask} />
                    
                    <div className="event-section" style={{ minWidth: '300px', margin: '0' }}>
                      <div className="event-header">
                        <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>KEGIATAN SAYA (UPDATE & LOG)</h3>
                      </div>
                      {myActivityTasks.length > 0 ? (
                        <TaskList tasks={myActivityTasks} formatDate={formatDate} currentUserRole={profile?.role} openTaskDetail={openTaskDetail} openEditTaskModal={openEditTaskModal} handleDeleteTask={handleDeleteTask} />
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>Belum ada log aktivitas tugas.</p>
                      )}
                    </div>
                    
                    {/* Phase D: EVENT / KEGIATAN */}
                    <div className="event-section" style={{ minWidth: '300px', margin: '0' }}>
                      <h3 style={{ fontSize: '1.2rem', color: '#475569', marginBottom: '1rem' }}>KEGIATAN SAYA</h3>
                      <div className="event-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
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
                </>
              )}

              {activeTab === 'jadwal' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 className="page-title">JADWAL KESELURUHAN</h2>
                  </div>
                  
                  <div className="attendance-section attendance-card">
                    {allSchedules.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Belum ada jadwal tersedia.</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table" style={{ minWidth: '600px' }}>
                          <thead>
                            <tr>
                              <th>No</th>
                              <th>Nama Petugas</th>
                              <th>Hari, Tanggal</th>
                              <th>Shift</th>
                              <th>Seragam</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const todayStr = getJakartaDayBounds().dateStr;
                              const flattened = [];
                              allSchedules.forEach(schedule => {
                                (schedule.shift_members || []).forEach(member => {
                                  flattened.push({
                                    id: member.id,
                                    user_id: member.user_id,
                                    partnerName: member.profiles?.full_name || 'Unknown',
                                    date: schedule.schedule_date,
                                    shiftName: schedule.shifts?.name || 'Unknown',
                                    startTime: schedule.shifts?.start_time || '00:00:00'
                                  });
                                });
                              });

                              let filtered = flattened;
                              if (!showPastAllSchedules) {
                                filtered = filtered.filter(row => row.date >= todayStr);
                              }

                              filtered.sort((a, b) => {
                                if (a.date !== b.date) return a.date.localeCompare(b.date);
                                if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
                                return a.partnerName.localeCompare(b.partnerName);
                              });

                              const hasMore = allSchedulesLimit < filtered.length;
                              const visibleRows = filtered.slice(0, allSchedulesLimit);
                              
                              const seragamBadgeColor = (seragam) => {
                                const map = {
                                  'Batik': { bg: '#fef3c7', text: '#92400e' },
                                  'Navy': { bg: '#dbeafe', text: '#1e3a8a' },
                                  'Mustard': { bg: '#fef9c3', text: '#854d0e' },
                                };
                                return map[seragam] || { bg: '#f1f5f9', text: '#334155' };
                              };

                              const renderContent = [];
                              visibleRows.forEach((row, index) => {
                                const isToday = row.date === todayStr;
                                const prevRow = visibleRows[index - 1];
                                const showTodayDivider = isToday && (!prevRow || prevRow.date !== todayStr);
                                const isMine = row.user_id === profile?.id;
                                
                                if (showTodayDivider) {
                                  renderContent.push(
                                    <tr key={`divider-${row.date}`}>
                                      <td colSpan="5" style={{ backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: 'bold', textAlign: 'center', padding: '0.5rem' }}>
                                        ── HARI INI ──
                                      </td>
                                    </tr>
                                  );
                                }

                                const { dayName, dressCode } = getDressCode(row.date);
                                const dateObj = new Date(row.date);
                                const formattedDate = `${dayName}, ${dateObj.getDate()} ${dateObj.toLocaleString('id-ID', { month: 'short' })}`;
                                const badgeTheme = dressCode ? seragamBadgeColor(dressCode) : null;
                                
                                renderContent.push(
                                  <tr key={row.id} style={{ backgroundColor: isMine ? '#fef9c3' : (isToday ? '#eff6ff' : 'transparent'), fontWeight: isMine ? '600' : 'normal' }}>
                                    <td>{index + 1}</td>
                                    <td style={{ fontWeight: isMine ? 'bold' : '500' }}>{row.partnerName}</td>
                                    <td>{formattedDate}</td>
                                    <td>
                                      <span style={{ 
                                        backgroundColor: row.shiftName.toLowerCase() === 'pagi' ? '#fff7ed' : '#eff6ff', 
                                        color: row.shiftName.toLowerCase() === 'pagi' ? '#c2410c' : '#1d4ed8', 
                                        padding: '4px 8px', 
                                        borderRadius: '4px', 
                                        fontSize: '0.85rem', 
                                        fontWeight: '600' 
                                      }}>
                                        {row.shiftName}
                                      </span>
                                    </td>
                                    <td>
                                      {dressCode && badgeTheme ? (
                                        <span style={{ backgroundColor: badgeTheme.bg, color: badgeTheme.text, padding: '0.15rem 0.6rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '600' }}>
                                          {dressCode}
                                        </span>
                                      ) : '-'}
                                    </td>
                                  </tr>
                                );
                              });
                              
                              return (
                                <>
                                  {renderContent}
                                  <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' }}>
                                          <input 
                                            type="checkbox" 
                                            checked={showPastAllSchedules} 
                                            onChange={e => setShowPastAllSchedules(e.target.checked)} 
                                          />
                                          Tampilkan Jadwal Lampau
                                        </label>
                                        
                                        {hasMore && (
                                          <button 
                                            onClick={() => setAllSchedulesLimit(prev => prev + 20)}
                                            style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}
                                          >
                                            Muat Lebih Banyak ↓
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                </>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          )}
        </div>
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
                <label>Tugaskan Petugas</label>
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
            
            {(taskModalMode === 'create' || taskModalMode === 'edit') ? (
              <>
                <h2 style={{ marginBottom: '1.5rem' }}>{taskModalMode === 'create' ? 'Buat Task Baru' : 'Edit Task'}</h2>
                {formError && <div className="alert alert-error">{formError}</div>}
                <form onSubmit={taskModalMode === 'create' ? submitCreateTask : submitEditTask}>
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

                <div style={{ margin: '1.5rem 0', borderTop: '1px solid var(--border-color)' }}></div>

                {taskModalMode === 'detail_panitia' && (
                  <div style={{ marginBottom: '2rem' }}>
                    <form onSubmit={submitProgress} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                      <h4 style={{ marginBottom: '1rem' }}>Update Progress</h4>
                      {formError && <div className="alert alert-error">{formError}</div>}
                      <div className="form-group">
                        <label>Tambahan Kontribusi Anda (%)</label>
                        <input type="number" min="1" max="100" className="form-control" value={progressFormData.progress} onChange={e => setProgressFormData({...progressFormData, progress: e.target.value})} required />
                      </div>
                      <div className="form-group">
                        <label>Laporan / Catatan</label>
                        <textarea className="form-control" value={progressFormData.report} onChange={e => setProgressFormData({...progressFormData, report: e.target.value})} rows="2" required></textarea>
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Submit Progress'}</button>
                    </form>
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
                      <div style={{ color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '0.85rem' }}>Progress: +{log.progress_percent}% (Total: {log.total_progress_percent || log.progress_percent}%)</div>
                      {log.previous_status && log.new_status && log.previous_status !== log.new_status && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Status: {log.previous_status.replace('_', ' ')} &rarr; {log.new_status.replace('_', ' ')}</div>
                      )}
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

      {/* Modal Phase F: Panitia Management */}
      {isPanitiaModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '1.5rem' }}>{panitiaModalMode === 'create' ? 'Tambah Akun Panitia' : `Reset Password: ${selectedPanitia?.full_name}`}</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={submitPanitia}>
              {panitiaModalMode === 'create' && (
                <>
                  <div className="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" className="form-control" value={panitiaFormData.nama} onChange={e => setPanitiaFormData({...panitiaFormData, nama: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>NIM</label>
                    <input type="text" className="form-control" value={panitiaFormData.nim} onChange={e => setPanitiaFormData({...panitiaFormData, nim: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Username (ID Login)</label>
                    <input type="text" className="form-control" value={panitiaFormData.username} onChange={e => setPanitiaFormData({...panitiaFormData, username: e.target.value})} required />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>{panitiaModalMode === 'create' ? 'Password Awal' : 'Password Baru'}</label>
                <input type="password" minLength="6" className="form-control" value={panitiaFormData.password} onChange={e => setPanitiaFormData({...panitiaFormData, password: e.target.value})} required />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setIsPanitiaModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Shift Create */}
      {isShiftModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '1.5rem' }}>Tambah Jadwal Shift</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={handleAddShiftSchedule}>
              <div className="form-group">
                <label>Tanggal</label>
                <input type="date" className="form-control" value={shiftFormData.schedule_date} onChange={e => setShiftFormData({...shiftFormData, schedule_date: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Jadwal yang akan dibuat:</label>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: '0.75rem', fontWeight: 'bold', color: '#0f172a' }}>
                    SHIFT PAGI
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 'normal', marginTop: '0.25rem' }}>08:00 — 13:00</div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                    SHIFT SIANG
                    <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 'normal', marginTop: '0.25rem' }}>12:00 — 17:00</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setIsShiftModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Shift Members */}
      {isMemberModalOpen && selectedSchedule && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2 style={{ marginBottom: '0.5rem' }}>Kelola Petugas Shift</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              {new Date(selectedSchedule.schedule_date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — Shift {selectedSchedule.shifts?.name}
            </p>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={handleUpdateMembers}>
              <div className="form-group">
                <label>Pilih Petugas yang Bertugas</label>
                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem' }}>
                  {panitiaList.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                      <input 
                        type="checkbox" 
                        checked={memberFormData.selectedPanitia.includes(p.id)}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          if (isChecked) {
                            setMemberFormData({...memberFormData, selectedPanitia: [...memberFormData.selectedPanitia, p.id]});
                          } else {
                            setMemberFormData({...memberFormData, selectedPanitia: memberFormData.selectedPanitia.filter(id => id !== p.id)});
                          }
                        }}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <span style={{ fontWeight: '500', color: '#1e293b' }}>{p.full_name}</span>
                    </label>
                  ))}
                  {panitiaList.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Belum ada data petugas.</p>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setIsMemberModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Menyimpan...' : 'Simpan Assignment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Phase 7B: Station */}
      {isStationModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '1.5rem' }}>{pairingResult?.is_repair ? 'Pairing Code (Re-Pair)' : 'Register Kiosk Station Baru'}</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            {pairingResult ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', color: '#10b981' }}>Pairing Code:</h3>
                <div style={{ fontSize: '3rem', fontWeight: 'bold', letterSpacing: '0.2em', marginBottom: '1rem', fontFamily: 'monospace' }}>
                  {pairingResult.pairing_code}
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>Berlaku selama 10 menit.<br/>Masukkan PIN ini pada PC yang membuka /kiosk.</p>
                <div style={{ marginTop: '2rem' }}>
                  <button type="button" onClick={() => setIsStationModalOpen(false)} className="btn btn-primary">Tutup</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitStation}>
                <div className="form-group">
                  <label>Nama PC/Station (misal: "Meja Depan")</label>
                  <input type="text" className="form-control" value={stationFormData.name} onChange={e => setStationFormData({...stationFormData, name: e.target.value})} required />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button type="button" onClick={() => setIsStationModalOpen(false)} className="btn btn-primary" style={{ backgroundColor: 'var(--text-secondary)' }}>Batal</button>
                  <button type="submit" className="btn btn-primary" disabled={formLoading}>{formLoading ? 'Memproses...' : 'Generate PIN'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
