import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

export const THEMES = [
  { id: 'light',    name: 'Classic',   color: '#1a3a32', icon: '☀' },
  { id: 'dark',     name: 'Dark',      color: '#3e9d7e', icon: '🌙' },
  { id: 'midnight', name: 'Midnight',  color: '#5c6bc0', icon: '' },
  { id: 'amber',    name: 'Amber',     color: '#f59e0b', icon: '' },
  { id: 'lavender', name: 'Lavender',  color: '#9c27b0', icon: '' },
  { id: 'slate',    name: 'Slate',     color: '#607d8b', icon: '' },
  { id: 'jetblack', name: 'Jet Black', color: '#666',    icon: '' },
  { id: 'beige',    name: 'Simple',    color: '#000000', icon: '✨' },
  { id: 'cineswipe',name: 'CineSwipe', color: '#ffb1c3', icon: '🎬' },
];

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('magnus_theme_v2') || 'cineswipe';
  });

  const setTheme = useCallback((id) => {
    setThemeState(id);
    localStorage.setItem('magnus_theme_v2', id);
    if (id === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', id);
    }
  }, []);

  // Apply on mount
  useEffect(() => {
    if (theme !== 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
