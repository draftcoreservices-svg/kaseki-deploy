import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

// A dropdown that lets the user apply saved filter combos, save the current one, or manage them.
export default function SavedViewsMenu({ section, currentFilters, currentViewType, onApply, onManage }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef(null);

  const load = () => {
    api.getSavedViews(section)
      .then(d => setViews(d.views || []))
      .catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [section]);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSaveOpen(false); }
    };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  const saveCurrent = async () => {
    if (!name.trim()) return;
    try {
      await api.createSavedView({
        section,
        name: name.trim(),
        filters: currentFilters || {},
        view_type: currentViewType || 'list',
      });
      toast.show({ message: `Saved view "${name.trim()}"`, type: 'success' });
      setName('');
      setSaveOpen(false);
      load();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const apply = (v) => {
    onApply(v.filters || {}, v.view_type || 'list');
    setOpen(false);
  };

  const del = async (e, v) => {
    e.stopPropagation();
    if (!window.confirm(`Delete saved view "${v.name}"?`)) return;
    try {
      await api.deleteSavedView(v.id);
      toast.show({ message: 'Saved view deleted', type: 'success' });
      load();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  return (
    <div className="sv-wrap" ref={ref} onClick={e => e.stopPropagation()}>
      <button className="sv-btn" onClick={() => setOpen(v => !v)} title="Saved views">
        ⭐ <span className="sv-btn-label">Views</span> ▾
      </button>
      {open && (
        <div className="sv-menu">
          <div className="sv-menu-section">
            <div className="sv-menu-title">Saved filters</div>
            {views.length === 0 ? (
              <div className="sv-menu-empty">None saved yet</div>
            ) : (
              views.map(v => (
                <button key={v.id} className="sv-menu-item" onClick={() => apply(v)}>
                  <span className="sv-menu-item-name">{v.name}</span>
                  {v.view_type && v.view_type !== 'list' && <span className="sv-menu-item-badge">{v.view_type}</span>}
                  <span className="sv-menu-item-delete" onClick={(e) => del(e, v)} title="Delete">✕</span>
                </button>
              ))
            )}
          </div>

          <div className="sv-menu-divider" />

          {!saveOpen ? (
            <button className="sv-menu-action" onClick={() => setSaveOpen(true)}>💾 Save current as…</button>
          ) : (
            <div className="sv-save-form">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCurrent(); } }}
                placeholder="View name"
              />
              <button onClick={saveCurrent}>Save</button>
              <button onClick={() => { setSaveOpen(false); setName(''); }}>Cancel</button>
            </div>
          )}

          <button className="sv-menu-action" onClick={() => { setOpen(false); onManage && onManage(); }}>
            ⚙️ Manage views…
          </button>
        </div>
      )}
    </div>
  );
}
