import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const SESSION_KEY = 'magnus_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeGodown, setActiveGodown] = useState('1 Vasai');

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        setActiveGodown(parsed.godown || '1 Vasai');
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (loginId, password) => {
    try {
      const cleanId = loginId.trim().toLowerCase();
      let email = cleanId.includes('@') ? cleanId : `${cleanId}@magnus.app`;
      
      // 1. Authenticate with Supabase Native Auth
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      // Fallback for legacy accounts that use @magnusagencies.com
      if ((authError || !authData?.user) && !cleanId.includes('@')) {
        email = `${cleanId}@magnusagencies.com`;
        const retry = await supabase.auth.signInWithPassword({ email, password });
        authData = retry.data;
        authError = retry.error;
      }

      if (authError || !authData?.user) return { success: false, error: authError?.message || 'Invalid credentials' };

      // 2. Fetch the linked Local Profile
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('login_id', cleanId.split('@')[0])
        .single();
        
      if (error || !data) return { success: false, error: 'App profile not found for this user.' };

      let ip = 'Unknown IP';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        ip = ipData.ip || 'Unknown IP';
      } catch (e) { console.warn('Failed to fetch IP', e); }

      const userData = {
        id: data.id,
        login_id: data.login_id,
        display_name: data.name || data.login_id,
        role: data.role,
        godown: data.godown || '1 Vasai',
        ip: ip
      };
      setUser(userData);
      setActiveGodown(userData.godown);
      localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
      
      // Log activity
      try {
        await supabase.from('activity_log').insert([{
          time: new Date().toLocaleString('en-IN'),
          user_name: data.display_name || data.name || data.login_id,
          login_id: data.login_id,
          role: data.role,
          action: 'System Login',
          details: `Logged in from IP: ${ip}`
        }]);
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      return { success: true, user: userData };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActiveGodown('1 Vasai');
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const changePassword = useCallback(async (userId, newPassword) => {
    const { error } = await supabase
      .from('app_users')
      .update({ password: newPassword })
      .eq('id', userId);
    return !error;
  }, []);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;

  // Ensure staff cannot switch godowns arbitrarily bypass logic:
  const setGodownSafely = useCallback((newGodown) => {
    if (!isAdmin && !isManager) return; // Staff locked to their assignment
    setActiveGodown(newGodown);
  }, [isAdmin, isManager]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, isAdmin, isManager, activeGodown, setActiveGodown: setGodownSafely }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
