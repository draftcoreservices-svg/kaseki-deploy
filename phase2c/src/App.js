import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from './api';
import AuthPage from './pages/AuthPage';
import OnboardingWizard from './pages/OnboardingWizard';
import SettingsPage from './pages/SettingsPage';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import PomodoroPage from './components/PomodoroPage';
import GlobalSearch from './components/GlobalSearch';
import QuickCapture from './components/QuickCapture';
import ShortcutHelp from './components/ShortcutHelp';
import { ToastProvider } from './components/ToastContext';
import { EventProvider } from './components/EventContext';
import { TourProvider, useTour } from './components/TourContext';
import TourOverlay from './components/TourOverlay';
import TOUR_SCRIPT from './tour-script';
import Orb from './components/Orb';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [onboardingComplete, setOnboardingComplete] = useState(null);
  const [view, setView] = useState('landing'); // 'landing' | 'dashboard' | 'settings' | 'pomodoro'
  const [activeSpace, setActiveSpace] = useState(null);
  const [pendingOpenTask, setPendingOpenTask] = useState(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Phase H Stage 2 — tour completion flag loaded from preferences at startup.
  // null = not yet known; 0/1 = loaded. Prevents the tour from firing before
  // we know the user's actual status.
  const [tourCompleted, setTourCompleted] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me.user);
        const pref = await api.getPreferences().catch(() => ({ preferences: null }));
        if (cancelled) return;
        if (pref.preferences?.theme) setTheme(pref.preferences.theme);
        setTourCompleted(pref.preferences?.tour_completed ? 1 : 0);
        const status = await api.getOnboardingStatus().catch(() => ({ complete: false }));
        if (cancelled) return;
        setOnboardingComplete(!!status.complete);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    api.savePreferences({ theme: next }).catch(() => {});
  }, [theme]);

  const handleLogin = useCallback(async (userData) => {
    setUser(userData);
    try {
      const status = await api.getOnboardingStatus();
      setOnboardingComplete(!!status.complete);
    } catch {
      setOnboardingComplete(false);
    }
    setView('landing');
    setActiveSpace(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setOnboardingComplete(null);
    setActiveSpace(null);
    setView('landing');
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingComplete(true);
    setView('landing');
  }, []);

  const handleRestartOnboarding = useCallback(() => {
    setOnboardingComplete(false);
    setView('landing');
  }, []);

  const openSpace = useCallback((space) => {
    setActiveSpace(space);
    setView('dashboard');
    api.savePreferences({ last_active_space_id: space.id }).catch(() => {});
  }, []);

  // Phase C Batch 3 — open a specific task in its space. Used by the Countdown
  // modal on the landing page, where we know both the task id and its space
  // id but need to resolve the full space object before navigating. Looks up
  // via the API rather than caching spaces here — spaces are small, the call
  // is fast, and we avoid a second source of truth.
  const openTaskInSpace = useCallback(async (spaceId, taskId) => {
    try {
      const d = await api.getSpaces();
      const space = (d.spaces || []).find(s => s.id === spaceId);
      if (!space) return;
      setPendingOpenTask(taskId);
      setActiveSpace(space);
      setView('dashboard');
      api.savePreferences({ last_active_space_id: space.id }).catch(() => {});
    } catch (e) {
      // Silent fail — user can still navigate manually.
    }
  }, []);

  const backToLanding = useCallback(() => {
    setView('landing');
    setActiveSpace(null);
  }, []);

  const openPomodoro = useCallback(() => setView('pomodoro'), []);

  useEffect(() => {
    if (!user || !onboardingComplete) return;
    const isTyping = (e) => {
      const el = e.target;
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (isTyping(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        setQuickCaptureOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
        else if (quickCaptureOpen) setQuickCaptureOpen(false);
        else if (helpOpen) setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user, onboardingComplete, searchOpen, quickCaptureOpen, helpOpen]);

  if (loading || (user && onboardingComplete === null)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div className="auth-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (!user) {
    return (
      <EventProvider>
        <ToastProvider>
          <AuthPage onLogin={handleLogin} />
        </ToastProvider>
      </EventProvider>
    );
  }

  if (!onboardingComplete) {
    return (
      <EventProvider>
        <ToastProvider>
          <OnboardingWizard
            user={user}
            theme={theme}
            onToggleTheme={toggleTheme}
            onComplete={handleOnboardingComplete}
          />
        </ToastProvider>
      </EventProvider>
    );
  }

  return (
    <EventProvider>
    <TourProvider>
    <ToastProvider>
      <TourAutoStart tourCompleted={tourCompleted} view={view} />
      {view === 'settings' && (
        <SettingsPage
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={backToLanding}
          onRestartOnboarding={handleRestartOnboarding}
          onTourReplay={() => { setTourCompleted(0); }}
        />
      )}
      {view === 'pomodoro' && (
        <PomodoroPage
          onBack={activeSpace ? () => setView('dashboard') : backToLanding}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      {view === 'dashboard' && activeSpace && (
        <Dashboard
          space={activeSpace}
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={backToLanding}
          pendingOpenTask={pendingOpenTask}
          onPendingHandled={() => setPendingOpenTask(null)}
          onOpenPomodoro={openPomodoro}
          onOpenHelp={() => setHelpOpen(true)}
        />
      )}
      {view === 'landing' && (
        <LandingPage
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSelectSpace={openSpace}
          onOpenTaskInSpace={openTaskInSpace}
          onLogout={handleLogout}
          onOpenPomodoro={openPomodoro}
          onOpenSettings={() => setView('settings')}
          onOpenHelp={() => setHelpOpen(true)}
        />
      )}

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenTask={(id) => setPendingOpenTask(id)}
        onNavigateSpace={(space) => { openSpace(space); }}
      />
      <QuickCapture
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        onOpenSettings={() => setView('settings')}
        onCaptured={() => {}}
      />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Orb spaceColor={activeSpace?.color} />
      <TourOverlay />
    </ToastProvider>
    </TourProvider>
    </EventProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TourAutoStart
//
// Small helper that lives inside TourProvider so it can call useTour().
// Fires the onboarding tour once when the user lands in the dashboard OR
// landing view for the first time post-onboarding and their tour_completed
// flag is still 0. The 800ms delay lets the page settle so the spotlight
// target (.dash-add-btn) is measurable when step 2 activates.
//
// Runs at most once per App lifetime via startedRef. Persistence of the
// completion flag happens inside TourContext itself on skip/finish.
// ─────────────────────────────────────────────────────────────────────────
function TourAutoStart({ tourCompleted, view }) {
  const { start, tourActive } = useTour();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (tourCompleted !== 0) return;              // not loaded yet or already done
    if (view !== 'dashboard' && view !== 'landing') return;
    if (tourActive) return;
    startedRef.current = true;
    const t = setTimeout(() => { start(TOUR_SCRIPT); }, 800);
    return () => clearTimeout(t);
  }, [tourCompleted, view, tourActive, start]);

  return null;
}
