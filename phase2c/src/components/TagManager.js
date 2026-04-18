import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { useToast } from './ToastContext';

// Tag colour palette — must match the names the backend understands.
const TAG_COLORS = {
  slate:  '#64748b',
  red:    '#ef4444',
  orange: '#f97316',
  amber:  '#f59e0b',
  green:  '#22c55e',
  teal:   '#14b8a6',
  blue:   '#3b82f6',
  indigo: '#6366f1',
  purple: '#a855f7',
  pink:   '#ec4899',
};
const COLOR_NAMES = Object.keys(TAG_COLORS);

function ColorSwatch({ name, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tm-swatch${selected ? ' tm-swatch--selected' : ''}`}
      style={{ background: TAG_COLORS[name] }}
      title={name}
      aria-label={`${name}${selected ? ' (selected)' : ''}`}
    />
  );
}

export default function TagManager({ open, space, onClose, onChanged }) {
  const toast = useToast();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');

  const load = useCallback(() => {
    if (!space) return;
    setLoading(true);
    api.getTagsWithUsage(space.id)
      .then(d => setTags(d.tags || []))
      .catch(e => toast.show({ message: e.message, type: 'error' }))
      .finally(() => setLoading(false));
  }, [space, toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || 'blue');
  };
  const cancelEdit = () => { setEditingId(null); setEditName(''); };

  const saveEdit = async (tag) => {
    const trimmed = editName.trim();
    if (!trimmed) { toast.show({ message: 'Name cannot be empty', type: 'error' }); return; }
    try {
      await api.updateTag(tag.id, { name: trimmed, color: editColor });
      toast.show({ message: 'Tag updated', type: 'success' });
      cancelEdit();
      load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const deleteTag = async (tag) => {
    const count = tag.usage_count || 0;
    const warning = count > 0
      ? `"${tag.name}" is used on ${count} task${count === 1 ? '' : 's'}.\n\nDelete the tag? Tasks will lose this tag but won't be deleted themselves.`
      : `Delete tag "${tag.name}"?`;
    if (!window.confirm(warning)) return;
    try {
      await api.deleteTag(tag.id);
      toast.show({
        message: `Tag deleted: ${tag.name}`,
        type: 'undo',
        undo: async () => {
          try { await api.undoDeleteTag(tag.id); load(); onChanged && onChanged(); }
          catch (e) { toast.show({ message: e.message || 'Undo expired', type: 'error' }); }
        },
      });
      load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const addNew = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await api.createTag({ space_id: space.id, name: trimmed, color: newColor });
      toast.show({ message: `Created "${trimmed}"`, type: 'success' });
      setNewName(''); setNewColor('blue');
      load();
      onChanged && onChanged();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  if (!open) return null;

  return (
    <div className="dash-modal-overlay" onClick={onClose}>
      <div className="dash-modal tm-modal" onClick={e => e.stopPropagation()}>
        <h2>🏷️ Manage tags — {space?.name}</h2>

        {/* Create new */}
        <div className="tm-new-row">
          <input
            type="text"
            placeholder="New tag name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNew(); }}
          />
          <div className="tm-swatches">
            {COLOR_NAMES.map(c => (
              <ColorSwatch key={c} name={c} selected={newColor === c} onClick={() => setNewColor(c)} />
            ))}
          </div>
          <button className="dash-detail-save" onClick={addNew} disabled={!newName.trim()}>
            + Add
          </button>
        </div>

        <div className="tm-divider" />

        {/* List */}
        {loading ? (
          <div className="dash-empty">Loading tags…</div>
        ) : tags.length === 0 ? (
          <div className="dash-empty">No tags in this space yet.</div>
        ) : (
          <div className="tm-list">
            {tags.map(tag => {
              const isEditing = editingId === tag.id;
              const color = TAG_COLORS[tag.color] || tag.color || '#3b82f6';
              const used = tag.usage_count || 0;
              return (
                <div key={tag.id} className="tm-row">
                  {isEditing ? (
                    <>
                      <input
                        className="tm-edit-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(tag); if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus
                      />
                      <div className="tm-swatches">
                        {COLOR_NAMES.map(c => (
                          <ColorSwatch key={c} name={c} selected={editColor === c} onClick={() => setEditColor(c)} />
                        ))}
                      </div>
                      <button className="dash-detail-save" onClick={() => saveEdit(tag)}>Save</button>
                      <button className="dash-modal-cancel" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="tm-chip" style={{ background: color + '22', color, border: `1px solid ${color}66` }}>
                        {tag.name}
                      </span>
                      <span className="tm-usage">
                        {used === 0 ? 'Unused' : `Used on ${used} task${used === 1 ? '' : 's'}`}
                      </span>
                      <button className="dash-context-menu-btn" onClick={() => startEdit(tag)} title="Rename or recolour">✏️</button>
                      <button className="dash-context-danger" onClick={() => deleteTag(tag)} title="Delete tag">🗑️</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="dash-modal-actions">
          <button className="dash-modal-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
