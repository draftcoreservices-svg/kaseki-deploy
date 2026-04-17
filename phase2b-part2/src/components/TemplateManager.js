import React, { useState, useEffect } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

// Manage templates (list, create, edit, delete) within a section.
export function TemplateManager({ section, onClose, onChanged }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null | template | 'new'
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getTemplates(section)
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [section]);

  const del = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.deleteTemplate(t.id);
      toast.show({ message: 'Template deleted', type: 'success' });
      load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  if (editing) {
    return (
      <TemplateEditor
        section={section}
        template={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); onChanged && onChanged(); }}
      />
    );
  }

  return (
    <div className="dash-modal-overlay" onClick={onClose}>
      <div className="dash-modal dash-modal--wide" onClick={e => e.stopPropagation()}>
        <h2>📋 Templates · {section === 'work' ? 'Work' : section === 'inbox' ? 'Inbox' : 'Home'}</h2>
        {loading ? <div className="dash-empty">Loading…</div> : (
          <>
            {templates.length === 0 ? (
              <div className="dash-empty">No templates yet. Create one to speed up recurring tasks.</div>
            ) : (
              <div className="tmpl-list">
                {templates.map(t => (
                  <div key={t.id} className="tmpl-item">
                    <div className="tmpl-item-main">
                      <div className="tmpl-item-name">{t.name}</div>
                      <div className="tmpl-item-meta">
                        {t.title}
                        {(t.subtasks || []).length > 0 && <span> · {t.subtasks.length} subtask{t.subtasks.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="tmpl-item-actions">
                      <button onClick={() => setEditing(t)} title="Edit">✎</button>
                      <button onClick={() => del(t)} title="Delete" className="tmpl-item-danger">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="dash-modal-actions">
          <button className="dash-modal-cancel" onClick={onClose}>Close</button>
          <button className={`dash-modal-save dash-modal-save--${section}`} onClick={() => setEditing('new')}>+ New Template</button>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ section, template, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: template?.name || '',
    title: template?.title || '',
    description: template?.description || '',
    priority: template?.priority || 3,
    goals: template?.goals || '',
    case_reference: template?.case_reference || '',
    client_name: template?.client_name || '',
  });
  const [subtasks, setSubtasks] = useState(
    (template?.subtasks || []).map(s => typeof s === 'string' ? s : (s.title || ''))
  );
  const [newSub, setNewSub] = useState('');
  const [saving, setSaving] = useState(false);

  const addSub = () => { if (newSub.trim()) { setSubtasks([...subtasks, newSub.trim()]); setNewSub(''); } };
  const removeSub = (i) => setSubtasks(subtasks.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!form.name || !form.title) {
      toast.show({ message: 'Name and title are required', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        section,
        subtasks: subtasks.map(title => ({ title })),
      };
      if (template) {
        await api.updateTemplate(template.id, body);
      } else {
        await api.createTemplate(body);
      }
      toast.show({ message: template ? 'Template updated' : 'Template created', type: 'success' });
      onSaved();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
    setSaving(false);
  };

  return (
    <div className="dash-modal-overlay" onClick={onClose}>
      <div className="dash-modal dash-modal--wide" onClick={e => e.stopPropagation()}>
        <h2>{template ? 'Edit Template' : 'New Template'}</h2>
        <div className="dash-modal-field"><label>Template Name</label><input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. New Client Onboarding" /></div>
        <div className="dash-modal-field"><label>Task Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Default task title when applied" /></div>
        <div className="dash-modal-field"><label>Description</label><textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div className="dash-modal-row">
          <div className="dash-modal-field"><label>Priority</label>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: +e.target.value })}>
              <option value={1}>1 - Lowest</option><option value={2}>2 - Low</option><option value={3}>3 - Medium</option><option value={4}>4 - High</option><option value={5}>5 - Critical</option>
            </select>
          </div>
        </div>
        {section === 'work' && (
          <div className="dash-modal-row">
            <div className="dash-modal-field"><label>Default Case Ref</label><input value={form.case_reference} onChange={e => setForm({ ...form, case_reference: e.target.value })} /></div>
            <div className="dash-modal-field"><label>Default Client</label><input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} /></div>
          </div>
        )}
        <div className="dash-modal-field"><label>Goals</label><textarea rows={2} value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} /></div>

        <div className="dash-modal-field">
          <label>Subtasks (auto-created)</label>
          <div className="tmpl-subtasks">
            {subtasks.map((s, i) => (
              <div key={i} className="tmpl-subtask">
                <span>{s}</span>
                <button onClick={() => removeSub(i)} title="Remove">✕</button>
              </div>
            ))}
            <div className="tmpl-subtask-new">
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} placeholder="New subtask (press Enter to add)" />
              <button onClick={addSub}>+ Add</button>
            </div>
          </div>
        </div>

        <div className="dash-modal-actions">
          <button className="dash-modal-cancel" onClick={onClose}>Cancel</button>
          <button className={`dash-modal-save dash-modal-save--${section}`} disabled={saving} onClick={submit}>{saving ? 'Saving…' : (template ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  );
}

// Inline picker used in the "New Task" flow — choose a template or start blank
export function TemplatePicker({ section, onPick, onBlank, onManage }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTemplates(section)
      .then(d => setTemplates(d.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [section]);

  return (
    <div className="tmpl-picker">
      <div className="tmpl-picker-title">Start from…</div>
      <button className="tmpl-picker-blank" onClick={onBlank}>
        <span className="tmpl-picker-blank-icon">+</span>
        <span>Blank task</span>
      </button>
      {loading ? <div className="dash-empty-small">Loading…</div> :
        templates.length === 0 ? <div className="dash-empty-small">No templates yet</div> :
        templates.map(t => (
          <button key={t.id} className="tmpl-picker-item" onClick={() => onPick(t)}>
            <span className="tmpl-picker-item-icon">📋</span>
            <div className="tmpl-picker-item-info">
              <div className="tmpl-picker-item-name">{t.name}</div>
              <div className="tmpl-picker-item-desc">{t.title}{(t.subtasks || []).length > 0 && ` · ${t.subtasks.length} subtask${t.subtasks.length > 1 ? 's' : ''}`}</div>
            </div>
          </button>
        ))
      }
      <button className="tmpl-picker-manage" onClick={onManage}>Manage templates…</button>
    </div>
  );
}
