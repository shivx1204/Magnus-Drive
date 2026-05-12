import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { InventoryProvider } from './context/InventoryContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream)' }}>
        <div className="text-center animate-pulse">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-white text-lg font-bold"
            style={{ background: 'var(--teal)', fontFamily: 'var(--font-display)' }}
          >M</div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return user ? (
    <InventoryProvider>
      <Dashboard />
    </InventoryProvider>
  ) : (
    <Login />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'var(--paper)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              fontSize: '13px',
              borderRadius: '10px',
              boxShadow: 'var(--shadow)',
            },
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}
