import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemePicker() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = themes.find(t => t.id === theme);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm cursor-pointer transition-all hover:bg-white/20"
        title="Change theme"
      >
        <span
          className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/50"
          style={{ background: current?.color || '#1a3a32' }}
        />
        🎨
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-[9999] min-w-[200px] rounded-xl p-2.5 shadow-2xl animate-[fadeIn_.15s]"
          style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}
        >
          <div className="text-[9px] uppercase tracking-wider font-semibold px-1 pb-1.5 mb-1.5 border-b"
            style={{ color: 'var(--muted)', borderColor: 'var(--line)' }}
          >
            🎨 Choose Theme
          </div>
          {themes.map(t => (
            <div
              key={t.id}
              onClick={() => { setTheme(t.id); setOpen(false); }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs font-medium
                ${theme === t.id ? 'font-bold' : ''}
              `}
              style={{
                color: 'var(--ink)',
                background: theme === t.id ? 'var(--soft)' : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--soft)'}
              onMouseLeave={e => e.currentTarget.style.background = theme === t.id ? 'var(--soft)' : 'transparent'}
            >
              <span
                className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] text-white"
                style={{ background: t.color, border: `2px solid ${t.color}44` }}
              >
                {t.icon}
              </span>
              {t.name}
              {theme === t.id && <span className="ml-auto text-[10px]">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
