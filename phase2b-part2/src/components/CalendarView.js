import React, { useState, useMemo, useEffect } from 'react';
import api from '../api';

const PRIORITY_COLORS = { 1: '#6b7280', 2: '#60a5fa', 3: '#fbbf24', 4: '#f97316', 5: '#ef4444' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toYmd(d) { return d.toISOString().split('T')[0]; }
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }
function endOfMonth(d) { const x = new Date(d); x.setMonth(x.getMonth() + 1, 0); x.setHours(23, 59, 59, 999); return x; }

// Pad to start the grid on Monday
function monthGrid(monthRef) {
  const start = startOfMonth(monthRef);
  // JS: Sunday=0, Monday=1. We want Monday first.
  const shift = (start.getDay() + 6) % 7;
  const gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - shift);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(d.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function CalendarView({ section, onOpenTask, onNavigateToDate }) {
  const [monthRef, setMonthRef] = useState(() => startOfMonth(new Date()));
  const [data, setData] = useState({ tasks: [], todos: [], events: [] });
  const [loading, setLoading] = useState(false);

  const cells = useMemo(() => monthGrid(monthRef), [monthRef]);

  useEffect(() => {
    const first = cells[0];
    const last = cells[cells.length - 1];
    setLoading(true);
    api.getCalendarRange(toYmd(first), toYmd(last), section)
      .then(d => setData(d))
      .catch(() => setData({ tasks: [], todos: [], events: [] }))
      .finally(() => setLoading(false));
  }, [cells, section]);

  const tasksByDate = useMemo(() => {
    const m = {};
    for (const t of data.tasks) {
      if (!t.due_date) continue;
      (m[t.due_date] = m[t.due_date] || []).push(t);
    }
    return m;
  }, [data.tasks]);

  const todosByDate = useMemo(() => {
    const m = {};
    for (const t of data.todos) (m[t.date] = m[t.date] || []).push(t);
    return m;
  }, [data.todos]);

  const eventsByDate = useMemo(() => {
    const m = {};
    for (const ev of data.events) (m[ev.date] = m[ev.date] || []).push(ev);
    return m;
  }, [data.events]);

  const todayYmd = toYmd(new Date());
  const currentMonth = monthRef.getMonth();

  const prev = () => { const d = new Date(monthRef); d.setMonth(d.getMonth() - 1); setMonthRef(d); };
  const next = () => { const d = new Date(monthRef); d.setMonth(d.getMonth() + 1); setMonthRef(d); };
  const today = () => setMonthRef(startOfMonth(new Date()));

  return (
    <div className="cal-view">
      <div className="cal-toolbar">
        <button className="cal-nav" onClick={prev} title="Previous month">‹</button>
        <div className="cal-month-title">{monthRef.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
        <button className="cal-nav" onClick={next} title="Next month">›</button>
        <button className="cal-today" onClick={today}>Today</button>
        {loading && <span className="cal-loading">Loading…</span>}
      </div>

      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-weekday">{d}</div>)}
        {cells.map((d, i) => {
          const ymd = toYmd(d);
          const inMonth = d.getMonth() === currentMonth;
          const isToday = ymd === todayYmd;
          const tasks = tasksByDate[ymd] || [];
          const todos = todosByDate[ymd] || [];
          const events = eventsByDate[ymd] || [];
          const total = tasks.length + todos.length + events.length;
          return (
            <div
              key={i}
              className={`cal-cell${inMonth ? '' : ' cal-cell--muted'}${isToday ? ' cal-cell--today' : ''}`}
              onClick={() => onNavigateToDate && onNavigateToDate(ymd)}
            >
              <div className="cal-cell-date">{d.getDate()}</div>
              <div className="cal-cell-items">
                {tasks.slice(0, 3).map(t => (
                  <div
                    key={`t${t.id}`}
                    className={`cal-item cal-item--task${t.status === 'done' ? ' cal-item--done' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onOpenTask(t.id, t.section); }}
                    title={t.title}
                  >
                    <span className="cal-item-dot" style={{ background: PRIORITY_COLORS[t.priority] || PRIORITY_COLORS[3] }} />
                    <span className="cal-item-text">{t.title}</span>
                  </div>
                ))}
                {events.slice(0, 2).map(ev => (
                  <div key={`e${ev.id}`} className="cal-item cal-item--event" title={ev.title}>
                    <span className="cal-item-dot cal-item-dot--event" />
                    <span className="cal-item-text">{ev.time ? `${ev.time.slice(0, 5)} ` : ''}{ev.title}</span>
                  </div>
                ))}
                {todos.slice(0, 2).map(td => (
                  <div key={`d${td.id}`} className={`cal-item cal-item--todo${td.completed ? ' cal-item--done' : ''}`} title={td.title}>
                    <span className="cal-item-dot cal-item-dot--todo" />
                    <span className="cal-item-text">{td.completed ? '✓ ' : ''}{td.title}</span>
                  </div>
                ))}
                {total > 7 && <div className="cal-item-more">+{total - 7} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
