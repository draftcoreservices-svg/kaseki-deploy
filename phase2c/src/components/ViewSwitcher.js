import React from 'react';

const VIEWS = [
  { key: 'list',     label: 'List',     icon: '☰' },
  { key: 'board',    label: 'Board',    icon: '▦' },
  { key: 'matrix',   label: 'Matrix',   icon: '⊞' },
  { key: 'calendar', label: 'Calendar', icon: '📅' },
];

// Phase 2C: `space` prop replaces `section`. When a button is active, it uses
// the space's colour via the inline --space-accent CSS variable (set on the
// Dashboard root), which the .vs-btn--active override in phase2c.css picks up.
export default function ViewSwitcher({ value, onChange, space }) {
  return (
    <div className="vs-wrap" role="tablist">
      {VIEWS.map(v => (
        <button
          key={v.key}
          className={`vs-btn${value === v.key ? ' vs-btn--active' : ''}`}
          onClick={() => onChange(v.key)}
          title={v.label}
          role="tab"
          aria-selected={value === v.key}
        >
          <span className="vs-btn-icon">{v.icon}</span>
          <span className="vs-btn-label">{v.label}</span>
        </button>
      ))}
    </div>
  );
}
