import React from 'react';

const VIEWS = [
  { key: 'list',     label: 'List',     icon: '☰' },
  { key: 'board',    label: 'Board',    icon: '▦' },
  { key: 'matrix',   label: 'Matrix',   icon: '⊞' },
  { key: 'calendar', label: 'Calendar', icon: '📅' },
];

export default function ViewSwitcher({ value, onChange, section }) {
  return (
    <div className="vs-wrap" role="tablist">
      {VIEWS.map(v => (
        <button
          key={v.key}
          className={`vs-btn${value === v.key ? ` vs-btn--active vs-btn--${section}` : ''}`}
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
