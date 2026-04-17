import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

function SectionIcon({ section }) {
  const map = { home: '🏠', work: '💼', inbox: '📥' };
  return <span className="gs-section-icon">{map[section] || '📋'}</span>;
}

export default function GlobalSearch({ open, onClose, onOpenTask, onNavigateSection }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ tasks: [], todos: [], events: [] });
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ tasks: [], todos: [], events: [] });
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ tasks: [], todos: [], events: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const d = await api.globalSearch(query.trim());
        setResults({ tasks: d.tasks || [], todos: d.todos || [], events: d.events || [] });
        setCursor(0);
      } catch (e) {
        setResults({ tasks: [], todos: [], events: [] });
      }
      setLoading(false);
    }, 180);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  const flat = [
    ...results.tasks.map(t => ({ kind: 'task', ...t })),
    ...results.todos.map(t => ({ kind: 'todo', ...t })),
    ...results.events.map(e => ({ kind: 'event', ...e })),
  ];

  const onPick = useCallback((item) => {
    if (!item) return;
    if (item.kind === 'task') {
      onNavigateSection(item.section);
      setTimeout(() => onOpenTask(item.id), 80);
    } else {
      onNavigateSection(item.section);
    }
    onClose();
  }, [onNavigateSection, onOpenTask, onClose]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, Math.max(0, flat.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); onPick(flat[cursor]); }
  };

  if (!open) return null;

  return (
    <div className="gs-overlay" onClick={onClose}>
      <div className="gs-modal" onClick={e => e.stopPropagation()}>
        <div className="gs-input-wrap">
          <span className="gs-input-icon">🔍</span>
          <input
            ref={inputRef}
            className="gs-input"
            placeholder="Search tasks, todos, events..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {loading && <span className="gs-loading">…</span>}
        </div>
        <div className="gs-results">
          {!query.trim() && (
            <div className="gs-hint">
              Type to search across all your tasks, todos, and events.<br />
              <span className="gs-hint-kbd">↑↓</span> to navigate · <span className="gs-hint-kbd">↵</span> to open · <span className="gs-hint-kbd">Esc</span> to close
            </div>
          )}
          {query.trim() && flat.length === 0 && !loading && (
            <div className="gs-hint">No results for "{query}"</div>
          )}
          {results.tasks.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-title">Tasks</div>
              {results.tasks.map((t, i) => {
                const idx = i;
                const isActive = cursor === idx;
                return (
                  <div
                    key={'task-' + t.id}
                    className={`gs-item${isActive ? ' gs-item--active' : ''}`}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => onPick({ kind: 'task', ...t })}
                  >
                    <SectionIcon section={t.section} />
                    <div className="gs-item-body">
                      <div className="gs-item-title">{t.title}{t.archived ? ' (archived)' : ''}</div>
                      {t.description && <div className="gs-item-desc">{t.description.slice(0, 80)}</div>}
                    </div>
                    {t.due_date && <span className="gs-item-meta">{t.due_date}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {results.todos.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-title">Todos</div>
              {results.todos.map((t, i) => {
                const idx = results.tasks.length + i;
                const isActive = cursor === idx;
                return (
                  <div
                    key={'todo-' + t.id}
                    className={`gs-item${isActive ? ' gs-item--active' : ''}`}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => onPick({ kind: 'todo', ...t })}
                  >
                    <SectionIcon section={t.section} />
                    <div className="gs-item-body">
                      <div className="gs-item-title">{t.completed ? '✓ ' : ''}{t.title}</div>
                    </div>
                    <span className="gs-item-meta">{t.date}</span>
                  </div>
                );
              })}
            </div>
          )}
          {results.events.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-title">Events</div>
              {results.events.map((e, i) => {
                const idx = results.tasks.length + results.todos.length + i;
                const isActive = cursor === idx;
                return (
                  <div
                    key={'event-' + e.id}
                    className={`gs-item${isActive ? ' gs-item--active' : ''}`}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => onPick({ kind: 'event', ...e })}
                  >
                    <SectionIcon section={e.section} />
                    <div className="gs-item-body">
                      <div className="gs-item-title">{e.title}</div>
                      {e.description && <div className="gs-item-desc">{e.description.slice(0, 80)}</div>}
                    </div>
                    <span className="gs-item-meta">{e.date}{e.time ? ' ' + e.time : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
