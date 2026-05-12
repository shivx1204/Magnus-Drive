import { useAuth } from '../context/AuthContext';
import ThemePicker from './ThemePicker';

export default function Header({ onSync, onExportJSON, onImportJSON, onExportExcel, onImportExcel, onToggleSidebar }) {
  const { user, logout, isAdmin, isManager, activeGodown, setActiveGodown } = useAuth();

  return (
    <header className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 sticky top-0 z-50 bg-transparent backdrop-blur-md w-full min-w-0"
      style={{ color: 'var(--ink)' }}
    >
      {/* Mobile Toggle & Title */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-shrink-0">
        <button className="hamburger-btn md:hidden" onClick={onToggleSidebar} style={{ display: 'none' }}>
          ☰
        </button>
        <div className="flex items-center gap-2">
          {/* Logo only visible on mobile Header (since desktop has sidebar) */}
          <div className="w-7 h-7 flex items-center justify-center shrink-0 md:hidden">
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20V4L12 12" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 12L20 4V20" stroke="#ff4b89" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl md:text-xl font-bold tracking-tight truncate flex items-center" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="md:hidden">Magnus Drive</span>
              <span className="hidden md:inline">Dashboard</span>
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5 tracking-wide uppercase hidden sm:block">Magnus Agencies</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="header-actions flex-shrink-0">
        {/* Godown Switcher — hidden on very small screens */}
        {user && (isAdmin || isManager) && (
          <select
            value={activeGodown}
            onChange={(e) => setActiveGodown(e.target.value)}
            className="btn-header header-godown-select !bg-[#2c2211] !border-[#ee9d0c]/30 text-[#ee9d0c] font-bold outline-none pl-3 pr-2 py-1.5 flex items-center"
            style={{ borderRadius: '8px' }}
          >
            <option value="1 Vasai">🏢 1 Vasai</option>
            <option value="2 Virar">🏢 2 Virar</option>
          </select>
        )}

        {user && (isAdmin || isManager) && <div className="w-px h-6 mx-1 hidden sm:block" style={{ background: 'var(--line)' }}></div>}

        {/* Database Utilities Dropdown */}
        {user && (
          <details className="relative group/db">
            <summary className="btn-header list-none cursor-pointer" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
              🗄️ <span className="hidden sm:inline">Backup</span>
            </summary>
            <div className="absolute right-0 top-full mt-1 w-32 rounded-lg shadow-xl border overflow-hidden flex flex-col z-50"
                 style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
              {(isAdmin || isManager) && <button onClick={onExportJSON} className="px-3 py-2 text-xs text-left hover:bg-black/5" style={{ color: 'var(--ink)' }}>⬇ Export JSON</button>}
              <button onClick={onImportJSON} className="px-3 py-2 text-xs text-left hover:bg-black/5" style={{ color: 'var(--ink)' }}>⬆ Import JSON</button>
              {(isAdmin || isManager) && <button onClick={onExportExcel} className="px-3 py-2 text-xs text-left hover:bg-black/5 border-t" style={{ color: 'var(--ink)', borderColor: 'var(--line)' }}>📊 Export Excel</button>}
              <button onClick={onImportExcel} className="px-3 py-2 text-xs text-left hover:bg-black/5" style={{ color: 'var(--ink)' }}>📂 Import Excel</button>
            </div>
          </details>
        )}

        {/* Font size slider — hidden on mobile */}
        <div className="header-font-sizer flex items-center gap-2 mr-2 px-2 py-1 rounded-lg border" style={{ background: 'var(--soft)', borderColor: 'var(--line)' }}>
          <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--muted)' }}>T</span>
          <input type="range" min="9" max="16" defaultValue="11"
            onChange={(e) => document.documentElement.style.setProperty('--table-font-size', e.target.value + 'px')}
            className="w-16 h-1 rounded-lg appearance-none cursor-pointer"
            style={{ background: 'var(--line)' }}
          />
          <span className="text-sm font-bold" style={{ color: 'var(--muted)' }}>T</span>
        </div>

        <ThemePicker />

        <button onClick={onSync} className="btn-header" style={{ background: 'var(--soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}>☁ <span className="hidden sm:inline">Sync</span></button>
        <button onClick={logout} className="btn-header" style={{ background: 'rgba(255, 77, 79, 0.15)', border: '1px solid rgba(255, 77, 79, 0.3)', color: 'var(--danger)' }}>
          🚪 <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
