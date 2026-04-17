import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useToast } from './ToastContext';
import { parseNaturalDate } from '../lib/naturalDate';

export default function QuickCapture({ open, onClose, onCaptured }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setPreview(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!title.trim()) { setPreview(null); return; }
    const p = parseNaturalDate(title);
    setPreview(p);
  }, [title]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = preview
        ? { title: preview.cleanTitle, due_date: preview.dueDate, due_time: preview.dueTime }
        : { title: trimmed };
      const d = await api.quickCapture(payload);
      toast.show({ message: 'Captured to Inbox', type: 'success' });
      onCaptured && onCaptured(d.task);
      onClose();
    } catch (e) {
      toast.show({ message: e.message, type: 'error' });
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
          <span className="qc-inbox">→ Inbox</span>
        </div>
        <input
          ref={inputRef}
          className="qc-input"
          placeholder="What needs doing? e.g. 'Call mum tomorrow 3pm'"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
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
          <button className="qc-save" disabled={!title.trim() || saving} onClick={submit}>
            {saving ? 'Saving…' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}
