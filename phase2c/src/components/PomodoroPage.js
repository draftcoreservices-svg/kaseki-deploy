import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

// Phase 2C: PomodoroPage is a standalone page accessed via onOpenPomodoro.
// Props: onBack, theme, onToggleTheme
// Minimal-viable pomodoro preserving the Phase 2B feature set: configurable
// work/break durations (from prefs), start/pause/reset, session counting,
// backend tracking via /focus/start + /focus/:id/finish.

const DEFAULTS = {
  work: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  sessionsPerLongBreak: 4,
};

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PomodoroPage({ onBack, theme, onToggleTheme }) {
  const toast = useToast();
  const [durations, setDurations] = useState(DEFAULTS);
  const [phase, setPhase] = useState('work'); // 'work' | 'shortBreak' | 'longBreak'
  const [remaining, setRemaining] = useState(DEFAULTS.work);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [workCount, setWorkCount] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const tickRef = useRef(null);

  // Load preferences and today stats.
  useEffect(() => {
    api.getPreferences()
      .then(d => {
        const p = d.preferences || {};
        const next = {
          work: (p.pomodoro_work_mins || 25) * 60,
          shortBreak: (p.pomodoro_break_mins || 5) * 60,
          longBreak: (p.pomodoro_long_break_mins || 15) * 60,
          sessionsPerLongBreak: p.pomodoro_sessions_until_long_break || 4,
        };
        setDurations(next);
        setRemaining(next.work);
      })
      .catch(() => {});
    api.getFocusToday()
      .then(d => setTodayTotal(d.totalWorkSeconds || 0))
      .catch(() => {});
  }, []);

  const phaseLabel = phase === 'work' ? 'Focus' : phase === 'longBreak' ? 'Long break' : 'Short break';

  const start = async () => {
    if (running) return;
    try {
      const kind = phase === 'work' ? 'work' : (phase === 'longBreak' ? 'long_break' : 'short_break');
      const d = await api.startFocus({ kind, duration_seconds: durations[phase] });
      setSessionId(d.session.id);
      setRunning(true);
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const finish = useCallback(async (completed) => {
    if (sessionId) {
      try { await api.finishFocus(sessionId, { completed: completed ? 1 : 0 }); } catch (_) {}
    }
    setSessionId(null);
    setRunning(false);
  }, [sessionId]);

  const reset = () => {
    if (running) finish(false);
    setRemaining(durations[phase]);
  };

  const advancePhase = useCallback(() => {
    if (phase === 'work') {
      const newCount = workCount + 1;
      setWorkCount(newCount);
      setTodayTotal(t => t + durations.work);
      const nextPhase = newCount % durations.sessionsPerLongBreak === 0 ? 'longBreak' : 'shortBreak';
      setPhase(nextPhase);
      setRemaining(durations[nextPhase]);
      toast.show({ message: 'Pomodoro complete! Take a break.', type: 'success' });
    } else {
      setPhase('work');
      setRemaining(durations.work);
      toast.show({ message: 'Break over. Ready for another focus session.', type: 'info' });
    }
  }, [phase, workCount, durations, toast]);

  // Tick when running.
  useEffect(() => {
    if (!running) {
      clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(tickRef.current);
          finish(true);
          advancePhase();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running, finish, advancePhase]);

  const switchPhase = (next) => {
    if (running) return;
    setPhase(next);
    setRemaining(durations[next]);
  };

  const totalMinutesToday = Math.floor(todayTotal / 60);

  return (
    <div className="pom-root">
      <div className="pom-header">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <div className="pom-title">🍅 Pomodoro</div>
        <button className="icon-btn" onClick={onToggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>
      <div className="pom-main">
        <div className="pom-tabs">
          <button className={`pom-tab${phase === 'work' ? ' pom-tab--active' : ''}`} onClick={() => switchPhase('work')}>Focus</button>
          <button className={`pom-tab${phase === 'shortBreak' ? ' pom-tab--active' : ''}`} onClick={() => switchPhase('shortBreak')}>Short break</button>
          <button className={`pom-tab${phase === 'longBreak' ? ' pom-tab--active' : ''}`} onClick={() => switchPhase('longBreak')}>Long break</button>
        </div>
        <div className="pom-phase-label">{phaseLabel}</div>
        <div className="pom-time">{fmt(remaining)}</div>
        <div className="pom-controls">
          {!running ? (
            <button className="btn btn-primary pom-big-btn" onClick={start} disabled={remaining === 0}>Start</button>
          ) : (
            <button className="btn btn-primary pom-big-btn" onClick={() => finish(false)}>Pause</button>
          )}
          <button className="btn btn-ghost" onClick={reset}>Reset</button>
        </div>
        <div className="pom-stats">
          <div className="pom-stat"><span className="pom-stat-value">{workCount}</span><span className="pom-stat-label">Completed session{workCount !== 1 ? 's' : ''}</span></div>
          <div className="pom-stat"><span className="pom-stat-value">{totalMinutesToday}m</span><span className="pom-stat-label">Focused today</span></div>
        </div>
      </div>
    </div>
  );
}
