import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../api';
import { useToast } from '../components/ToastContext';
import KanbanView from '../components/KanbanView';
import MatrixView from '../components/MatrixView';
import CalendarView from '../components/CalendarView';
import ViewSwitcher from '../components/ViewSwitcher';
import SavedViewsMenu from '../components/SavedViewsMenu';
import { TemplateManager, TemplatePicker } from '../components/TemplateManager';
import TagManager from '../components/TagManager';
import FieldManager from '../components/FieldManager';
import CustomFieldInput from '../components/CustomFieldInput';
import SpaceIcon from '../components/SpaceIcon';
import DocumentViewer, { detectKind as detectFileKind } from '../components/DocumentViewer';
import ACTIVITY_ACTIONS from '../activity-actions';

// ─── Status / priority / tag colour constants (unchanged from Phase 2B) ───

const STATUS_LABELS = { to_start: 'To Start', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done' };
const STATUS_COLORS = { to_start: '#6b7280', in_progress: '#3b9eff', blocked: '#f87171', done: '#34d399' };
const PRIORITY_COLORS = { 1: '#6b7280', 2: '#60a5fa', 3: '#fbbf24', 4: '#f97316', 5: '#ef4444' };
const TAG_COLORS = {
  blue:   { bg: 'rgba(59,158,255,0.15)',  fg: '#60a5fa' },
  green:  { bg: 'rgba(52,211,153,0.15)',  fg: '#34d399' },
  red:    { bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  yellow: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
  purple: { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  pink:   { bg: 'rgba(244,114,182,0.15)', fg: '#f472b6' },
  orange: { bg: 'rgba(249,115,22,0.15)',  fg: '#fb923c' },
  gray:   { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' },
};
const TAG_COLOR_NAMES = Object.keys(TAG_COLORS);

function fmtDate(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function fmtDateTime(d) { if (!d) return ''; return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function isOverdue(d) { return d && d < todayStr(); }
function fileSize(b) { if (b < 1024) return b + 'B'; if (b < 1048576) return (b/1024).toFixed(1) + 'KB'; return (b/1048576).toFixed(1) + 'MB'; }

// Phase C — duration formatter. 0-59s => "Ns", <1h => "Nm", else "Hh Mm".
function fmtDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '0s';
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return s + 's';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}
// Live HH:MM:SS clock for a running timer.
function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return pad(h) + ':' + pad(m) + ':' + pad(sec);
}

// Compact one-line display of a custom field value for the task-list peek.
function formatPeek(f, v) {
  if (v == null || v === '') return '—';
  if (f.type === 'checkbox') return (v === '1' || v === 1) ? '✓' : '—';
  if (f.type === 'multi-select') {
    try { const a = JSON.parse(v); if (Array.isArray(a)) return a.join(', '); } catch {}
    return String(v);
  }
  if (f.type === 'date') { const dt = new Date(v); return isNaN(dt) ? String(v) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  if (f.type === 'datetime') { const dt = new Date(v); return isNaN(dt) ? String(v) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  if (f.type === 'currency') { const n = parseFloat(v); return Number.isFinite(n) ? `£${n.toFixed(2)}` : String(v); }
  const s = String(v);
  return s.length > 28 ? s.slice(0, 27) + '…' : s;
}

// ─── TagChip ───

function TagChip({ tag, onRemove }) {
  const c = TAG_COLORS[tag.color] || TAG_COLORS.blue;
  return (
    <span className="dash-tag" style={{ background: c.bg, color: c.fg }}>
      {tag.name}
      {onRemove && <button className="dash-tag-remove" onClick={(e) => { e.stopPropagation(); onRemove(tag); }} title="Remove tag">✕</button>}
    </span>
  );
}

// ─── Timeline — scrollable day strip ───

function Timeline({ space, tasks, events, selectedDate, onSelectDate }) {
  const [days, setDays] = useState([]);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const d = [];
    const base = new Date(); base.setDate(base.getDate() + offset - 15);
    for (let i = 0; i < 31; i++) {
      const dt = new Date(base); dt.setDate(dt.getDate() + i);
      const ds = dt.toISOString().split('T')[0];
      d.push({ date: dt, str: ds, hasTasks: tasks.some(t => t.due_date === ds), hasEvents: events.some(e => e.date === ds), isToday: ds === todayStr() });
    }
    setDays(d);
  }, [offset, tasks, events]);
  return (
    <div className="dash-timeline-wrapper">
      <button className="dash-timeline-nav" onClick={() => setOffset(o => o - 7)}>‹</button>
      <button className="dash-timeline-today" onClick={() => setOffset(0)}>Today</button>
      <div className="dash-timeline">
        {days.map(d => (
          <div key={d.str} className={`dash-tl-day${d.isToday ? ' dash-tl-day--current' : ''}${d.str === selectedDate ? ' dash-tl-day--current' : ''}${isOverdue(d.str) && d.hasTasks ? ' dash-tl-day--overdue' : ''}`} onClick={() => onSelectDate(d.str)}>
            <span className="dash-tl-weekday">{d.date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className="dash-tl-date">{d.date.getDate()}</span>
            <span className="dash-tl-month">{d.date.toLocaleDateString('en-GB', { month: 'short' })}</span>
            {(d.hasTasks || d.hasEvents) && <div className="dash-tl-dots">{d.hasTasks && <span className="dash-tl-dot dash-tl-dot--space" />}{d.hasEvents && <span className="dash-tl-dot dash-tl-dot--event" />}</div>}
          </div>
        ))}
      </div>
      <button className="dash-timeline-nav" onClick={() => setOffset(o => o + 7)}>›</button>
    </div>
  );
}

// ─── CreateTaskModal ───
// Note: Phase 2C — hardcoded case_reference/client_name/court_date fields are
// removed. They return in Deploy 2 as custom fields configurable per preset.

function CreateTaskModal({ space, onClose, onCreated, prefillTemplate }) {
  const toast = useToast();
  const [form, setForm] = useState(() => {
    const p = prefillTemplate || {};
    return {
      title: p.title || '',
      description: p.description || '',
      priority: p.priority || 3,
      due_date: '',
      status: 'to_start',
      goals: p.goals || '',
    };
  });
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState([]); // show_in_create fields for this space
  const [fieldDraft, setFieldDraft] = useState({});
  useEffect(() => {
    let cancelled = false;
    api.getSpaceFields(space.id)
      .then(d => {
        if (cancelled) return;
        const visible = (d.fields || []).filter(f => f.show_in_create || f.required);
        setFields(visible);
        const initial = {};
        for (const f of visible) initial[f.field_id || f.id] = '';
        setFieldDraft(initial);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [space.id]);
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title) return;
    // Client-side required-field check
    for (const f of fields) {
      if (f.required) {
        const v = fieldDraft[f.id];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
          toast.show({ message: `${f.label} is required`, type: 'error' });
          return;
        }
      }
    }
    setLoading(true);
    try {
      let created;
      if (prefillTemplate && prefillTemplate.id) {
        const d = await api.instantiateTemplate(prefillTemplate.id, {
          space_id: space.id,
          overrides: {
            title: form.title,
            description: form.description,
            priority: form.priority,
            goals: form.goals,
            due_date: form.due_date || undefined,
          },
        });
        created = d.task;
        if (form.status !== 'to_start') {
          try { await api.updateTask(created.id, { status: form.status }); } catch (e) {}
        }
      } else {
        const d = await api.createTask({ ...form, space_id: space.id });
        created = d.task;
      }
      // Save custom field values if any were filled in.
      const nonEmpty = Object.entries(fieldDraft).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));
      if (created && nonEmpty.length > 0) {
        try { await api.saveTaskFields(created.id, Object.fromEntries(nonEmpty)); }
        catch (e) { toast.show({ message: 'Task created but fields failed to save: ' + e.message, type: 'error' }); }
      }
      onCreated(created);
      toast.show({ message: prefillTemplate ? `Created from "${prefillTemplate.name}"` : 'Task created', type: 'success' });
      onClose();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
    setLoading(false);
  };
  return (
    <div className="dash-modal-overlay" onClick={onClose}><div className="dash-modal" onClick={e => e.stopPropagation()}>
      <h2>{prefillTemplate ? `📋 ${prefillTemplate.name}` : `New ${space.name} Task`}</h2>
      {prefillTemplate && (prefillTemplate.subtasks || []).length > 0 && (
        <div className="tmpl-modal-banner">
          Will auto-create {prefillTemplate.subtasks.length} subtask{prefillTemplate.subtasks.length > 1 ? 's' : ''}
        </div>
      )}
      <div className="dash-modal-field"><label>Title</label><input value={form.title} onChange={e => u('title', e.target.value)} autoFocus placeholder="Task name..." /></div>
      <div className="dash-modal-field"><label>Description</label><textarea rows={3} value={form.description} onChange={e => u('description', e.target.value)} placeholder="Details..." /></div>
      <div className="dash-modal-row">
        <div className="dash-modal-field"><label>Priority</label><select value={form.priority} onChange={e => u('priority', +e.target.value)}><option value={1}>1 - Lowest</option><option value={2}>2 - Low</option><option value={3}>3 - Medium</option><option value={4}>4 - High</option><option value={5}>5 - Critical</option></select></div>
        <div className="dash-modal-field"><label>Status</label><select value={form.status} onChange={e => u('status', e.target.value)}>{Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="dash-modal-field"><label>Due Date</label><input type="date" value={form.due_date} onChange={e => u('due_date', e.target.value)} /></div>
      <div className="dash-modal-field"><label>Goals</label><textarea rows={2} value={form.goals} onChange={e => u('goals', e.target.value)} placeholder="What does done look like?" /></div>
      {fields.length > 0 && (
        <div className="dash-modal-cf-section">
          <div className="dash-modal-cf-heading">{space.name} fields</div>
          <div className="cf-grid">
            {fields.map(f => (
              <div key={f.id} className="cf-row">
                {f.type !== 'checkbox' && <label className="cf-label">{f.label}{f.required ? ' *' : ''}</label>}
                <CustomFieldInput
                  field={f}
                  value={fieldDraft[f.id]}
                  onChange={(v) => setFieldDraft(d => ({ ...d, [f.id]: v }))}
                  editing={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={onClose}>Cancel</button><button className="dash-modal-save" disabled={loading || !form.title} onClick={submit}>{loading ? 'Creating...' : 'Create Task'}</button></div>
    </div></div>
  );
}

// ─── CreateTodoModal ───

function CreateTodoModal({ space, date, onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [intv, setIntv] = useState(1);
  const [unit, setUnit] = useState('days');
  const submit = async () => {
    if (!title) return;
    try {
      const d = await api.createTodo({
        space_id: space.id,
        title, date,
        is_recurring: recurring ? 1 : 0,
        recurrence_interval: recurring ? intv : null,
        recurrence_unit: recurring ? unit : null,
      });
      onCreated(d.todo);
      toast.show({ message: 'Todo added', type: 'success' });
      onClose();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  return (
    <div className="dash-modal-overlay" onClick={onClose}><div className="dash-modal dash-modal--small" onClick={e => e.stopPropagation()}>
      <h2>New Todo</h2>
      <div className="dash-modal-field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Todo item..." /></div>
      <div className="dash-modal-field--checkbox"><label><input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} /> Recurring</label></div>
      {recurring && <div className="dash-modal-row"><div className="dash-modal-field"><label>Every</label><input type="number" min={1} value={intv} onChange={e => setIntv(+e.target.value)} /></div><div className="dash-modal-field"><label>Unit</label><select value={unit} onChange={e => setUnit(e.target.value)}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></div></div>}
      <div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={onClose}>Cancel</button><button className="dash-modal-save" disabled={!title} onClick={submit}>Add Todo</button></div>
    </div></div>
  );
}

// ─── CreateEventModal ───

function CreateEventModal({ space, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', date: todayStr(), time: '' });
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title || !form.date) return;
    try {
      const d = await api.createEvent({ ...form, space_id: space.id });
      onCreated(d.event);
      toast.show({ message: 'Event added', type: 'success' });
      onClose();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  return (
    <div className="dash-modal-overlay" onClick={onClose}><div className="dash-modal dash-modal--small" onClick={e => e.stopPropagation()}>
      <h2>New Event</h2>
      <div className="dash-modal-field"><label>Title</label><input value={form.title} onChange={e => u('title', e.target.value)} autoFocus /></div>
      <div className="dash-modal-row"><div className="dash-modal-field"><label>Date</label><input type="date" value={form.date} onChange={e => u('date', e.target.value)} /></div><div className="dash-modal-field"><label>Time</label><input type="time" value={form.time} onChange={e => u('time', e.target.value)} /></div></div>
      <div className="dash-modal-field"><label>Description</label><textarea rows={2} value={form.description} onChange={e => u('description', e.target.value)} /></div>
      <div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={onClose}>Cancel</button><button className="dash-modal-save" disabled={!form.title} onClick={submit}>Add Event</button></div>
    </div></div>
  );
}

// ─── TagPicker ───

function TagPicker({ space, currentTags, availableTags, onAdd, onRemove, onCreateTag }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const currentIds = new Set(currentTags.map(t => t.id));
  const submitNew = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onCreateTag(trimmed, newColor);
    setNewName('');
  };
  return (
    <div className="dash-tag-picker">
      <div className="dash-tag-picker-title">Tags</div>
      {currentTags.length > 0 && (
        <div className="dash-tag-picker-list">
          {currentTags.map(t => <TagChip key={t.id} tag={t} onRemove={() => onRemove(t)} />)}
        </div>
      )}
      {availableTags.length > 0 && (
        <>
          <div className="dash-tag-picker-title" style={{ marginTop: 4 }}>Add existing</div>
          <div className="dash-tag-picker-list">
            {availableTags.filter(t => !currentIds.has(t.id)).map(t => {
              const c = TAG_COLORS[t.color] || TAG_COLORS.blue;
              return (
                <button key={t.id} className="dash-tag-picker-item" style={{ background: c.bg, color: c.fg }} onClick={() => onAdd(t)}>
                  {t.name}
                </button>
              );
            })}
            {availableTags.filter(t => !currentIds.has(t.id)).length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>All available tags are applied.</span>}
          </div>
        </>
      )}
      <div className="dash-tag-picker-title" style={{ marginTop: 4 }}>Create new</div>
      <div className="dash-tag-picker-new">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tag name" onKeyDown={e => e.key === 'Enter' && submitNew()} />
        <select value={newColor} onChange={e => setNewColor(e.target.value)}>
          {TAG_COLOR_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="dash-subtask-add-btn" disabled={!newName.trim()} onClick={submitNew}>Add</button>
      </div>
    </div>
  );
}

// ─── TaskDetail ───
// Phase 2C: hardcoded Work-only fields (case_reference, client_name, court_date) dropped.
// They come back in Deploy 2 as custom fields per space preset.

function TaskDetail({ taskId, space, onClose, onUpdated, availableTags, onTagsChanged, allTasks }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [newSub, setNewSub] = useState('');
  const [newNote, setNewNote] = useState('');
  const [customFields, setCustomFields] = useState([]); // array of field defs with current value
  const [customDraft, setCustomDraft] = useState({});   // { field_id: value } during edit
  const [viewerIdx, setViewerIdx] = useState(null);     // index into files[] when viewer open; null = closed
  // Phase C — timer state. activeStart is a Date when a timer is running for
  // THIS task, else null. tick just forces a re-render every second for the
  // live clock display; no real purpose beyond that.
  const [activeStart, setActiveStart] = useState(null);
  const [, setTick] = useState(0);
  // Phase C — dependency picker selected value (task id, as string).
  const [depPick, setDepPick] = useState('');
  // Phase C Batch 2 — Timeline "show edits" toggle. Default hidden.
  const [showEdits, setShowEdits] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try { const d = await api.getTask(taskId); setData(d); setForm(d.task); } catch (e) { console.error(e); }
  }, [taskId]);
  const loadFields = useCallback(async () => {
    try {
      const d = await api.getTaskFields(taskId);
      setCustomFields(d.fields || []);
      // Seed draft with current values — used only in edit mode.
      const draft = {};
      for (const f of (d.fields || [])) draft[f.field_id] = f.value;
      setCustomDraft(draft);
    } catch (e) { console.error('custom fields load failed', e); }
  }, [taskId]);
  useEffect(() => { load(); loadFields(); }, [load, loadFields]);

  // Phase C — restore active timer on mount. If the server reports an active
  // timer for THIS task, start ticking. If it's on a different task we leave
  // activeStart null; clicking Start here will stop the other one (per
  // backend's /time/start logic). LocalStorage is a belt-and-braces cache
  // so a fresh page load feels instant — the server call is the truth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem('kaseki-active-timer');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.task_id === taskId && parsed.started_at) {
              setActiveStart(new Date(parsed.started_at));
            }
          } catch (_) { localStorage.removeItem('kaseki-active-timer'); }
        }
        const r = await api.getActiveTimer();
        if (cancelled) return;
        if (r.entry && r.entry.task_id === taskId) {
          setActiveStart(new Date(r.entry.started_at));
          localStorage.setItem('kaseki-active-timer', JSON.stringify({
            task_id: taskId, started_at: r.entry.started_at,
          }));
        } else {
          // No active timer on this task (active could be elsewhere).
          setActiveStart(null);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.task_id === taskId) localStorage.removeItem('kaseki-active-timer');
            } catch (_) {}
          }
        }
      } catch (_) {
        // Server unreachable — leave whatever localStorage said in place.
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  // Phase C — tick once a second while a timer is active on this task.
  useEffect(() => {
    if (!activeStart) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeStart]);

  if (!data) return <div className="dash-detail-overlay" onClick={onClose}><div className="dash-detail" onClick={e => e.stopPropagation()}><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div></div></div>;
  const { task, subtasks, notes, files, activity } = data;
  const dependencies = data.dependencies || [];
  const dependents = data.dependents || [];
  const timeEntries = data.timeEntries || [];
  const totalSeconds = data.totalSeconds || 0;
  const currentTags = data.tags || task.tags || [];
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    try {
      const d = await api.updateTask(task.id, form);
      setData(p => ({ ...p, task: d.task, tags: d.task.tags || p.tags }));
      setForm(d.task);
      // Save custom field values in parallel. Empty/null values are treated as deletions server-side.
      if (customFields.length > 0) {
        try {
          await api.saveTaskFields(task.id, customDraft);
          await loadFields();
        } catch (e) { toast.show({ message: 'Custom fields: ' + e.message, type: 'error' }); }
      }
      setEditing(false);
      onUpdated();
      toast.show({ message: 'Task saved', type: 'success' });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const addSub = async () => {
    if (!newSub) return;
    try { await api.createSubtask(task.id, { title: newSub }); setNewSub(''); load(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const toggleSub = async (s) => {
    try { await api.updateSubtask(s.id, { completed: s.completed ? 0 : 1 }); load(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const delSub = async (s) => {
    try {
      await api.deleteSubtask(s.id);
      load();
      toast.show({
        message: `Subtask deleted: ${s.title}`,
        type: 'undo',
        undo: async () => {
          try { await api.createSubtask(task.id, { title: s.title }); load(); }
          catch (e) { toast.show({ message: e.message, type: 'error' }); }
        },
      });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const addNote = async () => {
    if (!newNote) return;
    try { await api.createTaskNote(task.id, { content: newNote }); setNewNote(''); load(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const uploadFile = async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    // Clear the input so selecting the same file(s) again still fires onChange.
    e.target.value = '';
    try {
      const res = await api.uploadFiles(task.id, fileList);
      load();
      const n = (res.files || []).length || fileList.length;
      toast.show({
        message: n === 1 ? 'File uploaded' : `${n} files uploaded`,
        type: 'success',
      });
    } catch (er) { toast.show({ message: er.message, type: 'error' }); }
  };
  const delFile = async (f) => {
    try { await api.deleteFile(f.id); load(); toast.show({ message: `File deleted: ${f.original_name}`, type: 'info' }); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  // ── Phase C handlers: dependencies + time tracking ────────────────────
  const addDep = async () => {
    if (!depPick) return;
    try {
      await api.addDependency(task.id, parseInt(depPick));
      setDepPick('');
      load();
      onUpdated();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const removeDep = async (dep) => {
    try {
      await api.removeDependency(task.id, dep.dep_id);
      load();
      onUpdated();
      toast.show({ message: `Removed dependency: ${dep.title}`, type: 'info' });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const startTimer = async () => {
    try {
      const r = await api.startTimer(task.id);
      setActiveStart(new Date(r.entry.started_at));
      localStorage.setItem('kaseki-active-timer', JSON.stringify({
        task_id: task.id, started_at: r.entry.started_at,
      }));
      if (r.stoppedPrevious) {
        toast.show({ message: `Previous timer stopped (${fmtDuration(r.stoppedPrevious.duration_seconds)})`, type: 'info' });
      } else {
        toast.show({ message: 'Timer started', type: 'success' });
      }
      load();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const stopTimer = async () => {
    try {
      const r = await api.stopTimer(task.id);
      setActiveStart(null);
      localStorage.removeItem('kaseki-active-timer');
      toast.show({ message: `Timer stopped: ${fmtDuration(r.entry.duration_seconds)}`, type: 'success' });
      load();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const delTimeEntry = async (entry) => {
    try {
      await api.deleteTimeEntry(entry.id);
      // If the user deleted the active entry, clear local state.
      if (entry.ended_at == null) {
        setActiveStart(null);
        localStorage.removeItem('kaseki-active-timer');
      }
      load();
      toast.show({ message: 'Time entry deleted', type: 'info' });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const addTag = async (tag) => {
    try { await api.addTaskTag(task.id, tag.id); load(); onUpdated(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const removeTag = async (tag) => {
    try { await api.removeTaskTag(task.id, tag.id); load(); onUpdated(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const createTag = async (name, color) => {
    try {
      const d = await api.createTag({ space_id: space.id, name, color });
      onTagsChanged();
      await api.addTaskTag(task.id, d.tag.id);
      load(); onUpdated();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const cSubs = subtasks.filter(s => s.completed).length;
  const pct = subtasks.length > 0 ? Math.round((cSubs / subtasks.length) * 100) : 0;

  return (
    <>
    <div className="dash-detail-overlay" onClick={onClose}><div className="dash-detail" onClick={e => e.stopPropagation()}>
      <div className="dash-detail-header">
        {editing ? <input className="dash-detail-title-input" value={form.title} onChange={e => u('title', e.target.value)} /> : <h2>{task.title}</h2>}
        <div className="dash-detail-actions">{editing ? <button className="dash-detail-save" onClick={save}>Save</button> : <button className="dash-detail-edit" onClick={() => setEditing(true)}>Edit</button>}<button className="dash-detail-close" onClick={onClose}>✕</button></div>
      </div>
      <div className="dash-detail-tabs">{['details','subtasks','notes','files','depends','time','timeline'].map(t => {
        const count = t==='subtasks'?subtasks.length:t==='files'?files.length:t==='depends'?(dependencies?.length || 0):t==='time'?(timeEntries?.length || 0):null;
        const label = t==='depends' ? 'Depends' : t.charAt(0).toUpperCase()+t.slice(1);
        return <button key={t} className={`dash-detail-tab${tab===t?' dash-detail-tab--active':''}`} onClick={()=>setTab(t)}>{label}{count!=null?` (${count})`:''}</button>;
      })}</div>
      <div className="dash-detail-body">
        {tab==='details'&&<>
          <div className="dash-detail-meta">
            <div className="dash-detail-meta-item"><label>Status</label>{editing?<select value={form.status} onChange={e=>u('status',e.target.value)}>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:<span style={{color:STATUS_COLORS[task.status]}}>{STATUS_LABELS[task.status]}</span>}</div>
            <div className="dash-detail-meta-item"><label>Priority</label>{editing?<select value={form.priority} onChange={e=>u('priority',+e.target.value)}>{[1,2,3,4,5].map(p=><option key={p} value={p}>{p}</option>)}</select>:<span><span className="dash-priority-dot" style={{background:PRIORITY_COLORS[task.priority],display:'inline-block',marginRight:6}}/>{task.priority}</span>}</div>
            <div className="dash-detail-meta-item"><label>Due Date</label>{editing?<input type="date" value={form.due_date||''} onChange={e=>u('due_date',e.target.value)}/>:<span className={isOverdue(task.due_date)?'dash-due-date--overdue':''}>{task.due_date?fmtDate(task.due_date):'—'}</span>}</div>
            <div className="dash-detail-meta-item"><label>Space</label><span className="dash-detail-space-badge"><SpaceIcon icon={space.icon} color={space.color} size={12} />{space.name}</span></div>
          </div>
          <div className="dash-detail-section"><h3>Description</h3>{editing?<textarea rows={4} value={form.description||''} onChange={e=>u('description',e.target.value)}/>:<div className="dash-detail-text">{task.description||'No description'}</div>}</div>
          <div className="dash-detail-section"><h3>Goals</h3>{editing?<textarea rows={3} value={form.goals||''} onChange={e=>u('goals',e.target.value)}/>:<div className="dash-detail-text">{task.goals||'No goals set'}</div>}</div>
          {customFields.length > 0 && (
            <div className="dash-detail-section">
              <h3>{space.name} fields</h3>
              <div className="cf-grid">
                {customFields.map(f => (
                  <div key={f.field_id} className="cf-row">
                    {f.type !== 'checkbox' && <label className="cf-label">{f.label}{f.required ? ' *' : ''}</label>}
                    <CustomFieldInput
                      field={f}
                      value={editing ? customDraft[f.field_id] : f.value}
                      onChange={(v) => setCustomDraft(d => ({ ...d, [f.field_id]: v }))}
                      editing={editing}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="dash-detail-section">
            <h3>Tags</h3>
            <TagPicker
              space={space}
              currentTags={currentTags}
              availableTags={availableTags}
              onAdd={addTag}
              onRemove={removeTag}
              onCreateTag={createTag}
            />
          </div>
          <div className="dash-detail-timestamp">Created: {fmtDateTime(task.created_at)} · Updated: {fmtDateTime(task.updated_at)}</div>
        </>}
        {tab==='subtasks'&&<>
          {subtasks.length>0&&<div className="dash-progress"><div className="dash-progress-bar" style={{width:pct+'%'}}/><span className="dash-progress-text">{pct}% ({cSubs}/{subtasks.length})</span></div>}
          <div className="dash-subtask-list">{subtasks.map(s=><div key={s.id} className={`dash-subtask-item${s.completed?' dash-subtask-item--done':''}`}><div className="dash-todo-check" onClick={()=>toggleSub(s)}>{s.completed?'✓':''}</div><span className="dash-subtask-text">{s.title}</span><button className="dash-subtask-delete" onClick={()=>delSub(s)}>✕</button></div>)}</div>
          <div className="dash-subtask-add"><input value={newSub} onChange={e=>setNewSub(e.target.value)} placeholder="Add subtask..." onKeyDown={e=>e.key==='Enter'&&addSub()}/><button className="dash-subtask-add-btn" disabled={!newSub} onClick={addSub}>Add</button></div>
        </>}
        {tab==='notes'&&<>
          <div className="dash-note-add"><textarea rows={3} value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Write a note..."/><button className="dash-subtask-add-btn" disabled={!newNote} onClick={addNote}>Add Note</button></div>
          <div className="dash-note-list">{notes.map(n=><div key={n.id} className="dash-note-item"><p>{n.content}</p><span className="dash-note-time">{fmtDateTime(n.created_at)}</span></div>)}{notes.length===0&&<div className="dash-empty-small">No notes yet</div>}</div>
        </>}
        {tab==='files'&&<>
          <button className="dash-file-upload-btn" onClick={()=>fileRef.current?.click()}>📎 Upload Files</button>
          <input ref={fileRef} type="file" multiple style={{display:'none'}} onChange={uploadFile}/>
          {files.length===0&&<div className="dash-empty-small">No files attached</div>}
          {(() => {
            // Phase C Batch 2 — split files into gallery (images) and list
            // (everything else). Both use the same files[] indices so clicks
            // still open DocumentViewer at the correct position — the viewer's
            // sidebar shows every file regardless of kind.
            const imageItems = files
              .map((f, i) => ({ f, i, kind: detectFileKind(f) }))
              .filter(x => x.kind === 'image');
            const otherItems = files
              .map((f, i) => ({ f, i, kind: detectFileKind(f) }))
              .filter(x => x.kind !== 'image');
            return (
              <>
                {imageItems.length > 0 && (
                  <div className="dash-file-gallery">
                    {imageItems.map(({ f, i }) => (
                      <button
                        key={f.id}
                        className="dash-file-gallery-item"
                        onClick={() => setViewerIdx(i)}
                        title={f.original_name}
                      >
                        <img src={`/uploads/${f.filename}`} alt={f.original_name} loading="lazy" />
                        <span className="dash-file-gallery-caption">{f.original_name}</span>
                        {/* Hover-revealed actions. stopPropagation prevents
                            the parent button from firing setViewerIdx when
                            the user clicks an action. */}
                        <a
                          className="dash-file-gallery-action dash-file-gallery-action--dl"
                          href={`/uploads/${f.filename}`}
                          download={f.original_name}
                          title="Download"
                          onClick={(e) => e.stopPropagation()}
                        >⬇</a>
                        <span
                          role="button"
                          tabIndex={0}
                          className="dash-file-gallery-action dash-file-gallery-action--del"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); delFile(f); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); delFile(f); } }}
                        >✕</span>
                      </button>
                    ))}
                  </div>
                )}
                {otherItems.length > 0 && (
                  <div className="dash-file-list">
                    {otherItems.map(({ f, i, kind }) => {
                      const canPreview = kind !== 'unsupported';
                      return (
                        <div key={f.id} className="dash-file-item">
                          <span className="dash-file-icon">📄</span>
                          <div className="dash-file-info">
                            {canPreview ? (
                              <button
                                className="dash-file-name dash-file-name--button"
                                onClick={() => setViewerIdx(i)}
                                title="Open in viewer"
                              >
                                {f.original_name}
                              </button>
                            ) : (
                              <a className="dash-file-name" href={`/uploads/${f.filename}`} target="_blank" rel="noreferrer">
                                {f.original_name}
                              </a>
                            )}
                            <span className="dash-file-meta">{fileSize(f.size)} · {fmtDateTime(f.created_at)}</span>
                          </div>
                          {canPreview && (
                            <button className="dash-file-view" onClick={() => setViewerIdx(i)} title="View">👁</button>
                          )}
                          <a
                            className="dash-file-download"
                            href={`/uploads/${f.filename}`}
                            download={f.original_name}
                            title="Download"
                          >⬇</a>
                          <button className="dash-file-delete" onClick={()=>delFile(f)}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </>}
        {tab==='depends'&&<>
          {/* Phase C — Dependencies: tasks this one waits on */}
          <div className="dash-detail-section">
            <h3>This task depends on</h3>
            {dependencies.length === 0 && <div className="dash-empty-small">No dependencies. This task can be completed anytime.</div>}
            {dependencies.length > 0 && (
              <div className="dash-dep-list">
                {dependencies.map(d => (
                  <div key={d.dep_id} className={`dash-dep-item${d.status !== 'done' ? ' dash-dep-item--blocking' : ''}`}>
                    <span className="dash-dep-status-dot" style={{ background: STATUS_COLORS[d.status] }} />
                    <span className="dash-dep-title">{d.title}</span>
                    <span className="dash-dep-status">{STATUS_LABELS[d.status]}</span>
                    <button className="dash-dep-remove" onClick={() => removeDep(d)} title="Remove dependency">✕</button>
                  </div>
                ))}
              </div>
            )}
            {(() => {
              // Picker options: other active tasks in the same space, not already a dep.
              const excludedIds = new Set([task.id, ...dependencies.map(d => d.id)]);
              const candidates = (allTasks || []).filter(t => !excludedIds.has(t.id) && !t.archived);
              if (candidates.length === 0) return null;
              return (
                <div className="dash-dep-add">
                  <select value={depPick} onChange={e => setDepPick(e.target.value)}>
                    <option value="">Add dependency…</option>
                    {candidates.map(c => (
                      <option key={c.id} value={c.id}>{c.title} {c.status === 'done' ? '(done)' : ''}</option>
                    ))}
                  </select>
                  <button className="dash-subtask-add-btn" disabled={!depPick} onClick={addDep}>Add</button>
                </div>
              );
            })()}
          </div>
          {dependents.length > 0 && (
            <div className="dash-detail-section">
              <h3>Tasks waiting on this one</h3>
              <div className="dash-dep-list">
                {dependents.map(d => (
                  <div key={d.id} className="dash-dep-item dash-dep-item--incoming">
                    <span className="dash-dep-status-dot" style={{ background: STATUS_COLORS[d.status] }} />
                    <span className="dash-dep-title">{d.title}</span>
                    <span className="dash-dep-status">{STATUS_LABELS[d.status]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>}
        {tab==='time'&&<>
          {/* Phase C — Time tracking: stopwatch + session history */}
          <div className="dash-detail-section">
            <div className="dash-timer-main">
              {activeStart ? (
                <>
                  <div className="dash-timer-clock dash-timer-clock--running">
                    {fmtClock((Date.now() - activeStart.getTime()) / 1000)}
                  </div>
                  <button className="dash-timer-btn dash-timer-btn--stop" onClick={stopTimer}>⏸ Stop Timer</button>
                </>
              ) : (
                <>
                  <div className="dash-timer-clock">{fmtDuration(totalSeconds)}</div>
                  <button className="dash-timer-btn dash-timer-btn--start" onClick={startTimer}>▶ Start Timer</button>
                </>
              )}
              <div className="dash-timer-total">Total logged: <strong>{fmtDuration(totalSeconds)}</strong></div>
            </div>
          </div>
          <div className="dash-detail-section">
            <h3>Sessions</h3>
            {timeEntries.length === 0 && <div className="dash-empty-small">No sessions logged yet.</div>}
            {timeEntries.length > 0 && (
              <div className="dash-timer-list">
                {timeEntries.map(e => (
                  <div key={e.id} className={`dash-timer-entry${e.ended_at == null ? ' dash-timer-entry--active' : ''}`}>
                    <div className="dash-timer-entry-main">
                      <span className="dash-timer-entry-date">{fmtDateTime(e.started_at)}</span>
                      <span className="dash-timer-entry-dur">
                        {e.ended_at == null
                          ? <em>running…</em>
                          : fmtDuration(e.duration_seconds)}
                      </span>
                    </div>
                    <button className="dash-timer-entry-del" onClick={() => delTimeEntry(e)} title="Delete entry">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>}
        {tab==='timeline'&&(() => {
          // Phase C Batch 2 — Timeline: chronological merge of notable things
          // that happened on this task. Activity log is filtered: high-signal
          // entries (status changes, completions, file uploads, timer events,
          // notes, deps, tags, moves) always show; low-signal entries (title
          // edits, priority tweaks, pin toggles, subtask add/remove) only
          // show when Show edits is toggled on.
          //
          // Sources merged: activity_log, task_notes (full content), task_files
          // (upload events), time_entries (stop events with duration). All tagged
          // with a `kind` so the renderer can pick an icon + style.
          //
          // Classification is read from the shared activity-actions.json file,
          // which the backend also consults. Unknown actions (not in the JSON)
          // are hidden from the Timeline entirely — adding a new logActivity
          // call in a future feature requires adding it to the JSON first or
          // it won't show up here.
          const merged = [];
          for (const a of activity) {
            const entry = ACTIVITY_ACTIONS[a.action];
            if (!entry) continue; // unknown action — skip
            const kind = entry.kind; // 'signal' | 'edit'
            merged.push({
              id: 'a' + a.id, at: a.created_at, kind,
              action: a.action, text: a.details,
            });
          }
          // Notes: show the content inline, not just "note added".
          for (const n of notes) {
            merged.push({ id: 'n' + n.id, at: n.created_at, kind: 'note', text: n.content });
          }
          // Sort newest first.
          merged.sort((x, y) => String(y.at).localeCompare(String(x.at)));
          const visible = showEdits ? merged : merged.filter(m => m.kind !== 'edit');
          const editCount = merged.filter(m => m.kind === 'edit').length;

          const ICONS = {
            created: '✨', status_changed: '🔄', archived: '🗂️', unarchived: '📤',
            moved: '→', file_uploaded: '📎', file_deleted: '🗑️', note_added: '📝',
            time_started: '▶', time_stopped: '⏸',
            dependency_added: '🔗', dependency_removed: '✂️',
            tagged: '🏷️', untagged: '🏷️',
            deleted: '🗑️', undeleted: '↩️', subtask_completed: '✅',
            edited: '✏️', pinned: '📌', unpinned: '📌',
            subtask_added: '➕', subtask_uncompleted: '◻', subtask_removed: '➖',
          };

          // Group by date (YYYY-MM-DD) for visual separators.
          const groups = [];
          let currentDateKey = null;
          for (const item of visible) {
            const dk = String(item.at).slice(0, 10);
            if (dk !== currentDateKey) {
              groups.push({ dateKey: dk, items: [] });
              currentDateKey = dk;
            }
            groups[groups.length - 1].items.push(item);
          }

          const dateHeader = (dk) => {
            const d = new Date(dk + 'T00:00:00');
            const today = todayStr();
            const yesterday = (() => { const y = new Date(); y.setDate(y.getDate() - 1); return y.toISOString().slice(0, 10); })();
            if (dk === today) return 'Today';
            if (dk === yesterday) return 'Yesterday';
            return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          };

          return (
            <div className="dash-timeline">
              {editCount > 0 && (
                <div className="dash-timeline-controls">
                  <label className="dash-timeline-toggle">
                    <input type="checkbox" checked={showEdits} onChange={e => setShowEdits(e.target.checked)} />
                    Show edits ({editCount})
                  </label>
                </div>
              )}
              {visible.length === 0 && <div className="dash-empty-small">No activity on this task yet</div>}
              {groups.map(g => (
                <div key={g.dateKey} className="dash-timeline-group">
                  <div className="dash-timeline-date">{dateHeader(g.dateKey)}</div>
                  {g.items.map(item => (
                    <div key={item.id} className={`dash-timeline-item dash-timeline-item--${item.kind}`}>
                      <span className="dash-timeline-icon">{
                        item.kind === 'note' ? '📝' : (ICONS[item.action] || '•')
                      }</span>
                      <div className="dash-timeline-content">
                        <div className="dash-timeline-text">{item.text || (item.kind === 'note' ? '(empty note)' : '')}</div>
                        <div className="dash-timeline-time">{new Date(item.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div></div>
    {viewerIdx !== null && (
      <DocumentViewer
        files={files}
        initialIndex={viewerIdx}
        onClose={() => setViewerIdx(null)}
      />
    )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard — the main view for a single space
// ═══════════════════════════════════════════════════════════════════════════

export default function Dashboard({ space, onBack, theme, onToggleTheme, pendingOpenTask, onPendingHandled, onOpenPomodoro, onOpenHelp }) {
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [todos, setTodos] = useState([]);
  const [events, setEvents] = useState([]);
  const [sNotes, setSNotes] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fPri, setFPri] = useState('all');
  const [fTag, setFTag] = useState('all');
  const [showArch, setShowArch] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [tagMgrOpen, setTagMgrOpen] = useState(false);
  const [fieldMgrOpen, setFieldMgrOpen] = useState(false);
  const [spaceFields, setSpaceFields] = useState([]); // field defs for the space — used by list peek + create modal
  const [taskFieldValues, setTaskFieldValues] = useState({}); // { taskId: { fieldId: value } } cache for list peek
  const [selDate, setSelDate] = useState(todayStr());
  const [modal, setModal] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [review, setReview] = useState(null);
  const [now, setNow] = useState(new Date());
  const [availableTags, setAvailableTags] = useState([]);
  const [bulkSel, setBulkSel] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const nRef = useRef(null);
  const csvRef = useRef(null);

  // Inline CSS vars so every child element can use var(--space-accent).
  const rootStyle = {
    '--space-accent': space.color,
    '--space-accent-bg': space.color + '22',
  };

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const loadT = useCallback(async () => {
    try { const d = showArch ? await api.getArchivedTasks(space.id) : await api.getTasks(space.id); setTasks(d.tasks); }
    catch (e) {}
  }, [space.id, showArch]);
  const loadTd = useCallback(async () => {
    try { const d = await api.getTodos(space.id, selDate); setTodos(d.todos); } catch (e) {}
  }, [space.id, selDate]);
  const loadEv = useCallback(async () => {
    try { const d = await api.getEvents(space.id); setEvents(d.events); } catch (e) {}
  }, [space.id]);
  const loadN = useCallback(async () => {
    try { const d = await api.getNotes(space.id); setSNotes(d.note?.content || ''); } catch (e) {}
  }, [space.id]);
  const loadTags = useCallback(async () => {
    try { const d = await api.getTags(space.id); setAvailableTags(d.tags || []); } catch (e) {}
  }, [space.id]);
  const loadSpaceFields = useCallback(async () => {
    try { const d = await api.getSpaceFields(space.id); setSpaceFields(d.fields || []); }
    catch (e) { setSpaceFields([]); }
  }, [space.id]);

  useEffect(() => { loadT(); }, [loadT]);
  useEffect(() => { loadTd(); }, [loadTd]);
  useEffect(() => { loadEv(); }, [loadEv]);
  useEffect(() => { loadN(); }, [loadN]);
  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { loadSpaceFields(); }, [loadSpaceFields]);
  useEffect(() => { setBulkSel(new Set()); }, [space.id, showArch]);

  // Load peek values for all tasks when either tasks or field defs change.
  // Skips entirely if no fields are flagged show_in_list — zero cost path.
  useEffect(() => {
    const peekFieldIds = spaceFields.filter(f => f.show_in_list).map(f => f.id);
    if (peekFieldIds.length === 0 || tasks.length === 0) {
      setTaskFieldValues({});
      return;
    }
    // Batch load: one call per task (simple and fine at household scale).
    // In practice most spaces will have <50 visible tasks.
    let cancelled = false;
    (async () => {
      const map = {};
      for (const t of tasks) {
        try {
          const d = await api.getTaskFields(t.id);
          map[t.id] = {};
          for (const f of (d.fields || [])) {
            if (peekFieldIds.includes(f.field_id) && f.value != null && f.value !== '') {
              map[t.id][f.field_id] = f.value;
            }
          }
        } catch (e) { /* silent */ }
        if (cancelled) return;
      }
      if (!cancelled) setTaskFieldValues(map);
    })();
    return () => { cancelled = true; };
  }, [tasks, spaceFields]);

  // Load default view preference once on mount
  useEffect(() => {
    api.getPreferences()
      .then(d => {
        const v = d.preferences?.default_view;
        if (v && ['list', 'board', 'matrix', 'calendar'].includes(v)) setViewMode(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (pendingOpenTask) {
      setDetailId(pendingOpenTask);
      onPendingHandled && onPendingHandled();
    }
  }, [pendingOpenTask, onPendingHandled]);

  const saveN = (c) => {
    setSNotes(c);
    clearTimeout(nRef.current);
    nRef.current = setTimeout(() => { api.saveNotes({ space_id: space.id, content: c }).catch(() => {}); }, 800);
  };

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (fStatus !== 'all' && t.status !== fStatus) return false;
      if (fPri !== 'all' && t.priority !== +fPri) return false;
      if (fTag !== 'all') {
        const ids = (t.tags || []).map(x => x.id);
        if (!ids.includes(+fTag)) return false;
      }
      return true;
    });
  }, [tasks, search, fStatus, fPri, fTag]);

  const total = tasks.length;
  const doneC = tasks.filter(t => t.status === 'done').length;
  const overdueC = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'done').length;

  const handleCtx = (e, task) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, task }); };
  useEffect(() => { const h = () => { setCtx(null); setMenuOpen(false); }; window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

  useEffect(() => {
    const isTyping = (e) => {
      const el = e.target;
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = async (e) => {
      if (isTyping(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (modal || detailId) return;
      const list = filtered;
      const currentIdx = selectedTask != null ? list.findIndex(t => t.id === selectedTask) : -1;
      const current = currentIdx >= 0 ? list[currentIdx] : null;

      if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        setTemplatePickerOpen(true);
      } else if (e.key === 'j') {
        e.preventDefault();
        if (list.length === 0) return;
        const next = currentIdx < 0 ? 0 : Math.min(list.length - 1, currentIdx + 1);
        setSelectedTask(list[next].id);
      } else if (e.key === 'k') {
        e.preventDefault();
        if (list.length === 0) return;
        const prev = currentIdx < 0 ? 0 : Math.max(0, currentIdx - 1);
        setSelectedTask(list[prev].id);
      } else if (e.key === 'e' && current) {
        e.preventDefault();
        setDetailId(current.id);
      } else if (e.key === 'Enter' && current) {
        e.preventDefault();
        setDetailId(current.id);
      } else if (e.key === 'd' && current) {
        e.preventDefault();
        try { await api.updateTask(current.id, { status: current.status === 'done' ? 'to_start' : 'done' }); loadT(); }
        catch (err) { toast.show({ message: err.message, type: 'error' }); }
      } else if (e.key === 'p' && current) {
        e.preventDefault();
        try { await api.updateTask(current.id, { pinned: current.pinned ? 0 : 1 }); loadT(); }
        catch (err) { toast.show({ message: err.message, type: 'error' }); }
      } else if (e.key === 'a' && current) {
        e.preventDefault();
        try {
          if (current.archived) {
            await api.unarchiveTask(current.id);
            toast.show({ message: `Restored: ${current.title}`, type: 'success' });
          } else {
            await api.updateTask(current.id, { archived: 1 });
            toast.show({
              message: `Archived: ${current.title}`,
              type: 'undo',
              undo: async () => { try { await api.unarchiveTask(current.id); loadT(); } catch (err) { toast.show({ message: err.message, type: 'error' }); } },
            });
          }
          loadT();
        } catch (err) { toast.show({ message: err.message, type: 'error' }); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, selectedTask, modal, detailId, loadT, toast]);

  const ctxAct = async (a) => {
    if (!ctx) return;
    const t = ctx.task;
    try {
      if (a === 'pin') await api.updateTask(t.id, { pinned: t.pinned ? 0 : 1 });
      if (a === 'archive') {
        await api.updateTask(t.id, { archived: 1 });
        toast.show({
          message: `Archived: ${t.title}`,
          type: 'undo',
          undo: async () => { try { await api.unarchiveTask(t.id); loadT(); } catch (e) { toast.show({ message: e.message, type: 'error' }); } },
        });
      }
      if (a === 'unarchive') { await api.unarchiveTask(t.id); toast.show({ message: `Restored: ${t.title}`, type: 'success' }); }
      if (a === 'done') await api.updateTask(t.id, { status: 'done' });
      if (a === 'delete-permanent') {
        if (!window.confirm(`Permanently delete "${t.title}"?\n\nThis cannot be undone after 10 seconds.`)) {
          setCtx(null);
          return;
        }
        await api.softDeleteTask(t.id);
        toast.show({
          message: `Deleted: ${t.title}`,
          type: 'undo',
          undo: async () => {
            try { await api.undoDeleteTask(t.id); loadT(); toast.show({ message: 'Restored', type: 'success' }); }
            catch (err) { toast.show({ message: err.message || 'Undo expired', type: 'error' }); }
          },
        });
      }
      loadT();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
    setCtx(null);
  };

  const toggleTd = async (t) => {
    try { await api.updateTodo(t.id, { completed: t.completed ? 0 : 1 }); loadTd(); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const dismissTd = async (t) => {
    try {
      await api.updateTodo(t.id, { dismissed: 1 });
      loadTd();
      toast.show({
        message: `Todo dismissed: ${t.title}`,
        type: 'undo',
        undo: async () => { try { await api.updateTodo(t.id, { dismissed: 0 }); loadTd(); } catch (e) { toast.show({ message: e.message, type: 'error' }); } },
      });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const delTd = async (t) => {
    if (!window.confirm(`Permanently delete todo "${t.title}"?\n\nThis cannot be undone after 10 seconds.`)) return;
    try {
      await api.softDeleteTodo(t.id);
      loadTd();
      toast.show({
        message: `Todo deleted: ${t.title}`,
        type: 'undo',
        undo: async () => {
          try { await api.undoDeleteTodo(t.id); loadTd(); }
          catch (e) { toast.show({ message: e.message || 'Undo expired', type: 'error' }); }
        },
      });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const delEv = async (ev) => {
    try {
      await api.softDeleteEvent(ev.id);
      loadEv();
      toast.show({
        message: `Event deleted: ${ev.title}`,
        type: 'undo',
        undo: async () => {
          try { await api.undoDeleteEvent(ev.id); loadEv(); }
          catch (e) { toast.show({ message: e.message || 'Undo expired', type: 'error' }); }
        },
      });
    } catch (er) { toast.show({ message: er.message, type: 'error' }); }
  };
  const openRev = async () => {
    try { const d = await api.weeklyReview(space.id); setReview(d); setModal('review'); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  // Bulk actions
  const toggleBulk = (id, e) => {
    e.stopPropagation();
    setBulkSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const clearBulk = () => setBulkSel(new Set());
  const bulkArchive = async () => {
    const ids = Array.from(bulkSel);
    try {
      for (const id of ids) await api.updateTask(id, { archived: 1 });
      clearBulk(); loadT();
      toast.show({
        message: `Archived ${ids.length} task${ids.length !== 1 ? 's' : ''}`,
        type: 'undo',
        undo: async () => {
          try { for (const id of ids) await api.unarchiveTask(id); loadT(); }
          catch (e) { toast.show({ message: e.message, type: 'error' }); }
        },
      });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const bulkDone = async () => {
    const ids = Array.from(bulkSel);
    try {
      for (const id of ids) await api.updateTask(id, { status: 'done' });
      clearBulk(); loadT();
      toast.show({ message: `Marked ${ids.length} task${ids.length !== 1 ? 's' : ''} done`, type: 'success' });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const bulkPin = async () => {
    const ids = Array.from(bulkSel);
    try {
      for (const id of ids) await api.updateTask(id, { pinned: 1 });
      clearBulk(); loadT();
      toast.show({ message: `Pinned ${ids.length} task${ids.length !== 1 ? 's' : ''}`, type: 'success' });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  // Drag reorder
  const canReorder = !showArch && !search && fStatus === 'all' && fPri === 'all' && fTag === 'all';
  const onDragStart = (e, id) => { if (!canReorder) { e.preventDefault(); return; } setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e, id) => { if (!canReorder || dragId == null) return; e.preventDefault(); setDragOverId(id); };
  const onDragEnd = () => { setDragId(null); setDragOverId(null); };
  const onDrop = async (e, targetId) => {
    if (!canReorder || dragId == null || dragId === targetId) { onDragEnd(); return; }
    e.preventDefault();
    const list = [...filtered];
    const fromIdx = list.findIndex(t => t.id === dragId);
    const toIdx = list.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { onDragEnd(); return; }
    const moving = list[fromIdx];
    list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moving);
    const ids = list.map(t => t.id);
    const idToTask = Object.fromEntries(tasks.map(t => [t.id, t]));
    setTasks(ids.map(id => idToTask[id]).filter(Boolean).concat(tasks.filter(t => !ids.includes(t.id))));
    try {
      await api.reorderTasks({ space_id: space.id, ids });
      loadT();
    } catch (er) {
      toast.show({ message: er.message, type: 'error' });
      loadT();
    }
    onDragEnd();
  };

  // CSV
  const doExport = async () => {
    try {
      const text = await api.exportCsv(space.id);
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaseki-${space.name.toLowerCase().replace(/\s+/g,'-')}-${todayStr()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.show({ message: 'CSV exported', type: 'success' });
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
    setMenuOpen(false);
  };
  const doImport = () => { csvRef.current?.click(); setMenuOpen(false); };
  const onCsvFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const d = await api.importCsv({ csv: text, space_id: space.id });
      loadT();
      toast.show({ message: `Imported ${d.imported} tasks${d.skipped ? ` (${d.skipped} skipped)` : ''}`, type: 'success' });
    } catch (err) { toast.show({ message: err.message, type: 'error' }); }
  };

  const pinnedTasks = filtered.filter(t => t.pinned);
  const otherTasks = filtered.filter(t => !t.pinned);

  const renderTaskItem = (t) => (
    <div
      key={t.id}
      className={`dash-task-item${selectedTask === t.id ? ' dash-task-item--selected' : ''}${t.pinned ? ' dash-task-item--pinned' : ''}${dragId === t.id ? ' dash-task-item--dragging' : ''}${dragOverId === t.id ? ' dash-task-item--drop-target' : ''}`}
      onClick={() => { setSelectedTask(t.id); setDetailId(t.id); }}
      onContextMenu={e => handleCtx(e, t)}
      draggable={canReorder}
      onDragStart={(e) => onDragStart(e, t.id)}
      onDragOver={(e) => onDragOver(e, t.id)}
      onDrop={(e) => onDrop(e, t.id)}
      onDragEnd={onDragEnd}
    >
      <div className="dash-task-item-top">
        <div
          className={`dash-task-item-checkbox${bulkSel.has(t.id) ? ' dash-task-item-checkbox--checked' : ''}`}
          onClick={(e) => toggleBulk(t.id, e)}
          title="Select for bulk actions"
        >{bulkSel.has(t.id) ? '✓' : ''}</div>
        {t.pinned ? <span className="dash-pin-icon">📌</span> : null}
        <span className="dash-task-item-title">{t.title}</span>
        <span className="dash-priority-dot" style={{ background: PRIORITY_COLORS[t.priority] }} />
      </div>
      <div className="dash-task-item-meta">
        <span className="dash-status-badge" style={{ background: STATUS_COLORS[t.status] + '22', color: STATUS_COLORS[t.status] }}>{STATUS_LABELS[t.status]}</span>
        {t.blocked && t.status !== 'done' && (
          <span className="dash-blocked-badge" title="Waiting on dependencies">⛔ Blocked</span>
        )}
        {t.due_date && <span className={`dash-due-date${isOverdue(t.due_date) && t.status !== 'done' ? ' dash-due-date--overdue' : ''}`}>{fmtDate(t.due_date)}</span>}
      </div>
      {(t.tags && t.tags.length > 0) && (
        <div className="dash-task-tags">
          {t.tags.map(tag => <TagChip key={tag.id} tag={tag} />)}
        </div>
      )}
      {(() => {
        const peekFields = spaceFields.filter(f => f.show_in_list);
        const values = taskFieldValues[t.id] || {};
        const chips = peekFields
          .map(f => ({ f, v: values[f.id] }))
          .filter(x => x.v != null && x.v !== '');
        if (chips.length === 0) return null;
        return (
          <div className="dash-task-item-peek">
            {chips.map(({ f, v }) => (
              <span key={f.id} className="dash-peek-chip" title={`${f.label}: ${v}`}>
                <span className="dash-peek-chip-label">{f.label}:</span>
                <span className="dash-peek-chip-value">{formatPeek(f, v)}</span>
              </span>
            ))}
          </div>
        );
      })()}
    </div>
  );

  return (
    <div className={`dashboard${bulkSel.size > 0 ? ' dash-bulk-active' : ''}`} style={rootStyle}>
      <div className="dash-header">
        <div className="dash-header-left">
          <button className="dash-back-btn" onClick={onBack}>←</button>
          <div className="dash-title">
            <span className="dash-title-space-icon"><SpaceIcon icon={space.icon} color={space.color} size={18} /></span>
            {space.name}
          </div>
        </div>
        <div className="dash-header-stats"><div className="dash-stat"><span className="dash-stat-value">{total}</span><span className="dash-stat-label">Tasks</span></div><div className="dash-stat"><span className="dash-stat-value">{doneC}</span><span className="dash-stat-label">Done</span></div><div className={`dash-stat${overdueC>0?' dash-stat--danger':''}`}><span className="dash-stat-value">{overdueC}</span><span className="dash-stat-label">Overdue</span></div></div>
        <div className="dash-header-right">
          <ViewSwitcher value={viewMode} onChange={setViewMode} space={space} />
          <SavedViewsMenu
            space={space}
            currentFilters={{ search, fStatus, fPri, fTag, showArch }}
            currentViewType={viewMode}
            onApply={(f, vt) => {
              if (f.search !== undefined) setSearch(f.search || '');
              if (f.fStatus !== undefined) setFStatus(f.fStatus || 'all');
              if (f.fPri !== undefined) setFPri(f.fPri || 'all');
              if (f.fTag !== undefined) setFTag(f.fTag || 'all');
              if (f.showArch !== undefined) setShowArch(!!f.showArch);
              if (vt && ['list', 'board', 'matrix', 'calendar'].includes(vt)) setViewMode(vt);
              toast.show({ message: 'View applied', type: 'success' });
            }}
            onManage={() => toast.show({ message: 'Right-click or ✕ on saved views to delete. Save current for new ones.', type: 'info' })}
          />
          <div className="dash-menu-wrapper" onClick={e => e.stopPropagation()}>
            <button className="dash-review-btn" onClick={() => setMenuOpen(v => !v)} title="More options">⋮</button>
            {menuOpen && (
              <div className="dash-menu">
                <button onClick={() => { setMenuOpen(false); setTemplateMgrOpen(true); }}><span className="dash-menu-icon">📋</span> Templates</button>
                <button onClick={() => { setMenuOpen(false); setTagMgrOpen(true); }}><span className="dash-menu-icon">🏷️</span> Tags</button>
                <button onClick={() => { setMenuOpen(false); setFieldMgrOpen(true); }}><span className="dash-menu-icon">🧩</span> Fields</button>
                <button onClick={() => { setMenuOpen(false); onOpenPomodoro && onOpenPomodoro(); }}><span className="dash-menu-icon">🍅</span> Pomodoro</button>
                <button onClick={() => { setMenuOpen(false); onOpenHelp && onOpenHelp(); }}><span className="dash-menu-icon">⌨️</span> Shortcuts</button>
                <button onClick={doExport}><span className="dash-menu-icon">⬇</span> Export CSV</button>
                <button onClick={doImport}><span className="dash-menu-icon">⬆</span> Import CSV</button>
              </div>
            )}
          </div>
          <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onCsvFile} />
          <button className="dash-review-btn" onClick={openRev} title="Weekly Review">📊</button>
          <button className="dash-theme-btn" onClick={onToggleTheme}>{theme==='dark'?'☀️':'🌙'}</button>
          <div className="dash-datetime"><span className="dash-date">{now.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span><span className="dash-time">{now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></div>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="dash-body">
          <div className="dash-sidebar">
            <div className="dash-sidebar-header">
              <span className="dash-sidebar-title">{showArch?'Archived':'Tasks'}</span>
              <div style={{display:'flex',gap:4}}>
                <button className="dash-add-btn" onClick={()=>setShowArch(!showArch)}>{showArch?'Active':'🗂️'}</button>
                {!showArch&&<button className="dash-add-btn" onClick={()=>setTemplatePickerOpen(true)}>+ New</button>}
              </div>
            </div>
            <div className="dash-sidebar-filters">
              <input className="dash-search" placeholder="Search tasks..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <div className="dash-filter-row">
                <select className="dash-filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}><option value="all">All Status</option>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
                <select className="dash-filter-select" value={fPri} onChange={e=>setFPri(e.target.value)}><option value="all">All Priority</option>{[1,2,3,4,5].map(p=><option key={p} value={p}>P{p}</option>)}</select>
              </div>
              {availableTags.length > 0 && (
                <select className="dash-filter-tag-select" value={fTag} onChange={e => setFTag(e.target.value)}>
                  <option value="all">All Tags</option>
                  {availableTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>
            {bulkSel.size > 0 && (
              <div className="dash-bulk-bar">
                <span className="dash-bulk-count">{bulkSel.size} selected</span>
                <button className="dash-bulk-btn" onClick={bulkDone} title="Mark done">✅</button>
                <button className="dash-bulk-btn" onClick={bulkPin} title="Pin">📌</button>
                <button className="dash-bulk-btn dash-bulk-btn--danger" onClick={bulkArchive} title="Archive">🗂️</button>
                <button className="dash-bulk-clear" onClick={clearBulk}>Clear</button>
              </div>
            )}
            <div className="dash-task-list">
              {pinnedTasks.length > 0 && (
                <>
                  <div className="dash-section-divider">📌 Pinned</div>
                  {pinnedTasks.map(renderTaskItem)}
                </>
              )}
              {otherTasks.length > 0 && pinnedTasks.length > 0 && (
                <div className="dash-section-divider">All tasks</div>
              )}
              {otherTasks.map(renderTaskItem)}
              {filtered.length === 0 && <div className="dash-empty">{showArch ? 'No archived tasks' : 'No tasks yet'}</div>}
            </div>
          </div>
          <div className="dash-main">
            <Timeline space={space} tasks={tasks} events={events} selectedDate={selDate} onSelectDate={setSelDate}/>
            <div className="dash-panels">
              <div className="dash-panel"><div className="dash-panel-header"><span className="dash-panel-title">Todos · {fmtDate(selDate)}</span><button className="dash-panel-add" onClick={()=>setModal('todo')}>+</button></div><div className="dash-panel-body">{todos.map(t=><div key={t.id} className={`dash-todo-item${t.completed?' dash-todo-item--done':''}`} onContextMenu={(e)=>{e.preventDefault();delTd(t);}} title="Right-click to delete permanently"><div className="dash-todo-check" onClick={()=>toggleTd(t)}>{t.completed?'✓':''}</div><span className="dash-todo-text">{t.title}</span>{t.is_recurring?<span className="dash-todo-recurring">🔁</span>:null}<button className="dash-todo-dismiss" onClick={()=>dismissTd(t)} title="Dismiss">✕</button></div>)}{todos.length===0&&<div className="dash-empty-small">No todos for this date</div>}</div></div>
              <div className="dash-panel"><div className="dash-panel-header"><span className="dash-panel-title">Events</span><button className="dash-panel-add" onClick={()=>setModal('event')}>+</button></div><div className="dash-panel-body">{events.map(ev=><div key={ev.id} className="dash-event-item"><div className="dash-event-date"><span className="dash-event-day">{new Date(ev.date).getDate()}</span><span className="dash-event-month">{new Date(ev.date).toLocaleDateString('en-GB',{month:'short'})}</span></div><div className="dash-event-info"><span className="dash-event-title">{ev.title}</span>{ev.time&&<span className="dash-event-time">{ev.time}</span>}</div><button className="dash-event-delete" onClick={()=>delEv(ev)}>✕</button></div>)}{events.length===0&&<div className="dash-empty-small">No events</div>}</div></div>
              <div className="dash-panel"><div className="dash-panel-header"><span className="dash-panel-title">Notes</span></div><div className="dash-panel-body dash-panel-body--notes"><textarea className="dash-notes-textarea" value={sNotes} onChange={e=>saveN(e.target.value)} placeholder="Type your notes here..."/></div></div>
            </div>
          </div>
        </div>
      )}
      {viewMode === 'board' && (
        <div className="dash-alt-view">
          <KanbanView
            tasks={filtered}
            space={space}
            onOpenTask={(id) => setDetailId(id)}
            onUpdateTask={async (id, patch) => { await api.updateTask(id, patch); loadT(); }}
          />
        </div>
      )}
      {viewMode === 'matrix' && (
        <div className="dash-alt-view">
          <MatrixView
            tasks={filtered}
            space={space}
            onOpenTask={(id) => setDetailId(id)}
          />
        </div>
      )}
      {viewMode === 'calendar' && (
        <div className="dash-alt-view">
          <CalendarView
            space={space}
            onOpenTask={(id) => setDetailId(id)}
            onNavigateToDate={(d) => { setSelDate(d); setViewMode('list'); }}
          />
        </div>
      )}
      {ctx&&<div className="dash-context-menu" style={{left:ctx.x,top:ctx.y}}><button onClick={()=>ctxAct('pin')}>{ctx.task.pinned?'📌 Unpin':'📌 Pin'}</button><button onClick={()=>ctxAct('done')}>✅ Mark Done</button><button onClick={()=>{setDetailId(ctx.task.id);setCtx(null);}}>📝 Open Detail</button>{showArch?<><button onClick={()=>ctxAct('unarchive')}>📤 Restore</button><button className="dash-context-danger" onClick={()=>ctxAct('delete-permanent')}>🗑️ Delete permanently</button></>:<button className="dash-context-danger" onClick={()=>ctxAct('archive')}>🗂️ Archive</button>}</div>}
      {modal==='task'&&<CreateTaskModal space={space} onClose={()=>{setModal(null);setPendingTemplate(null);}} onCreated={()=>loadT()} prefillTemplate={pendingTemplate}/>}
      {templatePickerOpen && (
        <div className="dash-modal-overlay" onClick={() => setTemplatePickerOpen(false)}>
          <div className="dash-modal dash-modal--small" onClick={e => e.stopPropagation()}>
            <TemplatePicker
              space={space}
              onBlank={() => { setTemplatePickerOpen(false); setPendingTemplate(null); setModal('task'); }}
              onPick={(t) => { setTemplatePickerOpen(false); setPendingTemplate(t); setModal('task'); }}
              onManage={() => { setTemplatePickerOpen(false); setTemplateMgrOpen(true); }}
            />
            <div className="dash-modal-actions">
              <button className="dash-modal-cancel" onClick={() => setTemplatePickerOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {templateMgrOpen && (
        <TemplateManager space={space} onClose={() => setTemplateMgrOpen(false)} onChanged={() => {}} />
      )}
      {tagMgrOpen && (
        <TagManager space={space} open={tagMgrOpen} onClose={() => setTagMgrOpen(false)} onChanged={() => { loadTags(); loadT(); }} />
      )}
      {fieldMgrOpen && (
        <FieldManager space={space} open={fieldMgrOpen} onClose={() => setFieldMgrOpen(false)} onChanged={() => { loadSpaceFields(); loadT(); }} />
      )}
      {modal==='todo'&&<CreateTodoModal space={space} date={selDate} onClose={()=>setModal(null)} onCreated={()=>loadTd()}/>}
      {modal==='event'&&<CreateEventModal space={space} onClose={()=>setModal(null)} onCreated={()=>loadEv()}/>}
      {modal==='review'&&review&&<div className="dash-modal-overlay" onClick={()=>setModal(null)}><div className="dash-modal dash-modal--wide" onClick={e=>e.stopPropagation()}><h2>📊 Weekly Review</h2><div className="dash-review-stats"><div className="dash-review-stat"><span className="dash-review-stat-value">{review.completedThisWeek.length}</span><span className="dash-review-stat-label">Completed</span></div><div className={`dash-review-stat${review.overdue.length>0?' dash-review-stat--danger':''}`}><span className="dash-review-stat-value">{review.overdue.length}</span><span className="dash-review-stat-label">Overdue</span></div><div className="dash-review-stat"><span className="dash-review-stat-value">{review.upcoming.length}</span><span className="dash-review-stat-label">Upcoming</span></div><div className="dash-review-stat"><span className="dash-review-stat-value">{review.todoCompletionRate}%</span><span className="dash-review-stat-label">Todo Rate</span></div></div>{review.overdue.length>0&&<div className="dash-review-section"><h3>⚠️ Overdue</h3>{review.overdue.map(t=><div key={t.id} className="dash-review-item"><span>{t.title}</span><span className="dash-review-item-date">{fmtDate(t.due_date)}</span></div>)}</div>}{review.upcoming.length>0&&<div className="dash-review-section"><h3>📅 Upcoming</h3>{review.upcoming.map(t=><div key={t.id} className="dash-review-item"><span>{t.title}</span><span className="dash-review-item-date">{fmtDate(t.due_date)}</span></div>)}</div>}{review.completedThisWeek.length>0&&<div className="dash-review-section"><h3>✅ Completed</h3>{review.completedThisWeek.map(t=><div key={t.id} className="dash-review-item dash-review-item--done"><span>{t.title}</span></div>)}</div>}<div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={()=>setModal(null)}>Close</button></div></div></div>}
      {detailId&&<TaskDetail taskId={detailId} space={space} onClose={()=>setDetailId(null)} onUpdated={()=>loadT()} availableTags={availableTags} onTagsChanged={loadTags} allTasks={tasks}/>}
    </div>
  );
}
