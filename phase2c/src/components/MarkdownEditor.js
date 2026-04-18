import React, { useRef, useState } from 'react';
import MarkdownRender from './MarkdownRender';

// ═══════════════════════════════════════════════════════════════════════════
// MarkdownEditor — Phase F.
//
// A textarea with a small toolbar (bold, italic, heading, list, link, code)
// and an Edit / Preview toggle. When Preview is active, the rendered
// Markdown replaces the textarea; Edit brings the textarea back with the
// same cursor position intact.
//
// Props:
//   value, onChange    — controlled string value, standard pattern
//   placeholder        — textarea placeholder text
//   rows               — initial textarea rows (default 6)
//   minimal            — if true, hides the toolbar (just textarea + toggle)
//   autoFocus          — focus the textarea on mount
//   onEnterCmd         — optional. Called on Cmd/Ctrl+Enter. Useful for
//                        "submit on Cmd+Enter" flows like the new-note form.
//
// Toolbar buttons insert the right Markdown syntax at the cursor, wrapping
// any selected text. If no selection, they insert a placeholder the user
// can immediately overwrite. All handlers preserve focus.
// ═══════════════════════════════════════════════════════════════════════════

// Wrap or insert helper. Modifies the textarea value and cursor via the
// native DOM ref so React's controlled-input contract stays intact — we
// read the resulting value and call onChange.
function applyWrap(ta, onChange, before, after, placeholder) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const selected = val.slice(start, end) || placeholder;
  const next = val.slice(0, start) + before + selected + after + val.slice(end);
  // Restore selection over the inserted content so the user can type to
  // replace the placeholder or re-style the selection.
  const selStart = start + before.length;
  const selEnd = selStart + selected.length;
  onChange(next);
  // setSelectionRange has to run after React re-renders — microtask queue
  // via requestAnimationFrame is the safest cross-browser way.
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(selStart, selEnd);
  });
}

// Prefix-per-line helper for list items. Adds "- " (or the given prefix) to
// the start of each selected line. If nothing selected, adds to current line.
function applyLinePrefix(ta, onChange, prefix) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  // Expand selection to line boundaries so we can prefix whole lines.
  let lineStart = start;
  while (lineStart > 0 && val[lineStart - 1] !== '\n') lineStart--;
  let lineEnd = end;
  while (lineEnd < val.length && val[lineEnd] !== '\n') lineEnd++;
  const block = val.slice(lineStart, lineEnd);
  const prefixed = block.split('\n').map(l => prefix + l).join('\n');
  const next = val.slice(0, lineStart) + prefixed + val.slice(lineEnd);
  onChange(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(lineStart, lineStart + prefixed.length);
  });
}

const TB_BUTTONS = [
  { key: 'bold',   label: 'B',  title: 'Bold (Cmd/Ctrl+B)',        wrap: ['**', '**', 'bold text'] },
  { key: 'italic', label: 'I',  title: 'Italic (Cmd/Ctrl+I)',      wrap: ['*', '*', 'italic text'] },
  { key: 'h',      label: 'H',  title: 'Heading',                  line: '## ' },
  { key: 'ul',     label: '•',  title: 'Bullet list',              line: '- ' },
  { key: 'link',   label: '🔗', title: 'Link',                     wrap: ['[', '](url)', 'link text'] },
  { key: 'code',   label: '</>',title: 'Inline code',              wrap: ['`', '`', 'code'] },
];

export default function MarkdownEditor({
  value, onChange, placeholder, rows = 6, minimal = false, autoFocus = false, onEnterCmd,
}) {
  const [mode, setMode] = useState('edit'); // 'edit' | 'preview'
  const ref = useRef(null);

  const handleToolbar = (btn) => () => {
    const ta = ref.current;
    if (!ta) return;
    if (btn.wrap) applyWrap(ta, onChange, btn.wrap[0], btn.wrap[1], btn.wrap[2]);
    else if (btn.line) applyLinePrefix(ta, onChange, btn.line);
  };

  const handleKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter' && onEnterCmd) {
      e.preventDefault();
      onEnterCmd();
      return;
    }
    if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      handleToolbar(TB_BUTTONS[0])();
      return;
    }
    if (mod && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      handleToolbar(TB_BUTTONS[1])();
      return;
    }
  };

  return (
    <div className="md-editor">
      <div className="md-editor-bar">
        {!minimal && mode === 'edit' && (
          <div className="md-editor-toolbar">
            {TB_BUTTONS.map(btn => (
              <button
                key={btn.key}
                type="button"
                className="md-editor-tb-btn"
                onClick={handleToolbar(btn)}
                title={btn.title}
                tabIndex={-1 /* don't break tab order into toolbar */}
              >{btn.label}</button>
            ))}
          </div>
        )}
        <div className="md-editor-mode">
          <button
            type="button"
            className={`md-editor-mode-btn${mode === 'edit' ? ' md-editor-mode-btn--active' : ''}`}
            onClick={() => setMode('edit')}
            title="Edit"
          >Edit</button>
          <button
            type="button"
            className={`md-editor-mode-btn${mode === 'preview' ? ' md-editor-mode-btn--active' : ''}`}
            onClick={() => setMode('preview')}
            title="Preview"
          >Preview</button>
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea
          ref={ref}
          className="md-editor-textarea"
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      ) : (
        <div className="md-editor-preview">
          <MarkdownRender content={value} />
        </div>
      )}
    </div>
  );
}
