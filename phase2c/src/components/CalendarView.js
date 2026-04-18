import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

// Calendar view — month grid showing tasks (by due_date), events, and todos.
// Dashboard usage: <CalendarView space={space} onOpenTask={...} onNavigateToDate={...} />
// onNavigateToDate(dateStr) — Dashboard switches back to list view with selDate set.

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

// Build a 6-row grid starting on Monday covering the visible month.
function buildGrid(monthDate) {
  const first = startOfMonth(monthDate);
  const last = endOfMonth(monthDate);
  // Make Monday index 0 (0=Mon ... 6=Sun)
  const firstDow = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(1 - firstDow);
  const cells = [];
  const cur = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    cells.push({
      date: new Date(cur),
      str: toDateStr(cur),
      inMonth: cur.getMonth() === first.getMonth(),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return { cells, rangeStart: toDateStr(gridStart), rangeEnd: toDateStr(cells[41].date), monthLabel: first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), first, last };
}

export default function CalendarView({ space, onOpenTask, onNavigateToDate }) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [data, setData] = useState({ tasks: [], events: [], todos: [] });
  const [loading, setLoading] = useState(true);

  const grid = buildGrid(monthDate);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getCalendarRange(grid.rangeStart, grid.rangeEnd, space?.id);
      setData(d);
    } catch (e) {
      setData({ tasks: [], events: [], todos: [] });
    }
    setLoading(false);
  }, [grid.rangeStart, grid.rangeEnd, space?.id]);

  useEffect(() => { load(); }, [load]);

  // Bucket content by date string
  const byDate = {};
  (data.tasks || []).forEach(t => {
    if (!t.due_date) return;
    (byDate[t.due_date] = byDate[t.due_date] || { tasks: [], events: [], todos: [] }).tasks.push(t);
  });
  (data.events || []).forEach(e => {
    if (!e.date) return;
    (byDate[e.date] = byDate[e.date] || { tasks: [], events: [], todos: [] }).events.push(e);
  });
  (data.todos || []).forEach(t => {
    if (!t.date) return;
    (byDate[t.date] = byDate[t.date] || { tasks: [], events: [], todos: [] }).todos.push(t);
  });

  const today = toDateStr(new Date());
  const accent = space?.color || '#3b9eff';
  const accentBg = accent + '22';

  const weekdayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <div className="cal-root">
      <div className="cal-header">
        <button className="cal-nav" onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
        <div className="cal-month-label">{grid.monthLabel}</div>
        <button className="cal-today" onClick={() => setMonthDate(new Date())}>Today</button>
        <button className="cal-nav" onClick={() => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
        {loading && <span className="cal-loading">…</span>}
      </div>
      <div className="cal-weekdays">
        {weekdayLabels.map(w => <div key={w} className="cal-weekday">{w}</div>)}
      </div>
      <div className="cal-grid">
        {grid.cells.map(cell => {
          const bucket = byDate[cell.str];
          const isToday = cell.str === today;
          return (
            <div
              key={cell.str}
              className={`cal-cell${cell.inMonth ? '' : ' cal-cell--outside'}${isToday ? ' cal-cell--today' : ''}`}
              onClick={() => onNavigateToDate && onNavigateToDate(cell.str)}
            >
              <div className="cal-cell-date">{cell.date.getDate()}</div>
              {bucket && (
                <div className="cal-cell-items">
                  {(bucket.tasks || []).slice(0, 3).map(t => (
                    <div
                      key={'t-' + t.id}
                      className="cal-event-pill cal-event-pill--space"
                      style={{ background: accentBg, color: accent, borderColor: accent }}
                      onClick={(e) => { e.stopPropagation(); onOpenTask && onOpenTask(t.id); }}
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  ))}
                  {(bucket.events || []).slice(0, 2).map(ev => (
                    <div
                      key={'e-' + ev.id}
                      className="cal-event-pill cal-event-pill--event"
                      title={ev.title}
                    >
                      📅 {ev.title}
                    </div>
                  ))}
                  {((bucket.tasks?.length || 0) + (bucket.events?.length || 0)) > 5 && (
                    <div className="cal-more">+more</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
