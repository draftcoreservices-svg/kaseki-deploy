import React, { useState, useEffect, useCallback } from 'react';
import api from './api';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import { ToastProvider } from './components/ToastContext';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [section, setSection] = useState(null);

  useEffect(() => {
    api.me()
      .then(d => { setUser(d.user); return api.getPreferences(); })
      .then(d => { if (d.preferences?.theme) setTheme(d.preferences.theme); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    api.savePreferences({ theme: next }).catch(() => {});
  }, [theme]);

  const handleLogin = useCallback((userData) => { setUser(userData); setSection(null); }, []);
  const handleLogout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setSection(null);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="auth-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <ToastProvider>
      {!user ? (
        <AuthPage onLogin={handleLogin} />
      ) : !section ? (
        <LandingPage user={user} theme={theme} onToggleTheme={toggleTheme} onSelectSection={setSection} onLogout={handleLogout} />
      ) : (
        <Dashboard section={section} onBack={() => setSection(null)} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </ToastProvider>
  );
}
