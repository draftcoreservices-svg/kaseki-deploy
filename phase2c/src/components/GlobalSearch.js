import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import SpaceIcon from './SpaceIcon';

// Phase 2C: result items carry `space: {id, name, icon, color}` from the
// backend (attached by the /search endpoint via JOIN-by-lookup).
function SpaceBadge({ space }) {
  if (!space) return <span className="gs-space-badge" style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af' }}>?</span>;
  return (
    <span
      className="gs-space-badge"
      style={{
        background: space.color + '22',
        color: space.color,
      }}
    >
      <span className="gs-space-badge-icon">
        <SpaceIcon icon={space.icon} color={space.color} size={10} />
      </span>
      {space.name}
    </span>
  );
}

export default function GlobalSearch({ open, onClose, onOpenTask, onNavigateSpace }) {
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
    if (!item || !item.space) { onClose(); return; }
    if (item.kind === 'task') {
      onNavigateSpace(item.space);
      setTimeout(() => onOpenTask(item.id), 80);
    } else {
      onNavigateSpace(item.space);
    }
    onClose();
  }, [onNavigateSpace, onOpenTask, onClose]);

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
              Type to search across all your spaces.<br />
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
                    <SpaceBadge space={t.space} />
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
                    <SpaceBadge space={t.space} />
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
                    <SpaceBadge space={e.space} />
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
