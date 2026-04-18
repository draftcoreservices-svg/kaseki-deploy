import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useToast } from './ToastContext';
import { parseNaturalDate } from '../lib/naturalDate';
import SpaceIcon from './SpaceIcon';

// Phase 2C: quick capture goes into user_preferences.quick_capture_space_id
// on the backend. If that's unset, the backend returns an error and we
// direct the user to Settings.
export default function QuickCapture({ open, onClose, onCaptured, onOpenSettings }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [targetSpace, setTargetSpace] = useState(null);
  const [targetError, setTargetError] = useState(null);
  const inputRef = useRef(null);

  // Resolve which space this capture is going to whenever we open.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setPreview(null);
    setTargetError(null);
    setTargetSpace(null);

    (async () => {
      try {
        const prefs = await api.getPreferences();
        const targetId = prefs.preferences?.quick_capture_space_id;
        if (!targetId) {
          setTargetError('no_target');
          return;
        }
        // Find the space details from the spaces list.
        const spacesResp = await api.getSpaces();
        const found = (spacesResp.spaces || []).find(s => s.id === targetId);
        if (!found) {
          setTargetError('target_missing');
        } else {
          setTargetSpace(found);
        }
      } catch {
        setTargetError('load_failed');
      }
    })();

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!title.trim()) { setPreview(null); return; }
    const p = parseNaturalDate(title);
    setPreview(p);
  }, [title]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (targetError || !targetSpace) {
      toast.show({ message: 'No quick capture target configured. Open Settings to pick one.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = preview
        ? { title: preview.cleanTitle, due_date: preview.dueDate, due_time: preview.dueTime }
        : { title: trimmed };
      const d = await api.quickCapture(payload);
      toast.show({ message: `Captured to ${targetSpace.name}`, type: 'success' });
      onCaptured && onCaptured(d.task);
      onClose();
    } catch (e) {
      // Backend returns a 'no_quick_capture_space' / 'stale_quick_capture_space'
      // code with error strings that mention "quick capture".
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('quick capture')) {
        setTargetError('no_target');
        setTargetSpace(null);
        toast.show({ message: 'Quick capture target missing. Open Settings.', type: 'error' });
      } else {
        toast.show({ message: e.message, type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  if (!open) return null;

  return (
    <div className="qc-overlay" onClick={onClose}>
      <div className="qc-modal" onClick={e => e.stopPropagation()}>
        <div className="qc-header">
          <span className="qc-icon">⚡</span>
          <span className="qc-title">Quick Capture</span>
          {targetSpace ? (
            <span
              className="qc-target-pill"
              style={{
                background: targetSpace.color + '22',
                color: targetSpace.color,
              }}
            >
              <SpaceIcon icon={targetSpace.icon} color={targetSpace.color} size={12} />
              {targetSpace.name}
            </span>
          ) : targetError ? (
            <span className="qc-target-none">
              No target configured
              {onOpenSettings && <> · <button type="button" onClick={() => { onClose(); onOpenSettings(); }} style={{ color: '#f87171', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}>Open Settings</button></>}
            </span>
          ) : (
            <span className="qc-target-pill" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>Loading…</span>
          )}
        </div>
        <input
          ref={inputRef}
          className="qc-input"
          placeholder="What needs doing? e.g. 'Call mum tomorrow 3pm'"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving || !!targetError}
        />
        {preview && (
          <div className="qc-preview">
            <span className="qc-preview-label">Parsed:</span>
            <span className="qc-preview-task">{preview.cleanTitle}</span>
            {preview.dueDate && <span className="qc-preview-pill">📅 {preview.dueDate}</span>}
            {preview.dueTime && <span className="qc-preview-pill">⏰ {preview.dueTime}</span>}
          </div>
        )}
        <div className="qc-footer">
          <span className="qc-hint">
            <span className="qc-kbd">↵</span> capture · <span className="qc-kbd">Esc</span> cancel
          </span>
          <button className="qc-save" disabled={!title.trim() || saving || !!targetError} onClick={submit}>
            {saving ? 'Saving…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}
