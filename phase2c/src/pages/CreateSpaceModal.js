import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import IconPicker from '../components/IconPicker';
import ColorPicker from '../components/ColorPicker';
import SpaceIcon from '../components/SpaceIcon';
import api from '../api';

export default function CreateSpaceModal({ open, onClose, onCreated, initialPreset = null }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('sparkles');
  const [color, setColor] = useState('#64748B');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState([]);
  const [pickedPreset, setPickedPreset] = useState(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Reset state on open.
    setError('');
    setSaving(false);
    setPickedPreset(initialPreset);
    if (initialPreset) {
      // Will be filled in once presets load.
    } else {
      setName('');
      setIcon('sparkles');
      setColor('#64748B');
    }
    // Load presets.
    api.getOnboardingPresets()
      .then(d => {
        setPresets(d.presets || []);
        if (initialPreset) {
          const p = (d.presets || []).find(x => x.preset === initialPreset);
          if (p) {
            setName(p.name);
            setIcon(p.icon);
            setColor(p.color);
          }
        }
      })
      .catch(() => {});
    // Focus name input.
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, initialPreset]);

  const handlePickPreset = (p) => {
    setPickedPreset(p.preset);
    setName(p.name);
    setIcon(p.icon);
    setColor(p.color);
  };

  const handleStartBlank = () => {
    setPickedPreset(null);
    setName('');
    setIcon('sparkles');
    setColor('#64748B');
    setTimeout(() => nameRef.current?.focus(), 10);
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) { setError('Name required'); return; }
    setError('');
    setSaving(true);
    try {
      const { space } = await api.createSpace({ name: name.trim(), icon, color, preset: pickedPreset });
      setSaving(false);
      onCreated?.(space);
      onClose?.();
    } catch (err) {
      setSaving(false);
      setError(err.message || 'Failed to create space');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card create-space-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New space</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="form-block">
            <label className="form-label">Start from a preset (optional)</label>
            <div className="preset-chip-row">
              <button
                type="button"
                className={`preset-chip ${!pickedPreset ? 'is-selected' : ''}`}
                onClick={handleStartBlank}
              >
                Blank
              </button>
              {presets.map(p => (
                <button
                  key={p.preset}
                  type="button"
                  className={`preset-chip ${pickedPreset === p.preset ? 'is-selected' : ''}`}
                  onClick={() => handlePickPreset(p)}
                >
                  <SpaceIcon icon={p.icon} color={p.color} size={14} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-block">
            <label className="form-label" htmlFor="csm-name">Name</label>
            <input
              id="csm-name"
              ref={nameRef}
              className="form-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Freelance, Rental property"
              maxLength={80}
            />
          </div>

          <div className="form-block">
            <label className="form-label">Colour</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="form-block">
            <label className="form-label">Icon</label>
            <IconPicker value={icon} onChange={setIcon} accent={color} />
          </div>

          <div className="form-block">
            <label className="form-label">Preview</label>
            <div className="space-preview-row">
              <SpaceIcon icon={icon} color={color} size={22} />
              <span className="space-preview-name">{name || 'Untitled space'}</span>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating…' : 'Create space'}
          </button>
        </div>
      </div>
    </div>
  );
}
