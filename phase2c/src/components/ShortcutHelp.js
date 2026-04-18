import React from 'react';

// Phase 2C: ShortcutHelp modal. Opened via '?' global shortcut in App.js.
// Props: open, onClose

const GROUPS = [
  {
    title: 'Global',
    items: [
      { keys: ['/'],       desc: 'Focus search' },
      { keys: ['Ctrl', 'K'], desc: 'Focus search' },
      { keys: ['Shift', 'N'], desc: 'Quick capture' },
      { keys: ['?'],       desc: 'Show this help' },
      { keys: ['Esc'],     desc: 'Close modals / dismiss' },
    ],
  },
  {
    title: 'In a space',
    items: [
      { keys: ['n'],       desc: 'New task (template picker)' },
      { keys: ['j'],       desc: 'Next task' },
      { keys: ['k'],       desc: 'Previous task' },
      { keys: ['Enter'],   desc: 'Open selected task' },
      { keys: ['e'],       desc: 'Edit selected task' },
      { keys: ['d'],       desc: 'Toggle done on selected' },
      { keys: ['p'],       desc: 'Toggle pin on selected' },
      { keys: ['a'],       desc: 'Archive / restore selected' },
    ],
  },
  {
    title: 'Search (when open)',
    items: [
      { keys: ['↑', '↓'],  desc: 'Navigate results' },
      { keys: ['Enter'],   desc: 'Open result' },
      { keys: ['Esc'],     desc: 'Close search' },
    ],
  },
];

export default function ShortcutHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="sh-overlay" onClick={onClose}>
      <div className="sh-modal" onClick={e => e.stopPropagation()}>
        <div className="sh-header">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="sh-body">
          {GROUPS.map(g => (
            <div key={g.title} className="sh-group">
              <div className="sh-group-title">{g.title}</div>
              <div className="sh-group-items">
                {g.items.map((it, i) => (
                  <div key={i} className="sh-item">
                    <span className="sh-item-keys">
                      {it.keys.map((k, j) => (
                        <React.Fragment key={j}>
                          <kbd className="sh-kbd">{k}</kbd>
                          {j < it.keys.length - 1 && <span className="sh-plus">+</span>}
                        </React.Fragment>
                      ))}
                    </span>
                    <span className="sh-item-desc">{it.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
