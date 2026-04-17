import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from './api';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import PomodoroPage from './components/PomodoroPage';
import { ToastProvider } from './components/ToastContext';
import GlobalSearch from './components/GlobalSearch';
import QuickCapture from './components/QuickCapture';
import ShortcutHelp from './components/ShortcutHelp';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  // view: { kind: 'landing' | 'section' | 'pomodoro', section?: 'home'|'work'|'inbox' }
  const [view, setView] = useState({ kind: 'landing' });
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingOpenTask, setPendingOpenTask] = useState(null);

  useEffect(() => {
    api.me()
      .then(d => { setUser(d.user); return api.getPreferences(); })
      .then(d => {
        if (d.preferences?.theme) setTheme(d.preferences.theme);
        if (d.preferences?.keyboard_shortcuts_enabled === 0) setShortcutsEnabled(false);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    api.savePreferences({ theme: next }).catch(() => {});
  }, [theme]);

  const handleLogin = useCallback((userData) => { setUser(userData); setView({ kind: 'landing' }); }, []);
  const handleLogout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setView({ kind: 'landing' });
  }, []);

  const goLanding = useCallback(() => setView({ kind: 'landing' }), []);
  const goSection = useCallback((section) => setView({ kind: 'section', section }), []);
  const goPomodoro = useCallback(() => setView({ kind: 'pomodoro' }), []);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!user || !shortcutsEnabled) return;
    const isTyping = (e) => {
      const el = e.target;
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const anyModalOpen = () => searchOpen || captureOpen || helpOpen;

    const handler = (e) => {
      if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); e.preventDefault(); return; }
        if (captureOpen) { setCaptureOpen(false); e.preventDefault(); return; }
        if (helpOpen) { setHelpOpen(false); e.preventDefault(); return; }
      }
      if (anyModalOpen()) return;
      if (isTyping(e)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'N') {
        e.preventDefault();
        setCaptureOpen(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user, shortcutsEnabled, searchOpen, captureOpen, helpOpen]);

  const handleOpenTaskFromSearch = useCallback((taskId) => {
    setPendingOpenTask(taskId);
  }, []);
  const clearPendingOpenTask = useCallback(() => setPendingOpenTask(null), []);

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
      ) : view.kind === 'landing' ? (
        <LandingPage
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSelectSection={goSection}
          onLogout={handleLogout}
          onOpenPomodoro={goPomodoro}
        />
      ) : view.kind === 'pomodoro' ? (
        <PomodoroPage
          onBack={goLanding}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <Dashboard
          section={view.section}
          onBack={goLanding}
          theme={theme}
          onToggleTheme={toggleTheme}
          pendingOpenTask={pendingOpenTask}
          onPendingHandled={clearPendingOpenTask}
          onOpenPomodoro={goPomodoro}
        />
      )}
      {user && (
        <>
          <GlobalSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onOpenTask={handleOpenTaskFromSearch}
            onNavigateSection={goSection}
          />
          <QuickCapture
            open={captureOpen}
            onClose={() => setCaptureOpen(false)}
            onCaptured={() => { /* dashboard will refresh when we navigate to inbox */ }}
          />
          <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        </>
      )}
    </ToastProvider>
  );
}
