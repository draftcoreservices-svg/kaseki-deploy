import React from 'react';
import { Check } from 'lucide-react';

const COLOR_SET = [
  { hex: '#3B82F6', name: 'Blue' },
  { hex: '#EC4899', name: 'Pink' },
  { hex: '#10B981', name: 'Green' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#8B5CF6', name: 'Purple' },
  { hex: '#14B8A6', name: 'Teal' },
  { hex: '#84CC16', name: 'Lime' },
  { hex: '#64748B', name: 'Slate' },
];

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="color-picker">
      {COLOR_SET.map(c => {
        const selected = value === c.hex;
        return (
          <button
            key={c.hex}
            type="button"
            className={`color-swatch ${selected ? 'is-selected' : ''}`}
            onClick={() => onChange(c.hex)}
            title={c.name}
            aria-label={`Pick ${c.name}`}
            style={{ background: c.hex }}
          >
            {selected && <Check size={14} strokeWidth={3} color="#fff" />}
          </button>
        );
      })}
    </div>
  );
}

export { COLOR_SET };
