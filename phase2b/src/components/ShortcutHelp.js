import React from 'react';

const SHORTCUTS = [
  { section: 'Anywhere', items: [
    { k: '/', d: 'Global search' },
    { k: 'Ctrl+K', d: 'Global search' },
    { k: 'Shift+N', d: 'Quick capture to Inbox' },
    { k: '?', d: 'Show this help' },
    { k: 'Esc', d: 'Close modals / panels' },
  ]},
  { section: 'Dashboard', items: [
    { k: 'n', d: 'New task' },
    { k: 'e', d: 'Edit selected task' },
    { k: 'd', d: 'Mark selected task done' },
    { k: 'p', d: 'Pin/unpin selected task' },
    { k: 'a', d: 'Archive selected task' },
    { k: 'j / k', d: 'Select next / previous task' },
  ]},
];

export default function ShortcutHelp({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="sh-overlay" onClick={onClose}>
      <div className="sh-modal" onClick={e => e.stopPropagation()}>
        <div className="sh-header">
          <span className="sh-title">⌨️ Keyboard shortcuts</span>
          <button className="sh-close" onClick={onClose}>✕</button>
        </div>
        <div className="sh-body">
          {SHORTCUTS.map(group => (
            <div key={group.section} className="sh-group">
              <div className="sh-group-title">{group.section}</div>
              <div className="sh-list">
                {group.items.map((i, idx) => (
                  <div key={idx} className="sh-row">
                    <span className="sh-keys">
                      {i.k.split(' ').map((part, j) => (
                        <span key={j}>
                          {j > 0 && <span className="sh-sep">then</span>}
                          {part.split('+').map((k, m) => (
                            <span key={m}>
                              {m > 0 && <span className="sh-plus">+</span>}
                              <kbd className="sh-kbd">{k}</kbd>
                            </span>
                          ))}
                        </span>
                      ))}
                    </span>
                    <span className="sh-desc">{i.d}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="sh-footer">
            Shortcuts can be disabled in preferences.
          </div>
        </div>
      </div>
    </div>
  );
}
