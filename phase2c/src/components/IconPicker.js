import React from 'react';
import * as Icons from 'lucide-react';

const ICON_SET = [
  'briefcase', 'scale', 'stethoscope', 'wrench', 'book', 'graduation-cap', 'gavel', 'clipboard-list',
  'house', 'heart', 'users', 'baby', 'shopping-cart', 'plane',
  'dumbbell', 'activity', 'pill', 'leaf',
  'sparkles', 'palette', 'camera', 'music', 'gamepad-2',
  'wallet', 'receipt', 'chart-line', 'folder',
  'code', 'server', 'cpu',
];

function iconNameToComponent(name) {
  if (!name) return null;
  const pascal = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return Icons[pascal] || null;
}

export default function IconPicker({ value, onChange, accent = '#3B82F6' }) {
  return (
    <div className="icon-picker">
      {ICON_SET.map(icon => {
        const Comp = iconNameToComponent(icon) || Icons.Sparkles;
        const selected = value === icon;
        return (
          <button
            key={icon}
            type="button"
            className={`icon-picker-item ${selected ? 'is-selected' : ''}`}
            onClick={() => onChange(icon)}
            title={icon}
            style={selected ? { background: accent, color: '#fff', borderColor: accent } : {}}
          >
            <Comp size={18} strokeWidth={2.25} />
          </button>
        );
      })}
    </div>
  );
}

export { ICON_SET };
