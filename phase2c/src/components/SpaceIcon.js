import React from 'react';
import * as Icons from 'lucide-react';

// Convert a kebab-case icon name ("graduation-cap") to the Lucide export
// name ("GraduationCap").
function iconNameToComponent(name) {
  if (!name) return null;
  const pascal = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return Icons[pascal] || null;
}

export default function SpaceIcon({ icon, color, size = 20, className = '', style = {} }) {
  const IconComp = iconNameToComponent(icon) || Icons.Sparkles;
  // Render as a coloured rounded pill with the icon inside.
  // Dimensions auto-scale from size.
  const pillSize = size + 12;
  return (
    <div
      className={`space-icon ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: pillSize,
        height: pillSize,
        borderRadius: Math.round(pillSize * 0.3),
        background: color,
        color: '#fff',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <IconComp size={size} strokeWidth={2.25} />
    </div>
  );
}
