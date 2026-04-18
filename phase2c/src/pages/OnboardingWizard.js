import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, GripVertical, Eye, EyeOff } from 'lucide-react';
import api from '../api';
import SpaceIcon from '../components/SpaceIcon';
import IconPicker, { ICON_SET } from '../components/IconPicker';
import ColorPicker, { COLOR_SET } from '../components/ColorPicker';

// Wizard screens:
// 1. Welcome
// 2. Pick presets (multi-select grid)
// 3. Customise (for each picked preset: optional rename, icon swap, colour swap)
// 4. Order (drag to reorder the chosen spaces)
// 5. Quick capture target (pick one)
// 6. Confirm + create

export default function OnboardingWizard({ user, onComplete, theme, onToggleTheme }) {
  const [step, setStep] = useState(1);
  const [presets, setPresets] = useState([]); // server-supplied preset list
  const [selected, setSelected] = useState({}); // { presetId: true }
  const [draft, setDraft] = useState({}); // { presetId: { name, icon, color, visible } }
  const [order, setOrder] = useState([]); // [presetId, ...]
  const [quickTarget, setQuickTarget] = useState(null); // presetId
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOnboardingPresets()
      .then(d => {
        setPresets(d.presets || []);
        // Default-select Personal.
        const personal = (d.presets || []).find(p => p.preset === 'personal');
        if (personal) {
          setSelected({ personal: true });
          setDraft({ personal: { name: personal.name, icon: personal.icon, color: personal.color, visible: 1 } });
          setOrder(['personal']);
          setQuickTarget('personal');
        }
      })
      .catch(err => setError(err.message || 'Failed to load presets'));
  }, []);

  // Keep draft and order in sync when selection changes.
  useEffect(() => {
    const picked = Object.keys(selected).filter(k => selected[k]);
    // Add newly-picked
    const nextDraft = { ...draft };
    for (const id of picked) {
      if (!nextDraft[id]) {
        const p = presets.find(x => x.preset === id);
        if (p) nextDraft[id] = { name: p.name, icon: p.icon, color: p.color, visible: 1 };
      }
    }
    // Remove de-selected
    for (const id of Object.keys(nextDraft)) {
      if (!picked.includes(id)) delete nextDraft[id];
    }
    setDraft(nextDraft);

    // Rebuild order preserving existing order, appending new ones at the end.
    const nextOrder = order.filter(id => picked.includes(id));
    for (const id of picked) {
      if (!nextOrder.includes(id)) nextOrder.push(id);
    }
    setOrder(nextOrder);

    // Quick target: clear if deselected.
    if (quickTarget && !picked.includes(quickTarget)) {
      setQuickTarget(picked[0] || null);
    } else if (!quickTarget && picked.length > 0) {
      setQuickTarget(picked[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, presets]);

  const pickedIds = order; // order already filtered to picked
  const canAdvance = {
    1: true,
    2: pickedIds.length > 0,
    3: true,
    4: pickedIds.length > 0,
    5: quickTarget != null && pickedIds.includes(quickTarget),
    6: pickedIds.length > 0 && quickTarget != null,
  };

  const next = () => { setError(''); if (canAdvance[step]) setStep(s => Math.min(6, s + 1)); };
  const prev = () => { setError(''); setStep(s => Math.max(1, s - 1)); };

  const skipToDefaults = async () => {
    // Create only Personal, use it as quick capture target.
    setSaving(true); setError('');
    try {
      await api.runOnboarding({
        spaces: [{ preset: 'personal', name: 'Personal', icon: 'house', color: '#3B82F6', visible: 1 }],
        quick_capture_preset: 'personal',
      });
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Failed to skip');
      setSaving(false);
    }
  };

  const submit = async () => {
    if (pickedIds.length === 0) { setError('Pick at least one space'); return; }
    if (!quickTarget) { setError('Pick a quick capture target'); return; }
    setSaving(true); setError('');
    try {
      const spaces = pickedIds.map(id => ({
        preset: id,
        ...draft[id],
      }));
      await api.runOnboarding({ spaces, quick_capture_preset: quickTarget });
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="wizard-root">
      <header className="wizard-header">
        <div className="wizard-brand">Kaseki</div>
        <div className="wizard-progress">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <span key={n} className={`wizard-dot ${n === step ? 'is-active' : ''} ${n < step ? 'is-done' : ''}`} />
          ))}
        </div>
        <button type="button" className="wizard-theme-btn" onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <main className="wizard-main">
        {step === 1 && <WelcomeScreen user={user} onSkip={skipToDefaults} />}
        {step === 2 && <PresetsScreen presets={presets} selected={selected} onChange={setSelected} />}
        {step === 3 && <CustomiseScreen pickedIds={pickedIds} presets={presets} draft={draft} onChange={setDraft} />}
        {step === 4 && <OrderScreen pickedIds={pickedIds} draft={draft} setOrder={setOrder} />}
        {step === 5 && <QuickCaptureScreen pickedIds={pickedIds} draft={draft} value={quickTarget} onChange={setQuickTarget} />}
        {step === 6 && <ConfirmScreen pickedIds={pickedIds} draft={draft} quickTarget={quickTarget} />}
      </main>

      {error && <div className="wizard-error">{error}</div>}

      <footer className="wizard-footer">
        <button type="button" className="btn btn-ghost" onClick={prev} disabled={step === 1 || saving}>
          <ArrowLeft size={16} /> Back
        </button>
        {step === 1 && (
          <button type="button" className="btn btn-ghost" onClick={skipToDefaults} disabled={saving}>
            Skip (use Personal only)
          </button>
        )}
        {step < 6 && (
          <button type="button" className="btn btn-primary" onClick={next} disabled={!canAdvance[step] || saving}>
            Next <ArrowRight size={16} />
          </button>
        )}
        {step === 6 && (
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create my spaces'}
          </button>
        )}
      </footer>
    </div>
  );
}

// ── Screens ────────────────────────────────────────────────────────────────

function WelcomeScreen({ user }) {
  const greeting = user?.display_name || user?.username || 'there';
  return (
    <div className="wizard-screen">
      <h1 className="wizard-title">Hey {greeting} — welcome to Kaseki.</h1>
      <p className="wizard-lead">
        Kaseki is organised around <strong>spaces</strong>. Each space is a self-contained workspace for a part
        of your life — think "Personal", "Work", "Medical practice", "Side business". Tasks, todos, events, notes,
        and tags all live inside a space.
      </p>
      <p className="wizard-lead">
        Let's set yours up. This takes about a minute. You can change anything later in Settings.
      </p>
    </div>
  );
}

function PresetsScreen({ presets, selected, onChange }) {
  const toggle = (id) => onChange({ ...selected, [id]: !selected[id] });
  return (
    <div className="wizard-screen">
      <h2 className="wizard-subtitle">Pick the spaces you want</h2>
      <p className="wizard-hint">Tick any that apply. You can always add more or remove later. Pick at least one.</p>
      <div className="preset-grid">
        {presets.map(p => {
          const isOn = !!selected[p.preset];
          return (
            <button
              key={p.preset}
              type="button"
              className={`preset-card ${isOn ? 'is-selected' : ''}`}
              onClick={() => toggle(p.preset)}
              style={isOn ? { borderColor: p.color } : {}}
            >
              <div className="preset-card-head">
                <SpaceIcon icon={p.icon} color={p.color} size={22} />
                <span className="preset-card-name">{p.name}</span>
                {isOn && <span className="preset-card-check"><Check size={16} /></span>}
              </div>
              <div className="preset-card-desc">{p.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomiseScreen({ pickedIds, presets, draft, onChange }) {
  const [editing, setEditing] = useState(pickedIds[0] || null);
  useEffect(() => {
    if (!pickedIds.includes(editing) && pickedIds.length > 0) setEditing(pickedIds[0]);
  }, [pickedIds, editing]);

  if (pickedIds.length === 0) {
    return <div className="wizard-screen"><p>No spaces selected. Go back and pick some.</p></div>;
  }

  const update = (id, patch) => onChange({ ...draft, [id]: { ...draft[id], ...patch } });
  const current = editing ? draft[editing] : null;

  return (
    <div className="wizard-screen">
      <h2 className="wizard-subtitle">Customise your spaces</h2>
      <p className="wizard-hint">Optional — rename, recolour, or swap the icon of any space. Defaults are fine too.</p>

      <div className="customise-layout">
        <div className="customise-list">
          {pickedIds.map(id => {
            const d = draft[id];
            if (!d) return null;
            return (
              <button
                key={id}
                type="button"
                className={`customise-list-item ${editing === id ? 'is-active' : ''}`}
                onClick={() => setEditing(id)}
              >
                <SpaceIcon icon={d.icon} color={d.color} size={18} />
                <span className="customise-list-name">{d.name}</span>
              </button>
            );
          })}
        </div>

        {current && (
          <div className="customise-panel">
            <div className="form-block">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                type="text"
                value={current.name}
                onChange={e => update(editing, { name: e.target.value })}
                maxLength={80}
              />
            </div>
            <div className="form-block">
              <label className="form-label">Colour</label>
              <ColorPicker value={current.color} onChange={c => update(editing, { color: c })} />
            </div>
            <div className="form-block">
              <label className="form-label">Icon</label>
              <IconPicker value={current.icon} onChange={i => update(editing, { icon: i })} accent={current.color} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderScreen({ pickedIds, draft, setOrder }) {
  // Simple HTML5 drag-and-drop reorder. Keeps pickedIds as the source of truth
  // via setOrder in the parent.
  const dragging = useRef(null);

  const handleDragStart = (i) => { dragging.current = i; };
  const handleDragOver = (e, i) => {
    e.preventDefault();
    const from = dragging.current;
    if (from == null || from === i) return;
    const copy = [...pickedIds];
    const [moved] = copy.splice(from, 1);
    copy.splice(i, 0, moved);
    dragging.current = i;
    setOrder(copy);
  };

  const toggleVisible = (id, currentVisible) => {
    // This toggles a local flag. Parent-level state will reflect via draft update
    // through the wizard's onChange; but we don't have direct access here.
    // Instead we dispatch through the preset-list approach: parent wraps setOrder
    // and we emit a separate event — simplified by storing directly in draft later
    // if needed. For Deploy 1 we'll mark visibility via the chip click on the order.
    // (Wizard handles visibility via draft; we mutate draft here too if parent passed it.)
    // eslint-disable-next-line no-param-reassign
  };

  return (
    <div className="wizard-screen">
      <h2 className="wizard-subtitle">Arrange your landing page</h2>
      <p className="wizard-hint">Drag to reorder. This is the order the space cards will appear on your home screen.</p>
      <div className="order-list">
        {pickedIds.map((id, i) => {
          const d = draft[id];
          if (!d) return null;
          return (
            <div
              key={id}
              className="order-row"
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={() => { dragging.current = null; }}
            >
              <GripVertical size={18} className="order-grip" />
              <SpaceIcon icon={d.icon} color={d.color} size={20} />
              <span className="order-name">{d.name}</span>
              <span className="order-pos">#{i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuickCaptureScreen({ pickedIds, draft, value, onChange }) {
  return (
    <div className="wizard-screen">
      <h2 className="wizard-subtitle">Quick-capture target</h2>
      <p className="wizard-hint">
        Kaseki has a global "quick capture" (keyboard shortcut Shift+N) that drops a task into a chosen space without
        asking where. Pick which space receives quick-captured tasks. You can change this later.
      </p>
      <div className="qc-list">
        {pickedIds.map(id => {
          const d = draft[id];
          if (!d) return null;
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              className={`qc-row ${selected ? 'is-selected' : ''}`}
              onClick={() => onChange(id)}
              style={selected ? { borderColor: d.color } : {}}
            >
              <SpaceIcon icon={d.icon} color={d.color} size={22} />
              <span className="qc-name">{d.name}</span>
              {selected && <Check size={18} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmScreen({ pickedIds, draft, quickTarget }) {
  return (
    <div className="wizard-screen">
      <h2 className="wizard-subtitle">Ready?</h2>
      <p className="wizard-hint">Here's what we'll create. Go back to make changes, or hit "Create my spaces" to finish.</p>
      <div className="confirm-list">
        {pickedIds.map((id, i) => {
          const d = draft[id];
          if (!d) return null;
          return (
            <div key={id} className="confirm-row">
              <span className="confirm-pos">{i + 1}.</span>
              <SpaceIcon icon={d.icon} color={d.color} size={22} />
              <span className="confirm-name">{d.name}</span>
              {quickTarget === id && <span className="confirm-badge">Quick capture</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
