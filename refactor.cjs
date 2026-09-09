const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8');

// 1. Add imports
if (!code.includes('import KpiSummary')) {
  code = code.replace(
    'import { getJakartaDayBounds, formatTimeWIB } from \'../utils/dateUtils\';',
    'import { getJakartaDayBounds, formatTimeWIB } from \'../utils/dateUtils\';\nimport KpiSummary from \'../components/KpiSummary\';\nimport TaskList from \'../components/TaskList\';\nimport PanitiaTable from \'../components/PanitiaTable\';'
  );
}

// 2. Replace Navbar with Sidebar
const oldNavbar = `    <div className="dashboard-layout">
      <nav className="navbar">
        <div className="container">
          <div className="navbar-brand">Sistem PMB</div>
          <div className="user-menu">
            <span className="user-name">{profile.full_name}</span>
            <span className="user-role">{profile.role}</span>
            <button type="button" onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </nav>

      <main className="dashboard-content container">`;

const newSidebar = `    <div className="dashboard-layout">
      <div className="dashboard-sidebar">
        <div className="navbar-brand">AbsenPMB</div>
        <div className="sidebar-nav">
          <div className="sidebar-nav-item active">🏠 Dashboard</div>
        </div>
        <div className="sidebar-footer">
          <div className="user-menu" style={{ flexDirection: 'column', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.25rem' }}>
            <span className="user-name" style={{ fontWeight: 'bold' }}>{profile?.full_name}</span>
            <span className="user-role">{profile?.role}</span>
          </div>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <main className="dashboard-main">
        <div className="dashboard-content">`;

code = code.replace(oldNavbar, newSidebar);

// 3. Add KpiSummary for Dosen
const dosenHeader = `          <div className="dashboard-placeholder dosen-view" style={{ padding: '2rem', display: 'block', textAlign: 'left', border: 'none' }}>`;
const newDosenHeader = dosenHeader + `
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.75rem' }}>DASHBOARD DOSEN</h2>
            <KpiSummary monitoringData={monitoringData} panitiaList={panitiaList} />
`;
code = code.replace(dosenHeader, newDosenHeader);

// 4. Replace MANAJEMEN PANITIA with <PanitiaTable>
const startPanitia = `            {/* Phase F: MANAJEMEN PANITIA */}`;
const endPanitia = `                </table>
              </div>
            </div>`;

const startIdx = code.indexOf(startPanitia);
const endIdx = code.indexOf(endPanitia, startIdx) + endPanitia.length;
if (startIdx > -1 && endIdx > -1) {
  const replacement = `            {/* Phase F: MANAJEMEN PANITIA */}
            <PanitiaTable 
              panitiaList={panitiaList}
              showInactive={showInactive}
              setShowInactive={setShowInactive}
              openCreatePanitiaModal={openCreatePanitiaModal}
              openResetPasswordModal={openResetPasswordModal}
              handleToggleActive={handleToggleActive}
              handleQuickAssignShift={handleQuickAssignShift}
              shiftsList={shiftsList}
            />`;
  code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
}

// 5. Enhance Panitia view with Giant CTA and use TaskList
const panitiaHeader = `          <div className="dashboard-placeholder panitia-view" style={{ padding: '2rem', display: 'block', textAlign: 'left', border: 'none' }}>
            <h2>DASHBOARD PANITIA</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Selamat datang, {profile.full_name}.</p>
            
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>`;

const newPanitiaHeader = `          <div className="dashboard-placeholder panitia-view" style={{ padding: '2rem', display: 'block', textAlign: 'left', border: 'none' }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.75rem' }}>DASHBOARD PANITIA</h2>
            
            <button 
              className="btn-giant-cta" 
              onClick={() => navigate('/scan')}
              style={{ marginBottom: '3rem' }}
            >
              📸 Scan Absen (Kiosk)
            </button>
            
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>`;

code = code.replace(panitiaHeader, newPanitiaHeader);

// Remove the old Scan button
const oldScanBtnBlock = `                      {todayShifts.length > 0 && (
                        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                          <button type="button" onClick={() => navigate('/scan')} className="btn btn-primary" style={{ width: '100%' }}>📷 Scan Absen (Kiosk)</button>
                        </div>
                      )}`;
code = code.replace(oldScanBtnBlock, '');


// 6. Replace TaskList in Panitia
const startTaskPanitia = `              {/* Phase E: TASK / WORKBOARD */}`;
const endTaskPanitia = `                </div>
              </div>`;
              
const startTaskIdx = code.indexOf(startTaskPanitia);
const endTaskIdx = code.indexOf(endTaskPanitia, startTaskIdx) + endTaskPanitia.length;
if (startTaskIdx > -1 && endTaskIdx > -1) {
  const replacement = `              {/* Phase E: TASK / WORKBOARD */}
              <TaskList tasks={tasks} formatDate={formatDate} openTaskDetail={openTaskDetail} />`;
  code = code.substring(0, startTaskIdx) + replacement + code.substring(endTaskIdx);
}

// Write the changes
fs.writeFileSync('src/pages/Dashboard.jsx', code, 'utf8');
console.log('Successfully updated Dashboard.jsx');
