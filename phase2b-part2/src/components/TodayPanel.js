import React, { useState, useEffect } from 'react';
import api from '../api';

const SECTION_ICON = { home: '🏠', work: '💼', inbox: '📥' };
const PRIORITY_COLORS = { 1: '#6b7280', 2: '#60a5fa', 3: '#fbbf24', 4: '#f97316', 5: '#ef4444' };

function fmtTime(t) {
  if (!t) return '';
  return t.length > 5 ? t.slice(0, 5) : t;
}

function daysOverdue(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const day = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.floor((now - d) / day));
}

export default function TodayPanel({ onNavigateSection, onOpenPomodoro }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getTodaySummary()
      .then(d => { if (!cancelled) setSummary(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="today-panel today-panel--loading"><div className="auth-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /></div>;
  }
  if (!summary) return null;

  const dueCount = summary.tasks_due_today.length;
  const overdueCount = summary.overdue.length;
  const todoTotal = summary.todos.length;
  const todoDone = summary.todos.filter(t => t.completed).length;
  const eventCount = summary.events.length;
  const yesterdayDoneCount = summary.yesterday_completed.length;
  const focusMins = summary.focus_minutes_today || 0;
  const focusSessions = summary.focus_sessions_today || 0;

  const everythingEmpty =
    dueCount === 0 && overdueCount === 0 && todoTotal === 0 && eventCount === 0;

  return (
    <div className="today-panel">
      <div className="today-header">
        <div className="today-title">📋 Today</div>
        <div className="today-meta">
          {yesterdayDoneCount > 0 && (
            <span className="today-meta-item today-meta-yesterday">
              ✓ {yesterdayDoneCount} finished yesterday
            </span>
          )}
          <button className="today-pomodoro-btn" onClick={onOpenPomodoro} title="Open Pomodoro">
            🍅 {focusMins > 0 ? `${focusMins}m today` : 'Focus'}
          </button>
        </div>
      </div>

      {everythingEmpty ? (
        <div className="today-empty">
          <div className="today-empty-icon">✨</div>
          <div className="today-empty-text">Nothing on the agenda for today</div>
          <div className="today-empty-sub">Inbox zero energy. Enjoy the quiet.</div>
        </div>
      ) : (
        <div className="today-grid">
          {/* Tasks due today */}
          {dueCount > 0 && (
            <div className="today-block">
              <div className="today-block-header">
                <span className="today-block-title">Due today</span>
                <span className="today-block-count">{dueCount}</span>
              </div>
              <div className="today-block-body">
                {summary.tasks_due_today.slice(0, 5).map(t => (
                  <button key={t.id} className="today-task-item" onClick={() => onNavigateSection(t.section)} title="Open section">
                    <span className="today-task-priority" style={{ background: PRIORITY_COLORS[t.priority] || PRIORITY_COLORS[3] }} />
                    <span className="today-task-section">{SECTION_ICON[t.section] || '•'}</span>
                    <span className="today-task-title">{t.title}</span>
                    {t.due_time && <span className="today-task-time">{fmtTime(t.due_time)}</span>}
                  </button>
                ))}
                {dueCount > 5 && <div className="today-more">+{dueCount - 5} more</div>}
              </div>
            </div>
          )}

          {/* Overdue */}
          {overdueCount > 0 && (
            <div className="today-block today-block--danger">
              <div className="today-block-header">
                <span className="today-block-title">⚠️ Overdue</span>
                <span className="today-block-count today-block-count--danger">{overdueCount}</span>
              </div>
              <div className="today-block-body">
                {summary.overdue.slice(0, 5).map(t => (
                  <button key={t.id} className="today-task-item today-task-item--overdue" onClick={() => onNavigateSection(t.section)} title="Open section">
                    <span className="today-task-section">{SECTION_ICON[t.section] || '•'}</span>
                    <span className="today-task-title">{t.title}</span>
                    <span className="today-task-overdue">{daysOverdue(t.due_date)}d late</span>
                  </button>
                ))}
                {overdueCount > 5 && <div className="today-more">+{overdueCount - 5} more</div>}
              </div>
            </div>
          )}

          {/* Todos */}
          {todoTotal > 0 && (
            <div className="today-block">
              <div className="today-block-header">
                <span className="today-block-title">Todos</span>
                <span className="today-block-count">{todoDone}/{todoTotal}</span>
              </div>
              <div className="today-block-body">
                {summary.todos.slice(0, 5).map(t => (
                  <button key={t.id} className={`today-todo-item${t.completed ? ' today-todo-item--done' : ''}`} onClick={() => onNavigateSection(t.section)}>
                    <span className="today-todo-check">{t.completed ? '✓' : '○'}</span>
                    <span className="today-task-section">{SECTION_ICON[t.section] || '•'}</span>
                    <span className="today-task-title">{t.title}</span>
                  </button>
                ))}
                {todoTotal > 5 && <div className="today-more">+{todoTotal - 5} more</div>}
              </div>
            </div>
          )}

          {/* Events */}
          {eventCount > 0 && (
            <div className="today-block">
              <div className="today-block-header">
                <span className="today-block-title">Events</span>
                <span className="today-block-count">{eventCount}</span>
              </div>
              <div className="today-block-body">
                {summary.events.slice(0, 5).map(ev => (
                  <button key={ev.id} className="today-event-item" onClick={() => onNavigateSection(ev.section)}>
                    <span className="today-task-section">{SECTION_ICON[ev.section] || '•'}</span>
                    <span className="today-task-title">{ev.title}</span>
                    {ev.time && <span className="today-task-time">{fmtTime(ev.time)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {focusSessions > 0 && (
        <div className="today-focus-banner" onClick={onOpenPomodoro}>
          🍅 {focusSessions} pomodoro{focusSessions > 1 ? 's' : ''} · {focusMins} minutes focused today
        </div>
      )}
    </div>
  );
}
