import React, { useState } from 'react';

// Kanban view. Dashboard usage:
//   <KanbanView tasks={filtered} space={space} onOpenTask={...} onUpdateTask={...} />
// onUpdateTask(id, patch) — returns a Promise; Dashboard uses it to move cards.

const COLUMNS = [
  { key: 'to_start',    label: 'To Start',    color: '#6b7280' },
  { key: 'in_progress', label: 'In Progress', color: '#3b9eff' },
  { key: 'blocked',     label: 'Blocked',     color: '#f87171' },
  { key: 'done',        label: 'Done',        color: '#34d399' },
];

const PRIORITY_COLORS = { 1: '#6b7280', 2: '#60a5fa', 3: '#fbbf24', 4: '#f97316', 5: '#ef4444' };

function fmtDate(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function isOverdue(d) { return d && d < new Date().toISOString().split('T')[0]; }

export default function KanbanView({ tasks, space, onOpenTask, onUpdateTask }) {
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const byStatus = COLUMNS.reduce((acc, c) => {
    acc[c.key] = tasks.filter(t => t.status === c.key);
    return acc;
  }, {});

  const onCardDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onColDragOver = (e, col) => {
    if (dragId == null) return;
    e.preventDefault();
    setDragOverCol(col);
  };
  const onColDrop = async (e, colKey) => {
    if (dragId == null) return;
    e.preventDefault();
    const task = tasks.find(t => t.id === dragId);
    if (task && task.status !== colKey && onUpdateTask) {
      try { await onUpdateTask(task.id, { status: colKey }); } catch (_) {}
    }
    setDragId(null);
    setDragOverCol(null);
  };
  const onDragEnd = () => { setDragId(null); setDragOverCol(null); };

  return (
    <div className="kb-board">
      {COLUMNS.map(col => {
        const items = byStatus[col.key] || [];
        return (
          <div
            key={col.key}
            className={`kb-column${dragOverCol === col.key ? ' kb-column--drop' : ''}`}
            onDragOver={(e) => onColDragOver(e, col.key)}
            onDrop={(e) => onColDrop(e, col.key)}
            onDragLeave={() => setDragOverCol(null)}
          >
            <div className="kb-column-header">
              <span className="kb-column-dot" style={{ background: col.color }} />
              <span className="kb-column-label">{col.label}</span>
              <span className="kb-column-count">{items.length}</span>
            </div>
            <div className="kb-column-body">
              {items.length === 0 ? (
                <div className="kb-column-empty">No tasks</div>
              ) : items.map(t => (
                <div
                  key={t.id}
                  className={`kb-card${dragId === t.id ? ' kb-card--dragging' : ''}`}
                  draggable
                  onDragStart={(e) => onCardDragStart(e, t.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => onOpenTask(t.id)}
                  style={{ borderLeft: `3px solid ${space?.color || '#3b9eff'}` }}
                >
                  <div className="kb-card-top">
                    {t.pinned && <span className="kb-card-pin">📌</span>}
                    <span className="kb-card-title">{t.title}</span>
                    <span className="kb-card-priority" style={{ background: PRIORITY_COLORS[t.priority] }} />
                  </div>
                  {t.due_date && (
                    <div className={`kb-card-due${isOverdue(t.due_date) && t.status !== 'done' ? ' kb-card-due--overdue' : ''}`}>
                      {fmtDate(t.due_date)}
                    </div>
                  )}
                  {(t.tags && t.tags.length > 0) && (
                    <div className="kb-card-tags">
                      {t.tags.slice(0, 3).map(tag => (
                        <span key={tag.id} className="kb-card-tag">{tag.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
