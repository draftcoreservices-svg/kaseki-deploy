import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../api';
import { useToast } from '../components/ToastContext';

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

function TagChip({ tag, onRemove }) {
  const c = TAG_COLORS[tag.color] || TAG_COLORS.blue;
  return (
    <span className="dash-tag" style={{ background: c.bg, color: c.fg }}>
      {tag.name}
      {onRemove && <button className="dash-tag-remove" onClick={(e) => { e.stopPropagation(); onRemove(tag); }} title="Remove tag">✕</button>}
    </span>
  );
}

function Timeline({ section, tasks, events, selectedDate, onSelectDate }) {
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
            {(d.hasTasks || d.hasEvents) && <div className="dash-tl-dots">{d.hasTasks && <span className={`dash-tl-dot dash-tl-dot--${section}`} />}{d.hasEvents && <span className="dash-tl-dot dash-tl-dot--event" />}</div>}
          </div>
        ))}
      </div>
      <button className="dash-timeline-nav" onClick={() => setOffset(o => o + 7)}>›</button>
    </div>
  );
}

function CreateTaskModal({ section, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', priority: 3, due_date: '', status: 'to_start', case_reference: '', client_name: '', court_date: '', goals: '' });
  const [loading, setLoading] = useState(false);
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title) return;
    setLoading(true);
    try {
      const d = await api.createTask({ ...form, section });
      onCreated(d.task);
      toast.show({ message: 'Task created', type: 'success' });
      onClose();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
    setLoading(false);
  };
  return (
    <div className="dash-modal-overlay" onClick={onClose}><div className="dash-modal" onClick={e => e.stopPropagation()}>
      <h2>New {section === 'work' ? 'Work' : 'Home'} Task</h2>
      <div className="dash-modal-field"><label>Title</label><input value={form.title} onChange={e => u('title', e.target.value)} autoFocus placeholder="Task name..." /></div>
      <div className="dash-modal-field"><label>Description</label><textarea rows={3} value={form.description} onChange={e => u('description', e.target.value)} placeholder="Details..." /></div>
      <div className="dash-modal-row">
        <div className="dash-modal-field"><label>Priority</label><select value={form.priority} onChange={e => u('priority', +e.target.value)}><option value={1}>1 - Lowest</option><option value={2}>2 - Low</option><option value={3}>3 - Medium</option><option value={4}>4 - High</option><option value={5}>5 - Critical</option></select></div>
        <div className="dash-modal-field"><label>Status</label><select value={form.status} onChange={e => u('status', e.target.value)}>{Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="dash-modal-field"><label>Due Date</label><input type="date" value={form.due_date} onChange={e => u('due_date', e.target.value)} /></div>
      {section === 'work' && <><div className="dash-modal-row"><div className="dash-modal-field"><label>Case Ref</label><input value={form.case_reference} onChange={e => u('case_reference', e.target.value)} /></div><div className="dash-modal-field"><label>Client</label><input value={form.client_name} onChange={e => u('client_name', e.target.value)} /></div></div><div className="dash-modal-field"><label>Court Date</label><input type="date" value={form.court_date} onChange={e => u('court_date', e.target.value)} /></div></>}
      <div className="dash-modal-field"><label>Goals</label><textarea rows={2} value={form.goals} onChange={e => u('goals', e.target.value)} placeholder="What does done look like?" /></div>
      <div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={onClose}>Cancel</button><button className={`dash-modal-save dash-modal-save--${section}`} disabled={loading || !form.title} onClick={submit}>{loading ? 'Creating...' : 'Create Task'}</button></div>
    </div></div>
  );
}

function CreateTodoModal({ section, date, onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [intv, setIntv] = useState(1);
  const [unit, setUnit] = useState('days');
  const submit = async () => {
    if (!title) return;
    try {
      const d = await api.createTodo({ section, title, date, is_recurring: recurring ? 1 : 0, recurrence_interval: recurring ? intv : null, recurrence_unit: recurring ? unit : null });
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
      <div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={onClose}>Cancel</button><button className={`dash-modal-save dash-modal-save--${section}`} disabled={!title} onClick={submit}>Add Todo</button></div>
    </div></div>
  );
}

function CreateEventModal({ section, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', date: todayStr(), time: '' });
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!form.title || !form.date) return;
    try {
      const d = await api.createEvent({ ...form, section });
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
      <div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={onClose}>Cancel</button><button className={`dash-modal-save dash-modal-save--${section}`} disabled={!form.title} onClick={submit}>Add Event</button></div>
    </div></div>
  );
}

function TagPicker({ section, currentTags, availableTags, onAdd, onRemove, onCreateTag }) {
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
        <button className={`dash-subtask-add-btn dash-subtask-add-btn--${section}`} disabled={!newName.trim()} onClick={submitNew}>Add</button>
      </div>
    </div>
  );
}

function TaskDetail({ taskId, section, onClose, onUpdated, availableTags, onTagsChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [newSub, setNewSub] = useState('');
  const [newNote, setNewNote] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try { const d = await api.getTask(taskId); setData(d); setForm(d.task); } catch (e) { console.error(e); }
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="dash-detail-overlay" onClick={onClose}><div className="dash-detail" onClick={e => e.stopPropagation()}><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading...</div></div></div>;
  const { task, subtasks, notes, files, activity } = data;
  const currentTags = data.tags || task.tags || [];
  const u = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    try {
      const d = await api.updateTask(task.id, form);
      setData(p => ({ ...p, task: d.task, tags: d.task.tags || p.tags }));
      setForm(d.task);
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
    const f = e.target.files[0]; if (!f) return;
    try { await api.uploadFile(task.id, f); load(); toast.show({ message: 'File uploaded', type: 'success' }); }
    catch (er) { toast.show({ message: er.message, type: 'error' }); }
  };
  const delFile = async (f) => {
    try { await api.deleteFile(f.id); load(); toast.show({ message: `File deleted: ${f.original_name}`, type: 'info' }); }
    catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const addTag = async (tag) => {
    try {
      await api.addTaskTag(task.id, tag.id);
      load(); onUpdated();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const removeTag = async (tag) => {
    try {
      await api.removeTaskTag(task.id, tag.id);
      load(); onUpdated();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };
  const createTag = async (name, color) => {
    try {
      const d = await api.createTag({ section, name, color });
      onTagsChanged();
      await api.addTaskTag(task.id, d.tag.id);
      load(); onUpdated();
    } catch (e) { toast.show({ message: e.message, type: 'error' }); }
  };

  const cSubs = subtasks.filter(s => s.completed).length;
  const pct = subtasks.length > 0 ? Math.round((cSubs / subtasks.length) * 100) : 0;

  return (
    <div className="dash-detail-overlay" onClick={onClose}><div className="dash-detail" onClick={e => e.stopPropagation()}>
      <div className="dash-detail-header">
        {editing ? <input className="dash-detail-title-input" value={form.title} onChange={e => u('title', e.target.value)} /> : <h2>{task.title}</h2>}
        <div className="dash-detail-actions">{editing ? <button className={`dash-detail-save dash-detail-save--${section}`} onClick={save}>Save</button> : <button className="dash-detail-edit" onClick={() => setEditing(true)}>Edit</button>}<button className="dash-detail-close" onClick={onClose}>✕</button></div>
      </div>
      <div className="dash-detail-tabs">{['details','subtasks','notes','files','activity'].map(t => <button key={t} className={`dash-detail-tab${tab===t?' dash-detail-tab--active':''}`} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}{t==='subtasks'?` (${subtasks.length})`:t==='files'?` (${files.length})`:''}</button>)}</div>
      <div className="dash-detail-body">
        {tab==='details'&&<>
          <div className="dash-detail-meta">
            <div className="dash-detail-meta-item"><label>Status</label>{editing?<select value={form.status} onChange={e=>u('status',e.target.value)}>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:<span style={{color:STATUS_COLORS[task.status]}}>{STATUS_LABELS[task.status]}</span>}</div>
            <div className="dash-detail-meta-item"><label>Priority</label>{editing?<select value={form.priority} onChange={e=>u('priority',+e.target.value)}>{[1,2,3,4,5].map(p=><option key={p} value={p}>{p}</option>)}</select>:<span><span className="dash-priority-dot" style={{background:PRIORITY_COLORS[task.priority],display:'inline-block',marginRight:6}}/>{task.priority}</span>}</div>
            <div className="dash-detail-meta-item"><label>Due Date</label>{editing?<input type="date" value={form.due_date||''} onChange={e=>u('due_date',e.target.value)}/>:<span className={isOverdue(task.due_date)?'dash-due-date--overdue':''}>{task.due_date?fmtDate(task.due_date):'—'}</span>}</div>
            <div className="dash-detail-meta-item"><label>Section</label><span>{task.section}</span></div>
          </div>
          {section==='work'&&<div className="dash-detail-meta" style={{marginTop:12}}><div className="dash-detail-meta-item"><label>Case Ref</label>{editing?<input value={form.case_reference||''} onChange={e=>u('case_reference',e.target.value)}/>:<span>{task.case_reference||'—'}</span>}</div><div className="dash-detail-meta-item"><label>Client</label>{editing?<input value={form.client_name||''} onChange={e=>u('client_name',e.target.value)}/>:<span>{task.client_name||'—'}</span>}</div><div className="dash-detail-meta-item"><label>Court Date</label>{editing?<input type="date" value={form.court_date||''} onChange={e=>u('court_date',e.target.value)}/>:<span className={isOverdue(task.court_date)?'dash-due-date--overdue':''}>{task.court_date?fmtDate(task.court_date):'—'}</span>}</div></div>}
          <div className="dash-detail-section"><h3>Description</h3>{editing?<textarea rows={4} value={form.description||''} onChange={e=>u('description',e.target.value)}/>:<div className="dash-detail-text">{task.description||'No description'}</div>}</div>
          <div className="dash-detail-section"><h3>Goals</h3>{editing?<textarea rows={3} value={form.goals||''} onChange={e=>u('goals',e.target.value)}/>:<div className="dash-detail-text">{task.goals||'No goals set'}</div>}</div>
          <div className="dash-detail-section">
            <h3>Tags</h3>
            <TagPicker
              section={section}
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
          <div className="dash-subtask-add"><input value={newSub} onChange={e=>setNewSub(e.target.value)} placeholder="Add subtask..." onKeyDown={e=>e.key==='Enter'&&addSub()}/><button className={`dash-subtask-add-btn dash-subtask-add-btn--${section}`} disabled={!newSub} onClick={addSub}>Add</button></div>
        </>}
        {tab==='notes'&&<>
          <div className="dash-note-add"><textarea rows={3} value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Write a note..."/><button className={`dash-subtask-add-btn dash-subtask-add-btn--${section}`} disabled={!newNote} onClick={addNote}>Add Note</button></div>
          <div className="dash-note-list">{notes.map(n=><div key={n.id} className="dash-note-item"><p>{n.content}</p><span className="dash-note-time">{fmtDateTime(n.created_at)}</span></div>)}{notes.length===0&&<div className="dash-empty-small">No notes yet</div>}</div>
        </>}
        {tab==='files'&&<>
          <button className={`dash-file-upload-btn dash-file-upload-btn--${section}`} onClick={()=>fileRef.current?.click()}>📎 Upload File</button>
          <input ref={fileRef} type="file" style={{display:'none'}} onChange={uploadFile}/>
          <div className="dash-file-list">{files.map(f=><div key={f.id} className="dash-file-item"><span className="dash-file-icon">📄</span><div className="dash-file-info"><a className="dash-file-name" href={`/uploads/${f.filename}`} target="_blank" rel="noreferrer">{f.original_name}</a><span className="dash-file-meta">{fileSize(f.size)} · {fmtDateTime(f.created_at)}</span></div><button className="dash-file-delete" onClick={()=>delFile(f)}>✕</button></div>)}{files.length===0&&<div className="dash-empty-small">No files attached</div>}</div>
        </>}
        {tab==='activity'&&<div className="dash-activity-list">{activity.map(a=><div key={a.id} className="dash-activity-item"><div className="dash-activity-dot"/><div className="dash-activity-content"><span className="dash-activity-text">{a.details}</span><span className="dash-activity-time">{fmtDateTime(a.created_at)}</span></div></div>)}{activity.length===0&&<div className="dash-empty-small">No activity yet</div>}</div>}
      </div>
    </div></div>
  );
}

export default function Dashboard({ section, onBack, theme, onToggleTheme }) {
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

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const loadT = useCallback(async () => {
    try { const d = showArch ? await api.getArchivedTasks(section) : await api.getTasks(section); setTasks(d.tasks); }
    catch (e) {}
  }, [section, showArch]);
  const loadTd = useCallback(async () => {
    try { const d = await api.getTodos(section, selDate); setTodos(d.todos); } catch (e) {}
  }, [section, selDate]);
  const loadEv = useCallback(async () => {
    try { const d = await api.getEvents(section); setEvents(d.events); } catch (e) {}
  }, [section]);
  const loadN = useCallback(async () => {
    try { const d = await api.getNotes(section); setSNotes(d.note?.content || ''); } catch (e) {}
  }, [section]);
  const loadTags = useCallback(async () => {
    try { const d = await api.getTags(section); setAvailableTags(d.tags || []); } catch (e) {}
  }, [section]);

  useEffect(() => { loadT(); }, [loadT]);
  useEffect(() => { loadTd(); }, [loadTd]);
  useEffect(() => { loadEv(); }, [loadEv]);
  useEffect(() => { loadN(); }, [loadN]);
  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { setBulkSel(new Set()); }, [section, showArch]);

  const saveN = (c) => {
    setSNotes(c);
    clearTimeout(nRef.current);
    nRef.current = setTimeout(() => { api.saveNotes({ section, content: c }).catch(() => {}); }, 800);
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
  const delEv = async (ev) => {
    try {
      await api.deleteEvent(ev.id);
      loadEv();
      toast.show({
        message: `Event deleted: ${ev.title}`,
        type: 'undo',
        undo: async () => {
          try { await api.createEvent({ section, title: ev.title, description: ev.description, date: ev.date, time: ev.time }); loadEv(); }
          catch (e) { toast.show({ message: e.message, type: 'error' }); }
        },
      });
    } catch (er) { toast.show({ message: er.message, type: 'error' }); }
  };
  const openRev = async () => {
    try { const d = await api.weeklyReview(); setReview(d); setModal('review'); }
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
    const titles = tasks.filter(t => bulkSel.has(t.id)).map(t => t.title);
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
    // Build new order of visible tasks. Need to respect pinned section.
    const list = [...filtered];
    const fromIdx = list.findIndex(t => t.id === dragId);
    const toIdx = list.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { onDragEnd(); return; }
    const moving = list[fromIdx];
    list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moving);
    // Only reorder within the same pinned-group
    const ids = list.map(t => t.id);
    // Optimistic local update
    const idToTask = Object.fromEntries(tasks.map(t => [t.id, t]));
    setTasks(ids.map(id => idToTask[id]).filter(Boolean).concat(tasks.filter(t => !ids.includes(t.id))));
    try {
      await api.reorderTasks({ section, ids });
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
      const text = await api.exportCsv(section);
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaseki-${section}-${new Date().toISOString().split('T')[0]}.csv`;
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
      const d = await api.importCsv({ csv: text, section });
      loadT();
      toast.show({ message: `Imported ${d.imported} tasks${d.skipped ? ` (${d.skipped} skipped)` : ''}`, type: 'success' });
    } catch (err) { toast.show({ message: err.message, type: 'error' }); }
  };

  // Task list rendering with pinned divider
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
        {t.due_date && <span className={`dash-due-date${isOverdue(t.due_date) && t.status !== 'done' ? ' dash-due-date--overdue' : ''}`}>{fmtDate(t.due_date)}</span>}
      </div>
      {(t.tags && t.tags.length > 0) && (
        <div className="dash-task-tags">
          {t.tags.map(tag => <TagChip key={tag.id} tag={tag} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className={`dashboard dashboard--${section}${bulkSel.size > 0 ? ' dash-bulk-active' : ''}`}>
      <div className="dash-header">
        <div className="dash-header-left"><button className="dash-back-btn" onClick={onBack}>←</button><div className="dash-title"><span className="dash-title-icon">{section==='work'?'💼':'🏠'}</span>{section==='work'?'Work':'Home'}</div></div>
        <div className="dash-header-stats"><div className="dash-stat"><span className="dash-stat-value">{total}</span><span className="dash-stat-label">Tasks</span></div><div className="dash-stat"><span className="dash-stat-value">{doneC}</span><span className="dash-stat-label">Done</span></div><div className={`dash-stat${overdueC>0?' dash-stat--danger':''}`}><span className="dash-stat-value">{overdueC}</span><span className="dash-stat-label">Overdue</span></div></div>
        <div className="dash-header-right">
          <div className="dash-menu-wrapper" onClick={e => e.stopPropagation()}>
            <button className="dash-review-btn" onClick={() => setMenuOpen(v => !v)} title="More options">⋮</button>
            {menuOpen && (
              <div className="dash-menu">
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
      <div className="dash-body">
        <div className="dash-sidebar">
          <div className="dash-sidebar-header"><span className="dash-sidebar-title">{showArch?'Archived':'Tasks'}</span><div style={{display:'flex',gap:4}}><button className={`dash-add-btn dash-add-btn--${section}`} onClick={()=>setShowArch(!showArch)}>{showArch?'Active':'🗂️'}</button>{!showArch&&<button className={`dash-add-btn dash-add-btn--${section}`} onClick={()=>setModal('task')}>+ New</button>}</div></div>
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
          <Timeline section={section} tasks={tasks} events={events} selectedDate={selDate} onSelectDate={setSelDate}/>
          <div className="dash-panels">
            <div className="dash-panel"><div className="dash-panel-header"><span className="dash-panel-title">Todos · {fmtDate(selDate)}</span><button className={`dash-panel-add dash-panel-add--${section}`} onClick={()=>setModal('todo')}>+</button></div><div className="dash-panel-body">{todos.map(t=><div key={t.id} className={`dash-todo-item${t.completed?' dash-todo-item--done':''}`}><div className="dash-todo-check" onClick={()=>toggleTd(t)}>{t.completed?'✓':''}</div><span className="dash-todo-text">{t.title}</span>{t.is_recurring?<span className="dash-todo-recurring">🔁</span>:null}<button className="dash-todo-dismiss" onClick={()=>dismissTd(t)}>✕</button></div>)}{todos.length===0&&<div className="dash-empty-small">No todos for this date</div>}</div></div>
            <div className="dash-panel"><div className="dash-panel-header"><span className="dash-panel-title">Events</span><button className={`dash-panel-add dash-panel-add--${section}`} onClick={()=>setModal('event')}>+</button></div><div className="dash-panel-body">{events.map(ev=><div key={ev.id} className="dash-event-item"><div className="dash-event-date"><span className="dash-event-day">{new Date(ev.date).getDate()}</span><span className="dash-event-month">{new Date(ev.date).toLocaleDateString('en-GB',{month:'short'})}</span></div><div className="dash-event-info"><span className="dash-event-title">{ev.title}</span>{ev.time&&<span className="dash-event-time">{ev.time}</span>}</div><button className="dash-event-delete" onClick={()=>delEv(ev)}>✕</button></div>)}{events.length===0&&<div className="dash-empty-small">No events</div>}</div></div>
            <div className="dash-panel"><div className="dash-panel-header"><span className="dash-panel-title">Notes</span></div><div className="dash-panel-body dash-panel-body--notes"><textarea className="dash-notes-textarea" value={sNotes} onChange={e=>saveN(e.target.value)} placeholder="Type your notes here..."/></div></div>
          </div>
        </div>
      </div>
      {ctx&&<div className="dash-context-menu" style={{left:ctx.x,top:ctx.y}}><button onClick={()=>ctxAct('pin')}>{ctx.task.pinned?'📌 Unpin':'📌 Pin'}</button><button onClick={()=>ctxAct('done')}>✅ Mark Done</button><button onClick={()=>{setDetailId(ctx.task.id);setCtx(null);}}>📝 Open Detail</button>{showArch?<button onClick={()=>ctxAct('unarchive')}>📤 Restore</button>:<button className="dash-context-danger" onClick={()=>ctxAct('archive')}>🗂️ Archive</button>}</div>}
      {modal==='task'&&<CreateTaskModal section={section} onClose={()=>setModal(null)} onCreated={()=>loadT()}/>}
      {modal==='todo'&&<CreateTodoModal section={section} date={selDate} onClose={()=>setModal(null)} onCreated={()=>loadTd()}/>}
      {modal==='event'&&<CreateEventModal section={section} onClose={()=>setModal(null)} onCreated={()=>loadEv()}/>}
      {modal==='review'&&review&&<div className="dash-modal-overlay" onClick={()=>setModal(null)}><div className="dash-modal dash-modal--wide" onClick={e=>e.stopPropagation()}><h2>📊 Weekly Review</h2><div className="dash-review-stats"><div className="dash-review-stat"><span className="dash-review-stat-value">{review.completedThisWeek.length}</span><span className="dash-review-stat-label">Completed</span></div><div className={`dash-review-stat${review.overdue.length>0?' dash-review-stat--danger':''}`}><span className="dash-review-stat-value">{review.overdue.length}</span><span className="dash-review-stat-label">Overdue</span></div><div className="dash-review-stat"><span className="dash-review-stat-value">{review.upcoming.length}</span><span className="dash-review-stat-label">Upcoming</span></div><div className="dash-review-stat"><span className="dash-review-stat-value">{review.todoCompletionRate}%</span><span className="dash-review-stat-label">Todo Rate</span></div></div>{review.overdue.length>0&&<div className="dash-review-section"><h3>⚠️ Overdue</h3>{review.overdue.map(t=><div key={t.id} className="dash-review-item"><span>{t.title}</span><span className="dash-review-item-date">{fmtDate(t.due_date)}</span><span className="dash-review-item-section">{t.section}</span></div>)}</div>}{review.upcoming.length>0&&<div className="dash-review-section"><h3>📅 Upcoming</h3>{review.upcoming.map(t=><div key={t.id} className="dash-review-item"><span>{t.title}</span><span className="dash-review-item-date">{fmtDate(t.due_date)}</span></div>)}</div>}{review.completedThisWeek.length>0&&<div className="dash-review-section"><h3>✅ Completed</h3>{review.completedThisWeek.map(t=><div key={t.id} className="dash-review-item dash-review-item--done"><span>{t.title}</span><span className="dash-review-item-section">{t.section}</span></div>)}</div>}<div className="dash-modal-actions"><button className="dash-modal-cancel" onClick={()=>setModal(null)}>Close</button></div></div></div>}
      {detailId&&<TaskDetail taskId={detailId} section={section} onClose={()=>setDetailId(null)} onUpdated={()=>loadT()} availableTags={availableTags} onTagsChanged={loadTags}/>}
    </div>
  );
}
