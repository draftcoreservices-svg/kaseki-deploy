import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

// Dashboard imports BOTH TemplateManager and TemplatePicker from this file.

// ═══════════════════════════════════════════════════════════════════════════
// TemplatePicker — tiny inline chooser shown when user clicks "+ New" in the
// dashboard. Lets them pick an existing template or start blank, with a
// shortcut to open the full manager.
// ═══════════════════════════════════════════════════════════════════════════

export function TemplatePicker({ space, onBlank, onPick, onManage }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!space) return;
    let cancelled = false;
    api.getTemplates(space.id)
      .then(d => { if (!cancelled) setTemplates(d.templates || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [space?.id]);

  return (
    <div className="tmpl-picker">
      <h2>Start a new task</h2>
      <button className="tmpl-picker-option tmpl-picker-option--blank" onClick={onBlank}>
        <span className="tmpl-picker-icon">➕</span>
        <div className="tmpl-picker-info">
          <div className="tmpl-picker-name">Blank task</div>
          <div className="tmpl-picker-desc">Start from scratch</div>
        </div>
      </button>
      <div className="tmpl-picker-section-title">Templates</div>
      {loading ? (
        <div className="tmpl-picker-empty">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="tmpl-picker-empty">No templates for this space yet.</div>
      ) : (
        templates.map(t => (
          <button key={t.id} className="tmpl-picker-option" onClick={() => onPick(t)}>
            <span className="tmpl-picker-icon">📋</span>
            <div className="tmpl-picker-info">
              <div className="tmpl-picker-name">{t.name}</div>
              <div className="tmpl-picker-desc">
                {t.title}
                {(t.subtasks || []).length > 0 && ` · ${t.subtasks.length} subtask${t.subtasks.length > 1 ? 's' : ''}`}
              </div>
            </div>
          </button>
        ))
      )}
      <button className="tmpl-picker-manage" onClick={onManage}>⚙️ Manage templates…</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TemplateManager — full modal for CRUD of templates within a space
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_COLORS = { to_start: '#6b7280', in_progress: '#3b9eff', blocked: '#f87171', done: '#34d399' };
const PRIORITY_LABELS = { 1: '1 - Lowest', 2: '2 - Low', 3: '3 - Medium', 4: '4 - High', 5: '5 - Critical' };

export function TemplateManager({ space, onClose, onChanged }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // template object or 'new' or null
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!space) return;
    setLoading(true);
    try {
      const d = await api.getTemplates(space.id);
      setTemplates(d.templates || []);
    } catch (e) {}
    setLoading(false);
  }, [space?.id]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => setEditing({
    name: '',
    title: '',
    description: '',
    priority: 3,
    goals: '',
    subtasks: [],
  });

  const doSave = async (payload) => {
    try {
      if (editing.id) {
        await api.updateTemplate(editing.id, payload);
        toast.show({ message: 'Template updated', type: 'success' });
      } else {
        await api.createTemplate({ ...payload, space_id: space.id });
        toast.show({ message: 'Template created', type: 'success' });
      }
      setEditing(null);
      load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const doDelete = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.deleteTemplate(t.id);
      toast.show({ message: 'Template deleted', type: 'success' });
      load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  return (
    <div className="tmpl-mgr-overlay" onClick={onClose}>
      <div className="tmpl-mgr" onClick={e => e.stopPropagation()}>
        <div className="tmpl-mgr-header">
          <h2>Templates · {space?.name || ''}</h2>
          <button className="tmpl-mgr-close" onClick={onClose}>✕</button>
        </div>
        {editing ? (
          <TemplateEditForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={doSave}
          />
        ) : (
          <>
            <div className="tmpl-mgr-actions">
              <button className="dash-add-btn" onClick={startNew}>+ New Template</button>
            </div>
            {loading ? (
              <div className="tmpl-mgr-empty">Loading…</div>
            ) : templates.length === 0 ? (
              <div className="tmpl-mgr-empty">No templates yet. Create one to pre-fill tasks quickly.</div>
            ) : (
              <div className="tmpl-mgr-list">
                {templates.map(t => (
                  <div key={t.id} className="tmpl-mgr-row">
                    <div className="tmpl-mgr-row-info">
                      <div className="tmpl-mgr-row-name">{t.name}</div>
                      <div className="tmpl-mgr-row-title">{t.title}</div>
                      <div className="tmpl-mgr-row-meta">
                        <span style={{ color: STATUS_COLORS[t.status] || '#9ca3af' }}>P{t.priority}</span>
                        {(t.subtasks || []).length > 0 && <span> · {t.subtasks.length} subtask{t.subtasks.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="tmpl-mgr-row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>Edit</button>
                      <button className="btn btn-ghost btn-sm btn-danger" onClick={() => doDelete(t)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TemplateEditForm({ initial, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    title: initial.title || '',
    description: initial.description || '',
    priority: initial.priority || 3,
    goals: initial.goals || '',
    subtasks: (initial.subtasks || []).map(s => (typeof s === 'string' ? { title: s } : s)),
  });
  const [newSub, setNewSub] = useState('');
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addSub = () => {
    const t = newSub.trim();
    if (!t) return;
    u('subtasks', [...form.subtasks, { title: t }]);
    setNewSub('');
  };
  const removeSub = (idx) => {
    u('subtasks', form.subtasks.filter((_, i) => i !== idx));
  };
  const submit = () => {
    if (!form.name.trim() || !form.title.trim()) return;
    onSave({
      name: form.name.trim(),
      title: form.title.trim(),
      description: form.description,
      priority: form.priority,
      goals: form.goals,
      subtasks: form.subtasks.map(s => s.title || ''),
    });
  };
  return (
    <div className="tmpl-mgr-form">
      <div className="dash-modal-field"><label>Template name</label><input value={form.name} onChange={e => u('name', e.target.value)} placeholder="e.g. 'New case intake'" autoFocus /></div>
      <div className="dash-modal-field"><label>Default task title</label><input value={form.title} onChange={e => u('title', e.target.value)} placeholder="e.g. 'Case: <Name>'" /></div>
      <div className="dash-modal-field"><label>Description</label><textarea rows={2} value={form.description} onChange={e => u('description', e.target.value)} /></div>
      <div className="dash-modal-row">
        <div className="dash-modal-field"><label>Priority</label><select value={form.priority} onChange={e => u('priority', +e.target.value)}>{Object.entries(PRIORITY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="dash-modal-field"><label>Goals</label><textarea rows={2} value={form.goals} onChange={e => u('goals', e.target.value)} /></div>
      <div className="dash-modal-field">
        <label>Subtasks ({form.subtasks.length})</label>
        {form.subtasks.map((s, i) => (
          <div key={i} className="tmpl-mgr-sub-row">
            <span className="tmpl-mgr-sub-text">{s.title}</span>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={() => removeSub(i)}>✕</button>
          </div>
        ))}
        <div className="tmpl-mgr-sub-add">
          <input
            value={newSub}
            onChange={e => setNewSub(e.target.value)}
            placeholder="Add subtask…"
            onKeyDown={e => e.key === 'Enter' && addSub()}
          />
          <button className="dash-subtask-add-btn" disabled={!newSub.trim()} onClick={addSub}>Add</button>
        </div>
      </div>
      <div className="dash-modal-actions">
        <button className="dash-modal-cancel" onClick={onCancel}>Cancel</button>
        <button className="dash-modal-save" disabled={!form.name.trim() || !form.title.trim()} onClick={submit}>Save template</button>
      </div>
    </div>
  );
}

export default TemplateManager;
