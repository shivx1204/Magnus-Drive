import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Users() {
  const { user, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Add User form ──
  const [newName, setNewName] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [newGodown, setNewGodown] = useState('1 Vasai');

  // ── Modal States ──
  const [activeModal, setActiveModal] = useState(null); // 'delete' | 'reset'
  const [modalUser, setModalUser] = useState(null);
  const [resetPwdInput, setResetPwdInput] = useState('');

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('app_users').select('id, name, login_id, role, godown, color');
      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error('Profiles fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line
    fetchProfiles(); 
  }, [fetchProfiles]);

  // ── Add user ──
  const handleAddUser = async () => {
    if (!isAdmin) { toast.error('⚠ Admins only'); return; }
    if (!newName.trim() || !newLogin.trim() || !newPass.trim()) { toast.error('⚠ All fields are required'); return; }
    if (!/^[a-z0-9_]+$/.test(newLogin.trim())) { toast.error('⚠ Login ID must be lowercase letters, numbers or underscores only'); return; }
    if (newPass.length < 6) { toast.error('⚠ Password must be at least 6 characters'); return; }
    if (profiles.find(p => p.login_id === newLogin.trim())) { toast.error(`⚠ Login ID "${newLogin}" is already taken`); return; }

    try {
      // 1. Create a proxy client to handle signup without disrupting the current dashboard session
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const email = newLogin.trim().toLowerCase() + '@magnus.app';
      let authResponse = await tempClient.auth.signUp({
        email,
        password: newPass.trim()
      });

      // Recovery bridge: if auth created successfully last time but display_name crashed the script midway
      if (authResponse.error && authResponse.error.message.toLowerCase().includes('already registered')) {
        authResponse = await tempClient.auth.signInWithPassword({
          email,
          password: newPass.trim()
        });
      }

      if (authResponse.error) throw authResponse.error;
      const authData = authResponse.data;

      // 2. Insert into local mapping with the same underlying UUID
      const colors = ['#e8b84b', '#2e7d65', '#2980b9', '#c9793a', '#6c3483', '#c0392b', '#16a085', '#8e44ad'];
      const newUser = {
        id: authData?.user?.id || ('user' + Date.now()), // Map precisely
        name: newName.trim(),
        login_id: newLogin.trim().toLowerCase(),
        password: newPass.trim(), // Cached locally for compatibility with legacy components if needed initially
        role: newRole,
        godown: newGodown,
        color: colors[profiles.length % colors.length],
      };

      const { error } = await supabase.from('app_users').insert(newUser);
      if (error) throw error;
      
      toast.success(`✓ User "${newName}" created securely`);
      setNewName(''); setNewLogin(''); setNewPass(''); setNewRole('staff');
      fetchProfiles();
    } catch (err) {
      toast.error('⚠ Failed to create user: ' + (err.message || 'Unknown error. Check if email exists.'));
    }
  };

  // ── Delete user ──
  const initDeleteUser = (userId, userName) => {
    if (!isAdmin) { toast.error('⚠ Admins only'); return; }
    if (user?.id === userId) { toast.error('⚠ You cannot delete your own account'); return; }
    setModalUser({ id: userId, name: userName });
    setActiveModal('delete');
  };

  const confirmDeleteUser = async () => {
    if (!modalUser) return;
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modalUser.id);

      if (isUUID) {
        const { error: rpcErr } = await supabase.rpc('admin_delete_user', { target_user_id: modalUser.id });
        if (rpcErr) throw rpcErr;
      }
      
      // Fallback clean-up if cascading isn't mapped, or if they are legacy local-only users
      await supabase.from('app_users').delete().eq('id', modalUser.id);
      
      toast.success(`✓ User "${modalUser.name}" deleted`);
      fetchProfiles();
    } catch (err) {
      toast.error('⚠ Failed to delete user: ' + (err.message || 'Unknown error'));
    } finally {
      setActiveModal(null);
      setModalUser(null);
    }
  };

  // ── Update display name ──
  const handleUpdateName = async (userId, inputId) => {
    if (!isAdmin) { toast.error('⚠ Admins only'); return; }
    const el = document.getElementById(inputId);
    const newNameVal = el?.value?.trim();
    if (!newNameVal) { toast.error('⚠ Name cannot be empty'); return; }

    try {
      const { error } = await supabase.from('app_users').update({ name: newNameVal }).eq('id', userId);
      if (error) throw error;
      toast.success('✓ Display name updated');
      fetchProfiles();
    } catch {
      toast.error('⚠ Failed to update name');
    }
  };

  // ── Update login ID ──
  const handleUpdateLoginId = async (userId, inputId) => {
    if (!isAdmin) { toast.error('⚠ Admins only'); return; }
    const el = document.getElementById(inputId);
    const newId = el?.value?.trim()?.toLowerCase();
    if (!newId) { toast.error('⚠ Login ID cannot be empty'); return; }
    if (!/^[a-z0-9_]+$/.test(newId)) { toast.error('⚠ Login ID must be lowercase letters, numbers or underscores'); return; }
    const dup = profiles.find(p => p.login_id === newId && p.id !== userId);
    if (dup) { toast.error(`⚠ Login ID "${newId}" is already taken by ${dup.name || dup.display_name}`); return; }

    try {
      const { error } = await supabase.from('app_users').update({ login_id: newId }).eq('id', userId);
      if (error) throw error;
      toast.success(`✓ Login ID updated to "${newId}"`);
      fetchProfiles();
    } catch {
      toast.error('⚠ Failed to update Login ID');
    }
  };

  // ── Update Godown ──
  const handleUpdateGodown = async (userId, newGodownAssignment) => {
    if (!isAdmin) { toast.error('⚠ Admins only'); return; }
    try {
      const { error } = await supabase.from('app_users').update({ godown: newGodownAssignment }).eq('id', userId);
      if (error) throw error;
      toast.success(`✓ Godown updated to ${newGodownAssignment}`);
      fetchProfiles();
    } catch {
      toast.error('⚠ Failed to update Godown');
    }
  };

  // ── Change password ──
  const initResetPwd = (userId, userName) => {
    if (!isAdmin) { toast.error('⚠ Admins only'); return; }
    const isSelf = user?.id === userId;
    setModalUser({ id: userId, name: userName, isSelf });
    setResetPwdInput('');
    setActiveModal('reset');
  };

  const confirmResetPwd = async () => {
    if (!modalUser || !resetPwdInput) return;
    if (resetPwdInput.length < 6) { toast.error('⚠ Password must be at least 6 characters'); return; }

    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modalUser.id);

      if (modalUser.isSelf) {
        // Self-serve password update directly to Supabase Auth
        const { error: authErr } = await supabase.auth.updateUser({ password: resetPwdInput });
        if (authErr) throw authErr;
        // Keep tracker table aligned
        await supabase.from('app_users').update({ password: resetPwdInput }).eq('id', modalUser.id);
      } else {
        // Admin force-resetting another staff's password via secure RPC bypass
        if (isUUID) {
          const { error: rpcErr } = await supabase.rpc('admin_reset_password', {
            target_user_id: modalUser.id,
            new_password: resetPwdInput
          });
          if (rpcErr) throw rpcErr;
        }
        // Keep tracker table aligned
        await supabase.from('app_users').update({ password: resetPwdInput }).eq('id', modalUser.id);
      }
      
      toast.success(`✓ Password ${modalUser.isSelf ? 'changed' : 'reset for ' + modalUser.name} successfully`);
    } catch (err) {
      toast.error('⚠ Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setActiveModal(null);
      setModalUser(null);
      setResetPwdInput('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Add User Card */}
      {isAdmin && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
          <div className="px-4 py-3 font-semibold text-sm" style={{ background: '#1a1a2e', color: '#fff' }}>
            ➕ Add New User
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Display Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Staff 5"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Login ID</label>
                <input value={newLogin} onChange={e => setNewLogin(e.target.value)} placeholder="e.g. staff5"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Password</label>
                <input value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="e.g. staff5@123"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
              </div>
              <div className="w-28">
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="w-32">
                <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Godown</label>
                <select value={newGodown} onChange={e => setNewGodown(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <option value="1 Vasai">1 Vasai</option>
                  <option value="2 Virar">2 Virar</option>
                </select>
              </div>
              <button onClick={handleAddUser} className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--success)' }}>
                ✓ Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Users */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--paper)', boxShadow: 'var(--shadow)' }}>
        <div className="px-4 py-3 font-semibold text-sm" style={{ background: '#1a1a2e', color: '#fff' }}>
          👥 Existing Users
        </div>
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8" style={{ color: 'var(--muted)' }}>
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block mr-2" />
              Loading users...
            </div>
          ) : profiles.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>No users found.</div>
          ) : (
            profiles.map(u => {
              const isSelf = user?.id === u.id;
              const displayName = u.display_name || u.name || u.login_id;
              return (
                <div key={u.id} className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'var(--soft)', border: '1px solid var(--line)' }}>
                  {/* User Info Row */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: u.color || '#2e7d65' }}>
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                        {displayName}
                        {isSelf && <span className="text-[10px] opacity-50">(you)</span>}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                        Login: <b>{u.login_id}</b> · Role: <b>{u.role}</b> · Godown: <b style={{ color: 'var(--gold)' }}>{u.godown || '1 Vasai'}</b>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                      style={{
                        background: u.role === 'admin' ? 'rgba(232,184,75,.25)' : 'var(--line)',
                        color: u.role === 'admin' ? 'var(--gold)' : 'var(--muted)',
                      }}>
                      {u.role}
                    </span>
                  </div>

                  {/* Admin Controls */}
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2 items-center pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
                      <input id={`name-${u.id}`} defaultValue={displayName} placeholder="Display Name"
                        className="px-2 py-1 rounded text-xs outline-none w-28"
                        style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                      <button onClick={() => handleUpdateName(u.id, `name-${u.id}`)}
                        className="px-2.5 py-1 rounded text-[10px] font-bold text-white" style={{ background: 'var(--teal)' }}>Save Name</button>

                      <input id={`lid-${u.id}`} defaultValue={u.login_id} placeholder="Login ID"
                        className="px-2 py-1 rounded text-xs outline-none w-24"
                        style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' }} />
                      <button onClick={() => handleUpdateLoginId(u.id, `lid-${u.id}`)}
                        className="px-2.5 py-1 rounded text-[10px] font-bold text-white" style={{ background: 'var(--info)' }}>Save ID</button>

                      <select defaultValue={u.godown || '1 Vasai'} onChange={e => handleUpdateGodown(u.id, e.target.value)}
                        className="px-2 py-1 rounded text-xs outline-none bg-black/10 border-none font-bold"
                        style={{ color: 'var(--teal3)' }}>
                        <option value="1 Vasai">1 Vasai</option>
                        <option value="2 Virar">2 Virar</option>
                      </select>

                      <button onClick={() => initResetPwd(u.id, displayName)}
                        className="px-2.5 py-1 rounded text-[10px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                        {isSelf ? '🔑 My Pwd' : '🔑 Reset Pwd'}
                      </button>

                      {!isSelf ? (
                        <button onClick={() => initDeleteUser(u.id, displayName)}
                          className="px-2.5 py-1 rounded text-[10px] font-bold" style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                          🗑 Delete
                        </button>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Cannot delete self</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* ── Action Modals ── */}
      {activeModal === 'delete' && modalUser && (
        <div className="fixed inset-0 bg-black/60 z-[99] flex items-center justify-center p-4 backdrop-blur-sm transition-all">
          <div className="rounded-2xl w-full max-w-sm p-6 shadow-2xl relative" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
             <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Confirm Deletion</h3>
             <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Are you sure you want to permanently delete <strong>{modalUser.name}</strong>? This action cannot be technically undone.</p>
             <div className="flex gap-3 justify-end items-center">
               <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-lg text-xs font-bold hover:bg-black/5" style={{ color: 'var(--ink)' }}>Cancel</button>
               <button onClick={confirmDeleteUser} className="px-4 py-2 rounded-lg text-sm shadow-sm font-bold text-white transition-all hover:-translate-y-0.5" style={{ background: 'var(--danger)' }}>
                 Yes, Delete User
               </button>
             </div>
          </div>
        </div>
      )}

      {activeModal === 'reset' && modalUser && (
        <div className="fixed inset-0 bg-black/60 z-[99] flex items-center justify-center p-4 backdrop-blur-sm transition-all">
          <div className="rounded-2xl w-full max-w-sm p-6 shadow-2xl relative" style={{ background: 'var(--paper)', border: '1px solid var(--line)' }}>
             <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>{modalUser.isSelf ? 'Change Your Password' : 'Force Reset Password'}</h3>
             <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
               {modalUser.isSelf ? 'Update your own login password below:' : <>Set a new secure password for <strong>{modalUser.name}</strong></>}
             </p>
             <div className="space-y-4 mb-6">
               <div>
                 <input 
                   autoFocus
                   type="text"
                   value={resetPwdInput} 
                   onChange={e => setResetPwdInput(e.target.value)}
                   className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border focus:ring-2"
                   style={{ borderColor: 'var(--line)', background: 'var(--soft)', color: 'var(--ink)' }}
                   placeholder="New password (min 6 chars)"
                 />
               </div>
             </div>
             <div className="flex gap-3 justify-end items-center">
               <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-lg text-xs font-bold hover:bg-black/5" style={{ color: 'var(--ink)' }}>Cancel</button>
               <button 
                 onClick={confirmResetPwd} 
                 disabled={resetPwdInput.length < 6}
                 className={`px-4 py-2 rounded-lg text-sm shadow-sm font-bold text-white transition-all ${resetPwdInput.length < 6 ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
                 style={{ background: 'var(--accent)' }}
               >
                 Confirm Reset
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
