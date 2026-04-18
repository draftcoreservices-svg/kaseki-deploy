import React, { useEffect, useState } from 'react';
import api from '../api';
import SpaceIcon from './SpaceIcon';

// ═══════════════════════════════════════════════════════════════════════════
// CountdownModal — Phase C Batch 3.
//
// Opens when the Countdown Timers Quick Access card is clicked on the
// landing page. Fetches api.getCountdown() which returns a chronologically-
// sorted merge of tasks (due in next 30 days or overdue) and events (in
// next 30 days). Each item shows its title, space, the raw date, and a
// human "in N days" / "today" / "overdue by N days" badge.
//
// Close pattern matches LegalModal: click-outside, Esc, ✕.
//
// Kept deliberately read-only — no task/event editing in this modal. Click
// a task → navigate to its detail view via the onOpenTask callback, which
// LandingPage wires to the existing routing. Events have no detail view,
// so event rows are non-clickable.
// ═══════════════════════════════════════════════════════════════════════════

function daysLabel(n) {
  if (n < 0) return `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} overdue`;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

function formatFullDate(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function CountdownModal({ open, onClose, onOpenTask }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api.getCountdown()
      .then(d => { if (!cancelled) setItems(d.items || []); })
      .catch(e => { if (!cancelled) setErr(e.message || 'Failed to load countdown'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  // Split items into overdue / upcoming for visual separation. Server already
  // returns them sorted; we just walk once and bucket.
  const overdue = items.filter(i => i.days_away < 0);
  const upcoming = items.filter(i => i.days_away >= 0);

  return (
    <div className="countdown-overlay" onClick={onClose}>
      <div className="countdown-modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="countdown-title">
        <div className="countdown-header">
          <h2 id="countdown-title">⏳ Countdown</h2>
          <button className="countdown-close" onClick={onClose} title="Close (Esc)" aria-label="Close">✕</button>
        </div>
        <div className="countdown-scroll">
          {loading && <div className="countdown-empty">Loading…</div>}
          {err && <div className="countdown-empty countdown-empty--error">{err}</div>}
          {!loading && !err && items.length === 0 && (
            <div className="countdown-empty">Nothing coming up in the next 30 days. Enjoy it.</div>
          )}
          {overdue.length > 0 && (
            <div className="countdown-section">
              <div className="countdown-section-title countdown-section-title--danger">Overdue</div>
              {overdue.map(item => (
                <CountdownRow key={`${item.kind}-${item.id}`} item={item} onOpenTask={onOpenTask} onClose={onClose} />
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="countdown-section">
              {overdue.length > 0 && <div className="countdown-section-title">Coming up</div>}
              {upcoming.map(item => (
                <CountdownRow key={`${item.kind}-${item.id}`} item={item} onOpenTask={onOpenTask} onClose={onClose} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CountdownRow({ item, onOpenTask, onClose }) {
  const isTask = item.kind === 'task';
  const clickable = isTask && onOpenTask;
  const handleClick = () => {
    if (!clickable) return;
    onOpenTask(item.id, item.space_id);
    onClose();
  };
  const labelClass = item.days_away < 0
    ? 'countdown-days countdown-days--overdue'
    : item.days_away <= 1
      ? 'countdown-days countdown-days--soon'
      : 'countdown-days';

  const Inner = (
    <>
      <div className="countdown-row-icon">
        <SpaceIcon icon={item.space_icon} color={item.space_color} size={18} />
      </div>
      <div className="countdown-row-main">
        <div className="countdown-row-title">
          {item.title}
          {item.kind === 'event' && <span className="countdown-row-kind">event</span>}
        </div>
        <div className="countdown-row-meta">
          {item.space_name} · {formatFullDate(item.date)}
          {item.time && ` · ${item.time.slice(0, 5)}`}
        </div>
      </div>
      <div className={labelClass}>{daysLabel(item.days_away)}</div>
    </>
  );

  if (clickable) {
    return (
      <button className="countdown-row countdown-row--clickable" onClick={handleClick}>
        {Inner}
      </button>
    );
  }
  return <div className="countdown-row">{Inner}</div>;
}
