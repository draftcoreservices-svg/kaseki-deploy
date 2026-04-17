import React from 'react';

// Eisenhower Matrix:
// URGENT = due within next 2 days OR overdue AND not done
// IMPORTANT = priority >= 4
function isUrgent(t) {
  if (t.status === 'done') return false;
  if (!t.due_date) return false;
  const d = new Date(t.due_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 2);
  return d <= cutoff;
}
function isImportant(t) { return (t.priority || 3) >= 4; }

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

const QUADRANTS = [
  { key: 'do',       title: 'Do',       desc: 'Urgent & Important',        color: '#ef4444' },
  { key: 'schedule', title: 'Schedule', desc: 'Important, not urgent',     color: '#3b9eff' },
  { key: 'delegate', title: 'Delegate', desc: 'Urgent, not important',     color: '#fbbf24' },
  { key: 'drop',     title: 'Drop',     desc: 'Not urgent, not important', color: '#6b7280' },
];

function classify(t) {
  const u = isUrgent(t);
  const i = isImportant(t);
  if (u && i) return 'do';
  if (!u && i) return 'schedule';
  if (u && !i) return 'delegate';
  return 'drop';
}

export default function MatrixView({ tasks, onOpenTask }) {
  const quads = { do: [], schedule: [], delegate: [], drop: [] };
  for (const t of tasks) {
    if (t.status === 'done') continue;
    quads[classify(t)].push(t);
  }
  for (const k in quads) {
    quads[k].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return 0;
    });
  }

  return (
    <div className="matrix-view">
      {QUADRANTS.map(q => (
        <div key={q.key} className={`matrix-quad matrix-quad--${q.key}`}>
          <div className="matrix-quad-header" style={{ borderLeftColor: q.color }}>
            <div>
              <div className="matrix-quad-title">{q.title}</div>
              <div className="matrix-quad-desc">{q.desc}</div>
            </div>
            <div className="matrix-quad-count">{quads[q.key].length}</div>
          </div>
          <div className="matrix-quad-body">
            {quads[q.key].map(t => (
              <button key={t.id} className="matrix-task" onClick={() => onOpenTask(t.id)} title="Click to open">
                <span className="matrix-task-title">{t.title}</span>
                <span className="matrix-task-meta">
                  {t.due_date && <span className={`matrix-task-due${t.due_date < todayStr() ? ' matrix-task-due--overdue' : ''}`}>📅 {fmtDate(t.due_date)}</span>}
                  <span className="matrix-task-pri">P{t.priority}</span>
                </span>
              </button>
            ))}
            {quads[q.key].length === 0 && <div className="matrix-quad-empty">Nothing here</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
