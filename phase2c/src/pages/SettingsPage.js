import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Pencil, Archive, Eye, EyeOff, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../api';
import SpaceIcon from '../components/SpaceIcon';
import IconPicker from '../components/IconPicker';
import ColorPicker from '../components/ColorPicker';
import CreateSpaceModal from './CreateSpaceModal';

export default function SettingsPage({ onBack, onRestartOnboarding, onTourReplay, theme, onToggleTheme, user }) {
  const [spaces, setSpaces] = useState([]);
  const [archived, setArchived] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [dangerText, setDangerText] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([api.getSpaces(), api.getArchivedSpaces(), api.getPreferences()]);
      setSpaces(a.spaces || []);
      setArchived(b.spaces || []);
      setPrefs(c.preferences || null);
    } catch (err) {
      console.error('Settings reload failed', err);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleArchive = async (s) => {
    if (!window.confirm(`Archive "${s.name}"? Its tasks will be hidden but not deleted. You can restore from the Archived list below.`)) return;
    await api.archiveSpace(s.id);
    await reload();
  };
  const handleUnarchive = async (s) => {
    await api.unarchiveSpace(s.id);
    await reload();
  };
  const handleHardDelete = async (s) => {
    if (!window.confirm(`Permanently delete "${s.name}" and ALL its tasks, todos, events, notes, tags? This cannot be undone.`)) return;
    await api.hardDeleteSpace(s.id);
    await reload();
  };

  const handleVisibility = async (s) => {
    await api.updateSpace(s.id, { visible: s.visible ? 0 : 1 });
    await reload();
  };

  const handleQuickCapture = async (spaceId) => {
    await api.savePreferences({ quick_capture_space_id: spaceId });
    await reload();
  };

  const handleRestartOnboarding = async () => {
    if (!window.confirm('Re-run the onboarding wizard? Your existing spaces will be preserved. You can review and add more.')) return;
    await api.restartOnboarding();
    onRestartOnboarding?.();
  };

  // Phase H Stage 2 — replay Kaseki's tour. Clears the persisted completion
  // flag then triggers the parent's onTourReplay, which flips local state
  // so TourAutoStart fires again on next dashboard/landing entry. Back-nav
  // to landing happens automatically via onBack() — the tour auto-start
  // logic will then pick it up.
  const handleReplayTour = async () => {
    try {
      await api.savePreferences({ tour_completed: 0 });
      onTourReplay?.();
      onBack?.();
    } catch (err) {
      alert('Failed to reset tour: ' + (err.message || 'unknown error'));
    }
  };

  const handleWipeAllData = async () => {
    if (dangerText !== 'DELETE EVERYTHING') return;
    setBusy(true);
    try {
      // Hard-delete every space (cascades to all their content).
      for (const s of [...spaces, ...archived]) {
        await api.hardDeleteSpace(s.id);
      }
      // Then flip onboarding flag off so wizard runs again.
      await api.restartOnboarding();
      onRestartOnboarding?.();
    } catch (err) {
      alert('Failed to wipe: ' + (err.message || 'unknown error'));
    }
    setBusy(false);
  };

  return (
    <div className="settings-root">
      <header className="settings-header">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="settings-title">Settings</h1>
        <div className="settings-header-spacer" />
      </header>

      <main className="settings-main">

        {/* MY SPACES */}
        <section className="settings-section">
          <div className="settings-section-head">
            <h2>My spaces</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New space
            </button>
          </div>
          <div className="settings-space-list">
            {spaces.length === 0 && <div className="settings-empty">No active spaces. Create one to get started.</div>}
            {spaces.map(s => (
              <SpaceRow
                key={s.id}
                space={s}
                isEditing={editingSpace === s.id}
                onEdit={() => setEditingSpace(s.id)}
                onCancelEdit={() => setEditingSpace(null)}
                onSaved={reload}
                onArchive={() => handleArchive(s)}
                onToggleVisibility={() => handleVisibility(s)}
              />
            ))}
          </div>
        </section>

        {/* QUICK CAPTURE TARGET */}
        <section className="settings-section">
          <div className="settings-section-head"><h2>Quick-capture target</h2></div>
          <p className="settings-hint">Where quick-captured tasks (Shift+N) are filed.</p>
          <div className="qc-target-row">
            <select
              className="form-input"
              value={prefs?.quick_capture_space_id || ''}
              onChange={e => handleQuickCapture(parseInt(e.target.value) || null)}
            >
              <option value="">— none —</option>
              {spaces.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </section>

        {/* APPEARANCE */}
        <section className="settings-section">
          <div className="settings-section-head"><h2>Appearance</h2></div>
          <div className="settings-row">
            <span>Theme</span>
            <button type="button" className="btn btn-ghost" onClick={onToggleTheme}>
              {theme === 'dark' ? '☀ Switch to light' : '☾ Switch to dark'}
            </button>
          </div>
        </section>

        {/* ARCHIVED SPACES */}
        {archived.length > 0 && (
          <section className="settings-section">
            <div className="settings-section-head"><h2>Archived spaces</h2></div>
            <div className="settings-space-list">
              {archived.map(s => (
                <div key={s.id} className="settings-space-row is-archived">
                  <SpaceIcon icon={s.icon} color={s.color} size={18} />
                  <span className="settings-space-name">{s.name}</span>
                  <div className="settings-space-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleUnarchive(s)}>Restore</button>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => handleHardDelete(s)} title="Delete permanently">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RE-RUN ONBOARDING */}
        <section className="settings-section">
          <div className="settings-section-head"><h2>Onboarding</h2></div>
          <div className="settings-row">
            <span>Walk through the setup wizard again</span>
            <button type="button" className="btn btn-ghost" onClick={handleRestartOnboarding}>
              <RefreshCw size={14} /> Re-run onboarding
            </button>
          </div>
          <div className="settings-row">
            <span>Take Kaseki's tour again</span>
            <button type="button" className="btn btn-ghost" onClick={handleReplayTour}>
              <RefreshCw size={14} /> Replay tour
            </button>
          </div>
        </section>

        {/* DANGER ZONE */}
        <section className="settings-section settings-danger">
          <div className="settings-section-head">
            <h2><AlertTriangle size={16} /> Danger zone</h2>
          </div>
          {!confirmDanger ? (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDanger(true)}>
              Delete all my data
            </button>
          ) : (
            <div className="danger-confirm">
              <p>This will permanently delete every space, task, todo, event, note, tag, saved view, and template. Your login account stays. This cannot be undone.</p>
              <p>Type <strong>DELETE EVERYTHING</strong> below to confirm:</p>
              <input
                type="text"
                className="form-input"
                value={dangerText}
                onChange={e => setDangerText(e.target.value)}
                placeholder="DELETE EVERYTHING"
              />
              <div className="danger-actions">
                <button type="button" className="btn btn-ghost" onClick={() => { setConfirmDanger(false); setDangerText(''); }} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger" onClick={handleWipeAllData} disabled={dangerText !== 'DELETE EVERYTHING' || busy}>
                  {busy ? 'Wiping…' : 'Yes, delete everything'}
                </button>
              </div>
            </div>
          )}
        </section>

      </main>

      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reload}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SpaceRow — inline editor for a single space
// ─────────────────────────────────────────────────────────────────────────
function SpaceRow({ space, isEditing, onEdit, onCancelEdit, onSaved, onArchive, onToggleVisibility }) {
  const [name, setName] = useState(space.name);
  const [icon, setIcon] = useState(space.icon);
  const [color, setColor] = useState(space.color);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!isEditing) {
      setName(space.name); setIcon(space.icon); setColor(space.color); setErr('');
    }
  }, [isEditing, space]);

  const save = async () => {
    if (!name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    try {
      await api.updateSpace(space.id, { name: name.trim(), icon, color });
      setSaving(false);
      onCancelEdit?.();
      onSaved?.();
    } catch (e) {
      setErr(e.message || 'Failed');
      setSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="settings-space-row">
        <SpaceIcon icon={space.icon} color={space.color} size={18} />
        <span className="settings-space-name">{space.name}</span>
        {!space.visible && <span className="settings-space-badge">Hidden</span>}
        <div className="settings-space-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} title="Edit">
            <Pencil size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleVisibility} title={space.visible ? 'Hide from landing page' : 'Show on landing page'}>
            {space.visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onArchive} title="Archive">
            <Archive size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-space-row is-editing">
      <div className="form-block">
        <label className="form-label">Name</label>
        <input className="form-input" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      </div>
      <div className="form-block">
        <label className="form-label">Colour</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="form-block">
        <label className="form-label">Icon</label>
        <IconPicker value={icon} onChange={setIcon} accent={color} />
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="settings-space-edit-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancelEdit} disabled={saving}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
