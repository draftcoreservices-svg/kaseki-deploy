import React from 'react';

const COLUMNS = [
  { key: 'to_start',    label: 'To Start',     color: '#6b7280' },
  { key: 'in_progress', label: 'In Progress',  color: '#3b9eff' },
  { key: 'blocked',     label: 'Blocked',      color: '#f87171' },
  { key: 'done',        label: 'Done',         color: '#34d399' },
];

const PRIORITY_COLORS = { 1: '#6b7280', 2: '#60a5fa', 3: '#fbbf24', 4: '#f97316', 5: '#ef4444' };

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function isOverdue(d) { return d && d < todayStr(); }

export default function KanbanView({ tasks, section, onOpenTask, onUpdateTask }) {
  const [dragId, setDragId] = React.useState(null);
  const [dragOverCol, setDragOverCol] = React.useState(null);

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOverCol = (e, col) => { e.preventDefault(); setDragOverCol(col); };
  const onDropCol = async (e, col) => {
    e.preventDefault();
    const id = dragId;
    setDragId(null);
    setDragOverCol(null);
    if (!id) return;
    const t = tasks.find(x => x.id === id);
    if (!t || t.status === col) return;
    try { await onUpdateTask(id, { status: col }); } catch (err) {}
  };

  const byCol = {};
  for (const c of COLUMNS) byCol[c.key] = [];
  for (const t of tasks) {
    const col = byCol[t.status] || byCol.to_start;
    col.push(t);
  }
  // Within each column: pinned first, then by priority desc, then updated_at desc
  for (const k in byCol) {
    byCol[k].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return 0;
    });
  }

  return (
    <div className="kanban-view">
      {COLUMNS.map(col => (
        <div
          key={col.key}
          className={`kanban-col${dragOverCol === col.key ? ' kanban-col--drag' : ''}`}
          onDragOver={(e) => onDragOverCol(e, col.key)}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={(e) => onDropCol(e, col.key)}
        >
          <div className="kanban-col-header" style={{ borderTopColor: col.color }}>
            <span className="kanban-col-title">{col.label}</span>
            <span className="kanban-col-count">{byCol[col.key].length}</span>
          </div>
          <div className="kanban-col-body">
            {byCol[col.key].map(t => (
              <div
                key={t.id}
                className={`kanban-card${t.pinned ? ' kanban-card--pinned' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, t.id)}
                onClick={() => onOpenTask(t.id)}
                title="Click to open, drag to move"
              >
                <div className="kanban-card-top">
                  <span className="kanban-card-pri" style={{ background: PRIORITY_COLORS[t.priority] || PRIORITY_COLORS[3] }} title={`Priority ${t.priority}`} />
                  <span className="kanban-card-title">{t.title}</span>
                  {t.pinned ? <span className="kanban-card-pin">📌</span> : null}
                </div>
                {t.description && <div className="kanban-card-desc">{t.description.slice(0, 80)}{t.description.length > 80 ? '…' : ''}</div>}
                <div className="kanban-card-bottom">
                  {t.due_date && (
                    <span className={`kanban-card-due${isOverdue(t.due_date) && t.status !== 'done' ? ' kanban-card-due--overdue' : ''}`}>
                      📅 {fmtDate(t.due_date)}
                    </span>
                  )}
                  {(t.tags || []).slice(0, 2).map(tag => (
                    <span key={tag.id} className="kanban-card-tag" style={{ background: `var(--tag-${tag.color}-bg, rgba(59,158,255,0.15))`, color: `var(--tag-${tag.color}-fg, #60a5fa)` }}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {byCol[col.key].length === 0 && (
              <div className="kanban-col-empty">Drop here</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
