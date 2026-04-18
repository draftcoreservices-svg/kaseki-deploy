import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

const TYPES = [
  { v: 'text',         label: 'Short text' },
  { v: 'long-text',    label: 'Long text' },
  { v: 'number',       label: 'Number' },
  { v: 'currency',     label: 'Currency (£)' },
  { v: 'date',         label: 'Date' },
  { v: 'datetime',     label: 'Date + time' },
  { v: 'checkbox',     label: 'Checkbox' },
  { v: 'dropdown',     label: 'Dropdown (single)' },
  { v: 'multi-select', label: 'Dropdown (multi)' },
  { v: 'email',        label: 'Email' },
  { v: 'url',          label: 'URL' },
  { v: 'phone',        label: 'Phone' },
];
const TYPES_WITH_OPTIONS = new Set(['dropdown', 'multi-select']);

function blankDraft() {
  return {
    id: null,
    label: '',
    type: 'text',
    options: [],
    required: false,
    show_in_list: false,
    show_in_create: false,
  };
}

export default function FieldManager({ open, space, onClose, onChanged }) {
  const toast = useToast();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(blankDraft());
  const [dirty, setDirty] = useState(false);
  const [optionInput, setOptionInput] = useState('');

  const load = useCallback(async () => {
    if (!space) return;
    setLoading(true);
    try {
      const d = await api.getSpaceFieldsWithUsage(space.id);
      setFields(d.fields || []);
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
    setLoading(false);
  }, [space, toast]);

  useEffect(() => { if (open) { load(); setDraft(blankDraft()); setDirty(false); } }, [open, load]);

  const selectField = (f) => {
    if (dirty && !window.confirm('You have unsaved changes. Discard?')) return;
    setDraft({
      id: f.id,
      label: f.label,
      type: f.type,
      options: Array.isArray(f.options) ? [...f.options] : [],
      required: !!f.required,
      show_in_list: !!f.show_in_list,
      show_in_create: !!f.show_in_create,
    });
    setDirty(false);
    setOptionInput('');
  };

  const newField = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard?')) return;
    setDraft(blankDraft());
    setDirty(false);
    setOptionInput('');
  };

  const d = (k, v) => { setDraft(dr => ({ ...dr, [k]: v })); setDirty(true); };

  const addOption = () => {
    const t = optionInput.trim();
    if (!t) return;
    if (draft.options.includes(t)) { toast.show({ message: 'Option already exists', type: 'error' }); return; }
    d('options', [...draft.options, t]);
    setOptionInput('');
  };
  const removeOption = (o) => d('options', draft.options.filter(x => x !== o));

  const save = async () => {
    if (!draft.label.trim()) { toast.show({ message: 'Label required', type: 'error' }); return; }
    if (TYPES_WITH_OPTIONS.has(draft.type) && draft.options.length === 0) {
      toast.show({ message: `${draft.type} needs at least one option`, type: 'error' });
      return;
    }
    try {
      const body = {
        label: draft.label.trim(),
        options: TYPES_WITH_OPTIONS.has(draft.type) ? draft.options : null,
        required: draft.required,
        show_in_list: draft.show_in_list,
        show_in_create: draft.show_in_create,
      };
      if (draft.id) {
        await api.updateField(space.id, draft.id, body);
        toast.show({ message: 'Field updated', type: 'success' });
      } else {
        body.type = draft.type;
        await api.createField(space.id, body);
        toast.show({ message: 'Field created', type: 'success' });
      }
      setDirty(false);
      await load();
      onChanged && onChanged();
      setDraft(blankDraft());
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const removeField = async (f) => {
    const count = f.usage_count || 0;
    const msg = count > 0
      ? `"${f.label}" is filled on ${count} task${count === 1 ? '' : 's'}. Delete this field and lose all those values?`
      : `Delete field "${f.label}"?`;
    if (!window.confirm(msg)) return;
    try {
      await api.deleteField(space.id, f.id);
      toast.show({ message: `Deleted: ${f.label}`, type: 'success' });
      if (draft.id === f.id) setDraft(blankDraft());
      await load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const move = async (f, dir) => {
    const ids = fields.map(x => x.id);
    const i = ids.indexOf(f.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Optimistic: reorder local state first
    const newFields = ids.map(id => fields.find(x => x.id === id));
    setFields(newFields);
    try { await api.reorderFields(space.id, ids); onChanged && onChanged(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); load(); }
  };

  if (!open) return null;

  return (
    <div className="dash-modal-overlay" onClick={onClose}>
      <div className="dash-modal fm-modal" onClick={e => e.stopPropagation()}>
        <h2>🧩 Manage fields — {space?.name}</h2>

        <div className="fm-body">
          {/* Left — field list */}
          <div className="fm-list-pane">
            <div className="fm-list-header">
              <span>Fields</span>
              <button className="fm-new-btn" onClick={newField}>+ New field</button>
            </div>
            {loading ? (
              <div className="dash-empty">Loading…</div>
            ) : fields.length === 0 ? (
              <div className="dash-empty">No fields yet. Click "+ New field" to add one.</div>
            ) : (
              <div className="fm-list">
                {fields.map((f, i) => (
                  <div
                    key={f.id}
                    className={`fm-list-row${draft.id === f.id ? ' fm-list-row--active' : ''}`}
                    onClick={() => selectField(f)}
                  >
                    <div className="fm-list-row-main">
                      <span className="fm-list-row-label">{f.label}</span>
                      <span className="fm-list-row-type">{f.type}</span>
                    </div>
                    {(f.usage_count || 0) > 0 && (
                      <span className="fm-list-row-usage">{f.usage_count} use{f.usage_count === 1 ? '' : 's'}</span>
                    )}
                    <div className="fm-list-row-actions" onClick={e => e.stopPropagation()}>
                      <button className="fm-reorder-btn" disabled={i === 0} onClick={() => move(f, -1)} title="Move up">↑</button>
                      <button className="fm-reorder-btn" disabled={i === fields.length - 1} onClick={() => move(f, 1)} title="Move down">↓</button>
                      <button className="fm-delete-btn" onClick={() => removeField(f)} title="Delete field">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right — editor */}
          <div className="fm-editor-pane">
            <div className="fm-editor-title">
              {draft.id ? 'Edit field' : 'New field'}
            </div>
            <div className="fm-form">
              <label className="fm-label-row">
                <span>Label</span>
                <input
                  className="cf-input"
                  type="text"
                  value={draft.label}
                  onChange={e => d('label', e.target.value)}
                  placeholder="e.g. Case Reference"
                  autoFocus
                />
              </label>
              <label className="fm-label-row">
                <span>Type</span>
                <select
                  className="cf-input"
                  value={draft.type}
                  onChange={e => d('type', e.target.value)}
                  disabled={!!draft.id}
                  title={draft.id ? 'Type cannot be changed after creation' : ''}
                >
                  {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>

              {TYPES_WITH_OPTIONS.has(draft.type) && (
                <div className="fm-options">
                  <span>Options</span>
                  <div className="fm-options-list">
                    {draft.options.map(o => (
                      <span key={o} className="cf-chip fm-option-chip">
                        {o}
                        <button className="fm-option-remove" onClick={() => removeOption(o)}>×</button>
                      </span>
                    ))}
                    {draft.options.length === 0 && <span className="cf-empty">No options yet</span>}
                  </div>
                  <div className="fm-option-add">
                    <input
                      className="cf-input"
                      type="text"
                      value={optionInput}
                      onChange={e => setOptionInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                      placeholder="Add option and press Enter"
                    />
                    <button className="dash-detail-save" onClick={addOption} disabled={!optionInput.trim()}>+ Add</button>
                  </div>
                </div>
              )}

              <div className="fm-flags">
                <label className="cf-checkbox">
                  <input type="checkbox" checked={draft.required} onChange={e => d('required', e.target.checked)} />
                  <span>Required — new tasks must fill this</span>
                </label>
                <label className="cf-checkbox">
                  <input type="checkbox" checked={draft.show_in_create} onChange={e => d('show_in_create', e.target.checked)} />
                  <span>Show in new-task modal</span>
                </label>
                <label className="cf-checkbox">
                  <input type="checkbox" checked={draft.show_in_list} onChange={e => d('show_in_list', e.target.checked)} />
                  <span>Peek in task list rows</span>
                </label>
              </div>

              <div className="fm-actions">
                <button className="dash-detail-save" onClick={save} disabled={!draft.label.trim()}>
                  {draft.id ? 'Save changes' : 'Create field'}
                </button>
                {draft.id && (
                  <button className="dash-modal-cancel" onClick={() => { setDraft(blankDraft()); setDirty(false); }}>
                    Cancel edit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dash-modal-actions">
          <button className="dash-modal-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
