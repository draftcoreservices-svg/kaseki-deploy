import React from 'react';

const VIEWS = [
  { key: 'list',     label: 'List',     icon: '☰' },
  { key: 'board',    label: 'Board',    icon: '▦' },
  { key: 'matrix',   label: 'Matrix',   icon: '⊞' },
  { key: 'calendar', label: 'Calendar', icon: '📅' },
  { key: 'clients',  label: 'Clients',  icon: '👥', requiresClientDirectory: true },
];

// Phase 2C: `space` prop replaces `section`. When a button is active, it uses
// the space's colour via the inline --space-accent CSS variable (set on the
// Dashboard root), which the .vs-btn--active override in phase2c.css picks up.
//
// Phase C Batch 3: The Clients view only renders if the space has a field
// flagged is_client_identifier. Dashboard passes `hasClientDirectory` to hide
// the button when no such field exists. Falling back to hiding rather than
// disabling because a disabled button with a tooltip people don't read just
// creates "why doesn't this work" support questions.
export default function ViewSwitcher({ value, onChange, space, hasClientDirectory }) {
  const views = VIEWS.filter(v => !v.requiresClientDirectory || hasClientDirectory);
  return (
    <div className="vs-wrap" role="tablist">
      {views.map(v => (
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
