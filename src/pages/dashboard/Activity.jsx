import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Activity() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({ text: '⏳ Loading...', type: 'loading' });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setSyncStatus({ text: '⏳ Fetching...', type: 'loading' });
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('id', { ascending: false })
        .limit(10000);

      if (error) throw error;

      const mapped = (data || []).map(row => ({
        id: row.id,
        time: row.time,
        userName: row.user_name,
        loginId: row.login_id,
        role: row.role,
        action: row.action,
        details: row.details,
      }));

      setLogs(mapped);
      setSyncStatus({ text: `✓ ${mapped.length} entries`, type: 'success' });
    } catch (err) {
      console.error('Activity fetch error:', err);
      setSyncStatus({ text: '✕ Error', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const statusStyle = {
    loading: { background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)' },
    success: { background: 'rgba(39,174,96,.3)', color: '#6dffb0' },
    error: { background: 'rgba(192,57,43,.3)', color: '#ff8a80' },
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ background: 'var(--teal)', color: '#f2ebd9' }}>
        <span className="font-semibold text-sm">📝 Activity Log</span>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,.6)' }}>☁ Synced to Supabase Cloud</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={statusStyle[syncStatus.type]}>
          {syncStatus.text}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={fetchLogs} className="btn-header" title="Refresh from Supabase">🔄 Refresh</button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="w-full text-xs" style={{ minWidth: '520px' }}>
          <thead>
            <tr style={{ background: 'var(--teal)' }}>
              {['Time', 'User', 'Role', 'Action', 'Details'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#f2ebd9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8" style={{ color: 'var(--muted)' }}>
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Fetching from Supabase...
                  </div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8" style={{ color: 'var(--muted)' }}>No activity yet.</td>
              </tr>
            ) : (
              logs.map(entry => (
                <tr key={entry.id} className="border-b transition-colors" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink)', fontSize: 11 }}>{entry.time}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--ink)' }}>{entry.userName || entry.loginId}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{
                      background: entry.role === 'admin' ? 'var(--pur-bg)' : 'var(--final-bg)',
                      color: 'var(--ink)',
                    }}>{entry.role}</span>
                  </td>
                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--ink)' }}>{entry.action}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--muted)', fontSize: 11 }}>{entry.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
