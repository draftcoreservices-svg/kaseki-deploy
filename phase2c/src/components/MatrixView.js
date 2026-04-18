import React from 'react';

// Matrix view — Eisenhower quadrants:
//   urgent + important    = priority >= 4, due within 7 days or overdue
//   not urgent + important = priority >= 4, due later / no date
//   urgent + not important = priority <= 3, due within 7 days or overdue
//   not urgent + not important = the rest
// Dashboard usage: <MatrixView tasks={filtered} space={space} onOpenTask={...} />

const PRIORITY_COLORS = { 1: '#6b7280', 2: '#60a5fa', 3: '#fbbf24', 4: '#f97316', 5: '#ef4444' };

function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmtDate(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

function isUrgent(t) {
  if (!t.due_date) return false;
  const today = new Date(todayStr());
  const due = new Date(t.due_date);
  const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
  return diffDays <= 7; // overdue counts as urgent
}
function isImportant(t) {
  return (t.priority || 3) >= 4;
}

export default function MatrixView({ tasks, space, onOpenTask }) {
  const doToday = tasks.filter(t => t.status !== 'done' && isUrgent(t) && isImportant(t));
  const schedule = tasks.filter(t => t.status !== 'done' && !isUrgent(t) && isImportant(t));
  const delegate = tasks.filter(t => t.status !== 'done' && isUrgent(t) && !isImportant(t));
  const later = tasks.filter(t => t.status !== 'done' && !isUrgent(t) && !isImportant(t));

  const accent = space?.color || '#3b9eff';

  const quadrant = (key, title, subtitle, items, flavor) => (
    <div className={`mx-quadrant mx-quadrant--${flavor}`}>
      <div className="mx-quadrant-head">
        <div className="mx-quadrant-title">{title}</div>
        <div className="mx-quadrant-sub">{subtitle}</div>
        <div className="mx-quadrant-count">{items.length}</div>
      </div>
      <div className="mx-quadrant-body">
        {items.length === 0 ? (
          <div className="mx-quadrant-empty">Nothing here</div>
        ) : items.map(t => (
          <div
            key={t.id}
            className="mx-card"
            onClick={() => onOpenTask(t.id)}
            style={{ borderLeft: `3px solid ${accent}` }}
          >
            <div className="mx-card-top">
              {t.pinned && <span className="mx-card-pin">📌</span>}
              <span className="mx-card-title">{t.title}</span>
              <span className="mx-card-priority" style={{ background: PRIORITY_COLORS[t.priority] }} />
            </div>
            {t.due_date && <div className="mx-card-due">{fmtDate(t.due_date)}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-grid">
      {quadrant('do', 'Do now', 'Urgent · Important', doToday, 'urgent-important')}
      {quadrant('schedule', 'Schedule', 'Not urgent · Important', schedule, 'notUrgent-important')}
      {quadrant('delegate', 'Triage', 'Urgent · Not important', delegate, 'urgent-notImportant')}
      {quadrant('later', 'Later', 'Not urgent · Not important', later, 'notUrgent-notImportant')}
    </div>
  );
}
