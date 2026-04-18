import React from 'react';

// A single field input. Renders a type-appropriate control.
// Controlled: receives value (string form) and calls onChange(newValue).
// For multi-select, value is an array of strings. For checkbox, '0' | '1'.
// All other types use string.
export default function CustomFieldInput({ field, value, onChange, editing }) {
  const disabled = !editing;

  // Display mode — render value as plain text for read-only view.
  if (!editing) {
    if (value === null || value === undefined || value === '') {
      return <span className="cf-empty">—</span>;
    }
    if (field.type === 'checkbox') {
      return <span className="cf-display">{value === '1' || value === 1 ? '✓ Yes' : '—'}</span>;
    }
    if (field.type === 'multi-select') {
      const arr = safeArr(value);
      if (!arr || arr.length === 0) return <span className="cf-empty">—</span>;
      return (
        <span className="cf-display cf-multichips">
          {arr.map(v => <span key={v} className="cf-chip">{v}</span>)}
        </span>
      );
    }
    if (field.type === 'url') {
      return <a className="cf-display cf-link" href={value} target="_blank" rel="noreferrer noopener">{value}</a>;
    }
    if (field.type === 'email') {
      return <a className="cf-display cf-link" href={`mailto:${value}`}>{value}</a>;
    }
    if (field.type === 'phone') {
      return <a className="cf-display cf-link" href={`tel:${value}`}>{value}</a>;
    }
    if (field.type === 'currency') {
      const n = parseFloat(value);
      if (Number.isFinite(n)) return <span className="cf-display">£{n.toFixed(2)}</span>;
      return <span className="cf-display">{value}</span>;
    }
    if (field.type === 'datetime') {
      const d = new Date(value);
      if (!isNaN(d)) return <span className="cf-display">{d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
      return <span className="cf-display">{value}</span>;
    }
    if (field.type === 'date') {
      const d = new Date(value);
      if (!isNaN(d)) return <span className="cf-display">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
      return <span className="cf-display">{value}</span>;
    }
    if (field.type === 'long-text') {
      return <div className="cf-display cf-longtext">{value}</div>;
    }
    return <span className="cf-display">{value}</span>;
  }

  // Edit mode.
  switch (field.type) {
    case 'checkbox':
      return (
        <label className="cf-checkbox">
          <input
            type="checkbox"
            checked={value === '1' || value === 1 || value === true}
            onChange={e => onChange(e.target.checked ? '1' : '0')}
            disabled={disabled}
          />
          <span>{field.label}</span>
        </label>
      );
    case 'dropdown': {
      const opts = Array.isArray(field.options) ? field.options : [];
      return (
        <select className="cf-input" value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">— None —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    case 'multi-select': {
      const opts = Array.isArray(field.options) ? field.options : [];
      const arr = safeArr(value) || [];
      const toggle = (o) => {
        const set = new Set(arr);
        if (set.has(o)) set.delete(o); else set.add(o);
        onChange(Array.from(set));
      };
      return (
        <div className="cf-multiselect">
          {opts.map(o => {
            const active = arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                className={`cf-multiselect-chip${active ? ' cf-multiselect-chip--active' : ''}`}
                onClick={() => toggle(o)}
              >
                {active ? '✓ ' : ''}{o}
              </button>
            );
          })}
        </div>
      );
    }
    case 'date':
      return <input className="cf-input" type="date" value={value || ''} onChange={e => onChange(e.target.value)} />;
    case 'datetime':
      return <input className="cf-input" type="datetime-local" value={value || ''} onChange={e => onChange(e.target.value)} />;
    case 'number':
      return <input className="cf-input" type="number" value={value || ''} onChange={e => onChange(e.target.value)} />;
    case 'currency':
      return (
        <div className="cf-currency-wrap">
          <span className="cf-currency-prefix">£</span>
          <input className="cf-input cf-currency-input" type="number" step="0.01" value={value || ''} onChange={e => onChange(e.target.value)} />
        </div>
      );
    case 'email':
      return <input className="cf-input" type="email" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="name@example.com" />;
    case 'url':
      return <input className="cf-input" type="url" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="https://…" />;
    case 'phone':
      return <input className="cf-input" type="tel" value={value || ''} onChange={e => onChange(e.target.value)} />;
    case 'long-text':
      return <textarea className="cf-input cf-textarea" rows={3} value={value || ''} onChange={e => onChange(e.target.value)} />;
    case 'text':
    default:
      return <input className="cf-input" type="text" value={value || ''} onChange={e => onChange(e.target.value)} />;
  }
}

function safeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; }
    catch { return null; }
  }
  return null;
}
