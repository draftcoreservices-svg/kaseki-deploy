import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

const MODES = {
  work:       { label: 'Focus',       color: '#ef4444', emoji: '🍅' },
  break:      { label: 'Short Break', color: '#34d399', emoji: '☕' },
  long_break: { label: 'Long Break',  color: '#60a5fa', emoji: '🌴' },
};

function fmtClock(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}
function fmtDate(d) {
  return new Date(d + (d.includes('Z') ? '' : 'Z')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PomodoroPage({ onBack, theme, onToggleTheme, initialTaskId = null }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState({ work: 25, br: 5, longBr: 15, untilLong: 4 });
  const [mode, setMode] = useState('work'); // 'work' | 'break' | 'long_break'
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [taskId, setTaskId] = useState(initialTaskId);
  const [tasks, setTasks] = useState({ home: [], work: [], inbox: [] });
  const [history, setHistory] = useState([]);
  const [todayStats, setTodayStats] = useState({ sessions_completed: 0, total_minutes: 0 });
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const intervalRef = useRef(null);

  const durationFor = useCallback((m) => {
    if (m === 'work') return prefs.work * 60;
    if (m === 'long_break') return prefs.longBr * 60;
    return prefs.br * 60;
  }, [prefs]);

  // Load prefs + task lists + history
  useEffect(() => {
    api.getPreferences()
      .then(d => {
        const p = d.preferences || {};
        const next = {
          work: p.pomodoro_work_mins || 25,
          br: p.pomodoro_break_mins || 5,
          longBr: p.pomodoro_long_break_mins || 15,
          untilLong: p.pomodoro_sessions_until_long_break || 4,
        };
        setPrefs(next);
        if (!running) setSecondsLeft(next.work * 60);
      })
      .catch(() => {});

    Promise.all([
      api.getTasks('home').catch(() => ({ tasks: [] })),
      api.getTasks('work').catch(() => ({ tasks: [] })),
      api.getTasks('inbox').catch(() => ({ tasks: [] })),
    ]).then(([h, w, i]) => {
      setTasks({ home: h.tasks || [], work: w.tasks || [], inbox: i.tasks || [] });
    });

    refreshHistory();
  }, []);

  const refreshHistory = () => {
    api.getRecentFocus(10).then(d => setHistory(d.sessions || [])).catch(() => {});
    api.getFocusToday().then(d => setTodayStats(d)).catch(() => {});
  };

  // When mode changes while not running, reset the clock to that mode's duration
  useEffect(() => {
    if (!running) setSecondsLeft(durationFor(mode));
  }, [mode, prefs]);

  // Tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          // fire completion
          handleSessionComplete();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  // Update document title with countdown
  useEffect(() => {
    if (running) {
      document.title = `${fmtClock(secondsLeft)} · ${MODES[mode].label} · Kaseki`;
    } else {
      document.title = 'Pomodoro · Kaseki';
    }
    return () => { document.title = 'Kaseki'; };
  }, [secondsLeft, running, mode]);

  const handleSessionComplete = async () => {
    setRunning(false);
    try {
      // chime (light beep)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        osc.start(); osc.stop(ctx.currentTime + 0.5);
      } catch (e) {}

      if (sessionId) {
        await api.finishFocus(sessionId, { completed: true });
        setSessionId(null);
      }
      const wasWork = mode === 'work';
      if (wasWork) {
        const newCount = completedCount + 1;
        setCompletedCount(newCount);
        toast.show({ message: `🍅 Pomodoro complete!`, type: 'success' });
        const nextMode = (newCount % prefs.untilLong === 0) ? 'long_break' : 'break';
        setMode(nextMode);
      } else {
        toast.show({ message: `${MODES[mode].emoji} Break over — back to focus`, type: 'info' });
        setMode('work');
      }
      refreshHistory();
    } catch (e) {
      toast.show({ message: e.message, type: 'error' });
    }
  };

  const start = async () => {
    try {
      const duration = secondsLeft > 0 ? secondsLeft : durationFor(mode);
      setSecondsLeft(duration);
      const d = await api.startFocus({
        task_id: (mode === 'work' && taskId) ? taskId : null,
        kind: mode,
        duration_seconds: duration,
      });
      setSessionId(d.session.id);
      setRunning(true);
    } catch (e) {
      toast.show({ message: e.message, type: 'error' });
    }
  };

  const pause = () => setRunning(false);
  const resume = () => setRunning(true);

  const abort = async () => {
    setRunning(false);
    if (sessionId) {
      try { await api.finishFocus(sessionId, { completed: false }); } catch (e) {}
      setSessionId(null);
    }
    setSecondsLeft(durationFor(mode));
    refreshHistory();
  };

  const skip = async () => {
    if (sessionId) {
      try { await api.finishFocus(sessionId, { completed: false }); } catch (e) {}
      setSessionId(null);
    }
    setRunning(false);
    // advance mode the same way completion does, but without counting the session
    if (mode === 'work') {
      setMode((completedCount + 1) % prefs.untilLong === 0 ? 'long_break' : 'break');
    } else {
      setMode('work');
    }
  };

  const chooseTask = (t) => { setTaskId(t.id); setTaskPickerOpen(false); };
  const clearTask = () => setTaskId(null);

  const selectedTask = (() => {
    if (!taskId) return null;
    for (const s of ['home', 'work', 'inbox']) {
      const t = tasks[s].find(x => x.id === taskId);
      if (t) return { ...t, section: s };
    }
    return null;
  })();

  // Update prefs inline
  const savePref = async (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await api.savePreferences({
      pomodoro_work_mins: next.work,
      pomodoro_break_mins: next.br,
      pomodoro_long_break_mins: next.longBr,
      pomodoro_sessions_until_long_break: next.untilLong,
    }).catch(() => {});
  };

  const modeInfo = MODES[mode];
  const totalSecs = durationFor(mode);
  const progress = totalSecs > 0 ? (1 - secondsLeft / totalSecs) : 0;

  return (
    <div className="pom-page">
      <div className="pom-header">
        <button className="dash-back-btn" onClick={onBack}>←</button>
        <div className="pom-title"><span className="pom-title-icon">🍅</span> Pomodoro</div>
        <div className="pom-header-right">
          <button className="dash-theme-btn" onClick={onToggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>

      <div className="pom-body">
        {/* Mode tabs */}
        <div className="pom-tabs">
          {Object.entries(MODES).map(([k, v]) => (
            <button
              key={k}
              className={`pom-tab${mode === k ? ' pom-tab--active' : ''}`}
              style={mode === k ? { borderColor: v.color, color: v.color } : {}}
              onClick={() => { if (!running) setMode(k); }}
              disabled={running}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>

        {/* Timer circle */}
        <div className="pom-timer-wrap">
          <svg className="pom-ring" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="110" className="pom-ring-bg" />
            <circle
              cx="120" cy="120" r="110"
              className="pom-ring-fg"
              style={{
                stroke: modeInfo.color,
                strokeDasharray: 2 * Math.PI * 110,
                strokeDashoffset: 2 * Math.PI * 110 * (1 - progress),
              }}
            />
          </svg>
          <div className="pom-clock">
            <div className="pom-clock-time" style={{ color: modeInfo.color }}>{fmtClock(secondsLeft)}</div>
            <div className="pom-clock-label">{modeInfo.emoji} {modeInfo.label}</div>
            {mode === 'work' && (
              <div className="pom-session-count">
                {completedCount % prefs.untilLong}/{prefs.untilLong} until long break
              </div>
            )}
          </div>
        </div>

        {/* Current task selector */}
        {mode === 'work' && (
          <div className="pom-task-row">
            {selectedTask ? (
              <div className="pom-task-selected">
                <span className="pom-task-label">Focusing on:</span>
                <span className="pom-task-name">{selectedTask.title}</span>
                <span className="pom-task-section">{selectedTask.section === 'work' ? '💼' : selectedTask.section === 'inbox' ? '📥' : '🏠'}</span>
                <button className="pom-task-clear" onClick={clearTask} disabled={running}>✕</button>
              </div>
            ) : (
              <button className="pom-task-pick-btn" onClick={() => setTaskPickerOpen(true)} disabled={running}>
                📎 Attach a task (optional)
              </button>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="pom-controls">
          {!running && sessionId === null && (
            <button className="pom-btn pom-btn--primary" style={{ background: modeInfo.color }} onClick={start}>
              ▶ Start
            </button>
          )}
          {!running && sessionId !== null && (
            <>
              <button className="pom-btn pom-btn--primary" style={{ background: modeInfo.color }} onClick={resume}>▶ Resume</button>
              <button className="pom-btn pom-btn--danger" onClick={abort}>⏹ Stop</button>
            </>
          )}
          {running && (
            <>
              <button className="pom-btn" onClick={pause}>⏸ Pause</button>
              <button className="pom-btn pom-btn--danger" onClick={abort}>⏹ Stop</button>
              <button className="pom-btn" onClick={skip}>⏭ Skip</button>
            </>
          )}
        </div>

        {/* Settings */}
        <details className="pom-settings">
          <summary>⚙️ Settings</summary>
          <div className="pom-settings-grid">
            <label>
              <span>Focus (min)</span>
              <input type="number" min="1" max="180" value={prefs.work} onChange={e => savePref({ work: parseInt(e.target.value) || 25 })} disabled={running} />
            </label>
            <label>
              <span>Short break (min)</span>
              <input type="number" min="1" max="60" value={prefs.br} onChange={e => savePref({ br: parseInt(e.target.value) || 5 })} disabled={running} />
            </label>
            <label>
              <span>Long break (min)</span>
              <input type="number" min="1" max="60" value={prefs.longBr} onChange={e => savePref({ longBr: parseInt(e.target.value) || 15 })} disabled={running} />
            </label>
            <label>
              <span>Sessions until long break</span>
              <input type="number" min="2" max="10" value={prefs.untilLong} onChange={e => savePref({ untilLong: parseInt(e.target.value) || 4 })} disabled={running} />
            </label>
          </div>
        </details>

        {/* Today's stats + history */}
        <div className="pom-stats">
          <div className="pom-stat"><span className="pom-stat-value">{todayStats.sessions_completed}</span><span className="pom-stat-label">Sessions today</span></div>
          <div className="pom-stat"><span className="pom-stat-value">{todayStats.total_minutes}</span><span className="pom-stat-label">Minutes today</span></div>
          <div className="pom-stat"><span className="pom-stat-value">{completedCount}</span><span className="pom-stat-label">This session</span></div>
        </div>

        {history.length > 0 && (
          <div className="pom-history">
            <div className="pom-history-title">Recent sessions</div>
            {history.map(h => (
              <div key={h.id} className={`pom-history-item${!h.completed ? ' pom-history-item--aborted' : ''}`}>
                <span className="pom-history-emoji">{MODES[h.kind]?.emoji || '•'}</span>
                <span className="pom-history-duration">{Math.round(h.duration_seconds / 60)}m</span>
                <span className="pom-history-task">{h.task_title || <em>no task</em>}</span>
                <span className="pom-history-when">{fmtDate(h.started_at)}</span>
                {!h.completed && <span className="pom-history-flag">aborted</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task picker modal */}
      {taskPickerOpen && (
        <div className="dash-modal-overlay" onClick={() => setTaskPickerOpen(false)}>
          <div className="dash-modal" onClick={e => e.stopPropagation()}>
            <h2>Attach a task</h2>
            <div className="pom-picker-body">
              {['home', 'work', 'inbox'].map(sec => (
                <div key={sec} className="pom-picker-sec">
                  <div className="pom-picker-sec-title">{sec === 'work' ? '💼 Work' : sec === 'inbox' ? '📥 Inbox' : '🏠 Home'}</div>
                  {tasks[sec].filter(t => t.status !== 'done').slice(0, 15).map(t => (
                    <button key={t.id} className="pom-picker-task" onClick={() => chooseTask(t)}>
                      <span className="pom-picker-task-title">{t.title}</span>
                      {t.due_date && <span className="pom-picker-task-due">{new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                    </button>
                  ))}
                  {tasks[sec].filter(t => t.status !== 'done').length === 0 && <div className="pom-picker-empty">No open tasks</div>}
                </div>
              ))}
            </div>
            <div className="dash-modal-actions">
              <button className="dash-modal-cancel" onClick={() => setTaskPickerOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
