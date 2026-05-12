import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(loginId, password);
    setLoading(false);
    if (!result.success) setError(result.error || 'Login failed');
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream)' }}>
      <div className="w-full max-w-sm animate-[slideUp_.4s]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-bold"
            style={{ background: 'var(--teal)', fontFamily: 'var(--font-display)' }}
          >
            M
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
            Magnus Drive
          </h1>
          <p className="text-xs tracking-widest mt-1" style={{ color: 'var(--muted)' }}>
            MAGNUS AGENCIES
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl p-6 shadow-lg" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
                Login ID
              </label>
              <input
                type="text"
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all focus:ring-2"
                style={{
                  background: 'var(--soft)',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  '--tw-ring-color': 'var(--teal3)',
                }}
                placeholder="Enter your login ID"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all focus:ring-2"
                style={{
                  background: 'var(--soft)',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  '--tw-ring-color': 'var(--teal3)',
                }}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-xs px-3 py-2 rounded-lg font-medium"
                style={{ background: 'var(--diff-bg)', color: 'var(--danger)' }}
              >
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--teal)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] mt-4" style={{ color: 'var(--muted)' }}>
          Powered by Supabase • Secure Cloud Sync
        </p>
      </div>
    </div>
  );
}
