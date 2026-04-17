const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./db');
const { authenticate } = require('./auth');

const router = express.Router();

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Helpers
function logActivity(taskId, userId, action, details) {
  const db = getDb();
  db.prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)').run(taskId, userId, action, details);
}

function getTagsForTask(taskId) {
  const db = getDb();
  return db.prepare('SELECT t.* FROM tags t JOIN task_tags tt ON tt.tag_id = t.id WHERE tt.task_id = ? ORDER BY t.name ASC').all(taskId);
}

function attachTagsToTasks(tasks) {
  if (!tasks || tasks.length === 0) return tasks;
  const db = getDb();
  const ids = tasks.map(t => t.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT tt.task_id, t.id, t.name, t.color FROM task_tags tt JOIN tags t ON tt.tag_id = t.id WHERE tt.task_id IN (${placeholders}) ORDER BY t.name ASC`).all(...ids);
  const byTask = {};
  for (const r of rows) {
    if (!byTask[r.task_id]) byTask[r.task_id] = [];
    byTask[r.task_id].push({ id: r.id, name: r.name, color: r.color });
  }
  return tasks.map(t => ({ ...t, tags: byTask[t.id] || [] }));
}

// ===== TASKS =====

router.get('/tasks', authenticate, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'Section required' });
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? AND section = ? AND archived = 0 ORDER BY pinned DESC, sort_order ASC, updated_at DESC').all(req.user.id, section);
  res.json({ tasks: attachTagsToTasks(tasks) });
});

router.get('/tasks/archived/list', authenticate, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'Section required' });
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? AND section = ? AND archived = 1 ORDER BY updated_at DESC').all(req.user.id, section);
  res.json({ tasks: attachTagsToTasks(tasks) });
});

router.get('/tasks/weekly/review', authenticate, (req, res) => {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAhead = new Date(now); weekAhead.setDate(weekAhead.getDate() + 7);
  const todayStr = now.toISOString().split('T')[0];
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  const weekAheadStr = weekAhead.toISOString().split('T')[0];

  const db = getDb();
  const completedThisWeek = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND status = 'done' AND updated_at >= ? ORDER BY updated_at DESC").all(req.user.id, weekAgoStr);
  const overdue = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND archived = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date < ? ORDER BY due_date ASC").all(req.user.id, todayStr);
  const upcoming = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND archived = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ? ORDER BY due_date ASC").all(req.user.id, todayStr, weekAheadStr);
  const todosCompleted = db.prepare("SELECT * FROM todos WHERE user_id = ? AND completed = 1 AND date >= ?").all(req.user.id, weekAgoStr);
  const todosTotal = db.prepare("SELECT * FROM todos WHERE user_id = ? AND date >= ?").all(req.user.id, weekAgoStr);

  res.json({
    completedThisWeek,
    overdue,
    upcoming,
    todoCompletionRate: todosTotal.length > 0 ? Math.round((todosCompleted.length / todosTotal.length) * 100) : 0,
    todosCompleted: todosCompleted.length,
    todosTotal: todosTotal.length
  });
});

router.put('/tasks/reorder', authenticate, (req, res) => {
  const { section, ids } = req.body;
  if (!section || !Array.isArray(ids)) return res.status(400).json({ error: 'section and ids[] required' });
  const db = getDb();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ? AND user_id = ? AND section = ?');
  const tx = db.transaction((items) => {
    items.forEach((id, idx) => stmt.run(idx, id, req.user.id, section));
  });
  tx(ids);
  res.json({ success: true });
});

router.get('/tasks/:id', authenticate, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(parseInt(req.params.id), req.user.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC, id ASC').all(task.id);
  const notes = db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at DESC').all(task.id);
  const files = db.prepare('SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at DESC').all(task.id);
  const activity = db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC').all(task.id);
  const tags = getTagsForTask(task.id);
  res.json({ task: { ...task, tags }, subtasks, notes, files, activity, tags });
});

router.post('/tasks', authenticate, (req, res) => {
  const { section, title, description, status, priority, due_date, due_time, case_reference, client_name, court_date, goals } = req.body;
  if (!section || !title) return res.status(400).json({ error: 'Section and title required' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  const result = db.prepare('INSERT INTO tasks (user_id,section,title,description,status,priority,due_date,due_time,case_reference,client_name,court_date,goals) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
    req.user.id, section, title, description || '', status || 'to_start', priority || 3, due_date || null, due_time || null, case_reference || null, client_name || null, court_date || null, goals || ''
  );
  logActivity(result.lastInsertRowid, req.user.id, 'created', 'Task created');
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.json({ task: { ...task, tags: [] } });
});

router.put('/tasks/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });

  const fields = ['title', 'description', 'status', 'priority', 'due_date', 'due_time', 'pinned', 'archived', 'sort_order', 'case_reference', 'client_name', 'court_date', 'goals', 'section'];
  const ups = []; const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      if (f === 'section' && !['home', 'work', 'inbox'].includes(req.body[f])) continue;
      ups.push(f + ' = ?'); vals.push(req.body[f]);
      if (f === 'status' && req.body[f] !== ex[f]) logActivity(id, req.user.id, 'status_changed', 'Changed to ' + req.body[f]);
      if (f === 'archived' && req.body[f] === 1 && ex[f] !== 1) logActivity(id, req.user.id, 'archived', 'Archived');
      if (f === 'pinned' && req.body[f] !== ex[f]) logActivity(id, req.user.id, req.body[f] ? 'pinned' : 'unpinned', req.body[f] ? 'Pinned' : 'Unpinned');
      if (f === 'title' && req.body[f] !== ex.title) logActivity(id, req.user.id, 'edited', 'Title changed');
      if (f === 'description' && req.body[f] !== ex.description) logActivity(id, req.user.id, 'edited', 'Description updated');
      if (f === 'goals' && req.body[f] !== ex.goals) logActivity(id, req.user.id, 'edited', 'Goals updated');
      if (f === 'priority' && req.body[f] !== ex.priority) logActivity(id, req.user.id, 'edited', 'Priority changed to ' + req.body[f]);
      if (f === 'due_date' && req.body[f] !== ex.due_date) logActivity(id, req.user.id, 'edited', 'Due date changed to ' + (req.body[f] || 'none'));
      if (f === 'section' && req.body[f] !== ex.section) logActivity(id, req.user.id, 'moved', 'Moved to ' + req.body[f]);
    }
  }
  if (ups.length > 0) {
    ups.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(id, req.user.id);
    db.prepare('UPDATE tasks SET ' + ups.join(', ') + ' WHERE id = ? AND user_id = ?').run(...vals);
  }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json({ task: { ...task, tags: getTagsForTask(id) } });
});

router.put('/tasks/:id/unarchive', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE tasks SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  logActivity(id, req.user.id, 'unarchived', 'Restored from archive');
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json({ task });
});

// ===== QUICK CAPTURE =====

// Quick capture creates an inbox task with minimum input
router.post('/quick-capture', authenticate, (req, res) => {
  const { title, due_date, due_time, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO tasks (user_id,section,title,priority,due_date,due_time) VALUES (?,?,?,?,?,?)').run(
    req.user.id, 'inbox', title.trim(), priority || 3, due_date || null, due_time || null
  );
  logActivity(result.lastInsertRowid, req.user.id, 'created', 'Quick-captured to inbox');
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.json({ task: { ...task, tags: [] } });
});

// ===== SUBTASKS =====

router.post('/tasks/:id/subtasks', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM subtasks WHERE task_id = ?').get(taskId);
  const result = db.prepare('INSERT INTO subtasks (task_id, title, sort_order) VALUES (?, ?, ?)').run(taskId, title, (maxOrder?.m || 0) + 1);
  logActivity(taskId, req.user.id, 'subtask_added', 'Subtask added: ' + title);
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid);
  res.json({ subtask });
});

router.put('/subtasks/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const sub = db.prepare('SELECT s.*, t.user_id FROM subtasks s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?').get(id);
  if (!sub || sub.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (req.body.completed !== undefined) {
    db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?').run(req.body.completed, id);
    logActivity(sub.task_id, req.user.id, req.body.completed ? 'subtask_completed' : 'subtask_uncompleted', (req.body.completed ? 'Completed' : 'Uncompleted') + ': ' + sub.title);
  }
  if (req.body.title !== undefined) {
    db.prepare('UPDATE subtasks SET title = ? WHERE id = ?').run(req.body.title, id);
  }
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
  res.json({ subtask });
});

router.delete('/subtasks/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const sub = db.prepare('SELECT s.*, t.user_id FROM subtasks s JOIN tasks t ON s.task_id = t.id WHERE s.id = ?').get(id);
  if (!sub || sub.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  logActivity(sub.task_id, req.user.id, 'subtask_removed', 'Removed: ' + sub.title);
  res.json({ success: true });
});

// ===== TASK NOTES =====

router.post('/tasks/:id/notes', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const result = db.prepare('INSERT INTO task_notes (task_id, content) VALUES (?, ?)').run(taskId, content);
  logActivity(taskId, req.user.id, 'note_added', 'Note added');
  const note = db.prepare('SELECT * FROM task_notes WHERE id = ?').get(result.lastInsertRowid);
  res.json({ note });
});

// ===== FILE UPLOADS =====

router.post('/tasks/:id/files', authenticate, upload.single('file'), (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const result = db.prepare('INSERT INTO task_files (task_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)').run(
    taskId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size
  );
  logActivity(taskId, req.user.id, 'file_uploaded', 'File uploaded: ' + req.file.originalname);
  const file = db.prepare('SELECT * FROM task_files WHERE id = ?').get(result.lastInsertRowid);
  res.json({ file });
});

router.delete('/files/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const file = db.prepare('SELECT f.*, t.user_id FROM task_files f JOIN tasks t ON f.task_id = t.id WHERE f.id = ?').get(id);
  if (!file || file.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(__dirname, '..', 'uploads', file.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM task_files WHERE id = ?').run(id);
  logActivity(file.task_id, req.user.id, 'file_deleted', 'File deleted: ' + file.original_name);
  res.json({ success: true });
});

// ===== ACTIVITY LOG =====

router.get('/tasks/:id/activity', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const activity = db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
  res.json({ activity });
});

router.get('/activity/recent', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.*, t.title as task_title, t.section as task_section
    FROM activity_log a
    JOIN tasks t ON a.task_id = t.id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(req.user.id, limit);
  res.json({ activity: rows });
});

// ===== TODOS =====

router.get('/todos', authenticate, (req, res) => {
  const { section, date } = req.query;
  if (!section || !date) return res.status(400).json({ error: 'Section and date required' });
  const db = getDb();
  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ? AND section = ? AND dismissed = 0 AND (date = ? OR (date <= ? AND completed = 0)) ORDER BY created_at ASC').all(req.user.id, section, date, date);
  res.json({ todos });
});

router.post('/todos', authenticate, (req, res) => {
  const { section, title, date, is_recurring, recurrence_interval, recurrence_unit } = req.body;
  if (!section || !title || !date) return res.status(400).json({ error: 'Required fields missing' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  const result = db.prepare('INSERT INTO todos (user_id,section,title,date,is_recurring,recurrence_interval,recurrence_unit) VALUES (?,?,?,?,?,?,?)').run(
    req.user.id, section, title, date, is_recurring || 0, recurrence_interval || null, recurrence_unit || null
  );
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.json({ todo });
});

router.put('/todos/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const ups = []; const vals = [];
  for (const f of ['completed', 'dismissed']) {
    if (req.body[f] !== undefined) { ups.push(f + ' = ?'); vals.push(req.body[f]); }
  }
  if (ups.length > 0) {
    vals.push(id, req.user.id);
    db.prepare('UPDATE todos SET ' + ups.join(', ') + ' WHERE id = ? AND user_id = ?').run(...vals);
    if (req.body.completed === 1 && ex.is_recurring && ex.recurrence_interval) {
      const nd = new Date(ex.date);
      if (ex.recurrence_unit === 'days') nd.setDate(nd.getDate() + ex.recurrence_interval);
      else if (ex.recurrence_unit === 'weeks') nd.setDate(nd.getDate() + (ex.recurrence_interval * 7));
      else if (ex.recurrence_unit === 'months') nd.setMonth(nd.getMonth() + ex.recurrence_interval);
      db.prepare('INSERT INTO todos (user_id,section,title,date,is_recurring,recurrence_interval,recurrence_unit,recurrence_parent_id) VALUES (?,?,?,?,?,?,?,?)').run(
        req.user.id, ex.section, ex.title, nd.toISOString().split('T')[0], 1, ex.recurrence_interval, ex.recurrence_unit, ex.recurrence_parent_id || ex.id
      );
    }
  }
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ todo });
});

// ===== EVENTS =====

router.get('/events', authenticate, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'Section required' });
  const db = getDb();
  const events = db.prepare('SELECT * FROM events WHERE user_id = ? AND section = ? ORDER BY date ASC, time ASC').all(req.user.id, section);
  res.json({ events });
});

router.post('/events', authenticate, (req, res) => {
  const { section, title, description, date, time } = req.body;
  if (!section || !title || !date) return res.status(400).json({ error: 'Required fields missing' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  const result = db.prepare('INSERT INTO events (user_id,section,title,description,date,time) VALUES (?,?,?,?,?,?)').run(
    req.user.id, section, title, description || '', date, time || null
  );
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  res.json({ event });
});

router.delete('/events/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ev = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  res.json({ success: true });
});

// ===== NOTES =====

router.get('/notes', authenticate, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'Section required' });
  const db = getDb();
  const note = db.prepare('SELECT * FROM notes WHERE user_id = ? AND section = ?').get(req.user.id, section);
  res.json({ note });
});

router.put('/notes', authenticate, (req, res) => {
  const { section, content } = req.body;
  if (!section) return res.status(400).json({ error: 'Section required' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  const ex = db.prepare('SELECT * FROM notes WHERE user_id = ? AND section = ?').get(req.user.id, section);
  if (ex) {
    db.prepare('UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND section = ?').run(content || '', req.user.id, section);
  } else {
    db.prepare('INSERT INTO notes (user_id,section,content) VALUES (?,?,?)').run(req.user.id, section, content || '');
  }
  const note = db.prepare('SELECT * FROM notes WHERE user_id = ? AND section = ?').get(req.user.id, section);
  res.json({ note });
});

// ===== USER PREFERENCES =====

router.get('/preferences', authenticate, (req, res) => {
  const db = getDb();
  const pref = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
  res.json({ preferences: pref || { theme: 'dark', keyboard_shortcuts_enabled: 1, default_view: 'list', pomodoro_work_mins: 25, pomodoro_break_mins: 5, pomodoro_long_break_mins: 15, pomodoro_sessions_until_long_break: 4 } });
});

router.put('/preferences', authenticate, (req, res) => {
  const db = getDb();
  const ex = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
  const allowed = ['theme', 'pomodoro_work_mins', 'pomodoro_break_mins', 'pomodoro_long_break_mins', 'pomodoro_sessions_until_long_break', 'default_view', 'keyboard_shortcuts_enabled'];
  if (ex) {
    const ups = []; const vals = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined) { ups.push(f + ' = ?'); vals.push(req.body[f]); }
    }
    if (ups.length > 0) {
      vals.push(req.user.id);
      db.prepare('UPDATE user_preferences SET ' + ups.join(', ') + ' WHERE user_id = ?').run(...vals);
    }
  } else {
    // Create with supplied fields + defaults
    db.prepare('INSERT INTO user_preferences (user_id, theme) VALUES (?, ?)').run(req.user.id, req.body.theme || 'dark');
    const ups = []; const vals = [];
    for (const f of allowed) {
      if (req.body[f] !== undefined && f !== 'theme') { ups.push(f + ' = ?'); vals.push(req.body[f]); }
    }
    if (ups.length > 0) {
      vals.push(req.user.id);
      db.prepare('UPDATE user_preferences SET ' + ups.join(', ') + ' WHERE user_id = ?').run(...vals);
    }
  }
  const updated = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
  res.json({ preferences: updated });
});

// ===== TAGS =====

router.get('/tags', authenticate, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'Section required' });
  const db = getDb();
  const tags = db.prepare('SELECT * FROM tags WHERE user_id = ? AND section = ? ORDER BY name ASC').all(req.user.id, section);
  res.json({ tags });
});

router.post('/tags', authenticate, (req, res) => {
  const { section, name, color } = req.body;
  if (!section || !name) return res.status(400).json({ error: 'section and name required' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO tags (user_id, section, name, color) VALUES (?, ?, ?, ?)').run(req.user.id, section, name.trim(), color || 'blue');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.json({ tag });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tag already exists' });
    throw err;
  }
});

router.delete('/tags/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!tag) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  res.json({ success: true });
});

router.post('/tasks/:id/tags/:tagId', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const tagId = parseInt(req.params.tagId);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(tagId, req.user.id);
  if (!task || !tag) return res.status(404).json({ error: 'Not found' });
  if (task.section !== tag.section) return res.status(400).json({ error: 'Tag section mismatch' });
  db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(taskId, tagId);
  logActivity(taskId, req.user.id, 'tagged', 'Tag added: ' + tag.name);
  res.json({ tags: getTagsForTask(taskId) });
});

router.delete('/tasks/:id/tags/:tagId', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const tagId = parseInt(req.params.tagId);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(tagId, req.user.id);
  if (!task || !tag) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(taskId, tagId);
  logActivity(taskId, req.user.id, 'untagged', 'Tag removed: ' + tag.name);
  res.json({ tags: getTagsForTask(taskId) });
});

// ===== CSV EXPORT / IMPORT =====

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

router.get('/export/csv', authenticate, (req, res) => {
  const { section } = req.query;
  const db = getDb();
  const sql = section
    ? 'SELECT * FROM tasks WHERE user_id = ? AND section = ? ORDER BY id ASC'
    : 'SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC';
  const tasks = section
    ? db.prepare(sql).all(req.user.id, section)
    : db.prepare(sql).all(req.user.id);

  const withTags = attachTagsToTasks(tasks);

  const cols = ['id', 'section', 'title', 'description', 'status', 'priority', 'due_date', 'pinned', 'archived', 'case_reference', 'client_name', 'court_date', 'goals', 'tags', 'created_at', 'updated_at'];
  const lines = [cols.join(',')];
  for (const t of withTags) {
    const row = cols.map(c => {
      if (c === 'tags') return csvEscape((t.tags || []).map(tg => tg.name).join('|'));
      return csvEscape(t[c]);
    });
    lines.push(row.join(','));
  }
  const csv = lines.join('\n');
  const fname = `kaseki-${section || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(csv);
});

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out;
}

router.post('/import/csv', authenticate, (req, res) => {
  const { csv, section } = req.body;
  if (!csv || !section) return res.status(400).json({ error: 'csv and section required' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const lines = String(csv).split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const titleIdx = idx('title');
  if (titleIdx === -1) return res.status(400).json({ error: 'CSV missing "title" column' });

  const db = getDb();
  let imported = 0, skipped = 0;
  const insertTask = db.prepare('INSERT INTO tasks (user_id,section,title,description,status,priority,due_date,case_reference,client_name,court_date,goals) VALUES (?,?,?,?,?,?,?,?,?,?,?)');

  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const title = (row[titleIdx] || '').trim();
      if (!title) { skipped++; continue; }
      const pick = (k, fallback) => { const j = idx(k); return j >= 0 ? row[j] : fallback; };
      insertTask.run(
        req.user.id,
        section,
        title,
        pick('description', '') || '',
        pick('status', 'to_start') || 'to_start',
        parseInt(pick('priority', '3')) || 3,
        pick('due_date', null) || null,
        pick('case_reference', null) || null,
        pick('client_name', null) || null,
        pick('court_date', null) || null,
        pick('goals', '') || ''
      );
      imported++;
    }
  });
  tx();

  res.json({ imported, skipped });
});

// ===== GLOBAL SEARCH =====

router.get('/search', authenticate, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ tasks: [], todos: [], events: [] });
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const likeQ = '%' + q.toLowerCase() + '%';
  const db = getDb();
  const tasks = db.prepare(`
    SELECT id, section, title, description, status, priority, due_date, archived, pinned, updated_at
    FROM tasks
    WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(goals) LIKE ?
      OR LOWER(IFNULL(case_reference,'')) LIKE ? OR LOWER(IFNULL(client_name,'')) LIKE ?)
    ORDER BY archived ASC, pinned DESC, updated_at DESC
    LIMIT ?
  `).all(req.user.id, likeQ, likeQ, likeQ, likeQ, likeQ, limit);
  const todos = db.prepare(`
    SELECT id, section, title, completed, date, dismissed
    FROM todos
    WHERE user_id = ? AND LOWER(title) LIKE ? AND dismissed = 0
    ORDER BY date DESC
    LIMIT ?
  `).all(req.user.id, likeQ, limit);
  const events = db.prepare(`
    SELECT id, section, title, description, date, time
    FROM events
    WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
    ORDER BY date DESC
    LIMIT ?
  `).all(req.user.id, likeQ, likeQ, limit);
  res.json({ tasks: attachTagsToTasks(tasks), todos, events });
});

// ===== SAVED VIEWS =====

router.get('/saved-views', authenticate, (req, res) => {
  const { section } = req.query;
  const db = getDb();
  const sql = section
    ? 'SELECT * FROM saved_views WHERE user_id = ? AND section = ? ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM saved_views WHERE user_id = ? ORDER BY section, sort_order ASC, created_at ASC';
  const rows = section ? db.prepare(sql).all(req.user.id, section) : db.prepare(sql).all(req.user.id);
  const views = rows.map(v => ({ ...v, filters: safeJsonParse(v.filters, {}) }));
  res.json({ views });
});

router.post('/saved-views', authenticate, (req, res) => {
  const { section, name, filters, view_type } = req.body;
  if (!section || !name) return res.status(400).json({ error: 'section and name required' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  const filtersJson = JSON.stringify(filters || {});
  const max = db.prepare('SELECT MAX(sort_order) as m FROM saved_views WHERE user_id = ? AND section = ?').get(req.user.id, section);
  const result = db.prepare('INSERT INTO saved_views (user_id, section, name, filters, view_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, section, name.trim(), filtersJson, view_type || 'list', (max?.m || 0) + 1
  );
  const view = db.prepare('SELECT * FROM saved_views WHERE id = ?').get(result.lastInsertRowid);
  res.json({ view: { ...view, filters: safeJsonParse(view.filters, {}) } });
});

router.put('/saved-views/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM saved_views WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const ups = []; const vals = [];
  if (req.body.name !== undefined) { ups.push('name = ?'); vals.push(req.body.name.trim()); }
  if (req.body.filters !== undefined) { ups.push('filters = ?'); vals.push(JSON.stringify(req.body.filters)); }
  if (req.body.view_type !== undefined) { ups.push('view_type = ?'); vals.push(req.body.view_type); }
  if (req.body.sort_order !== undefined) { ups.push('sort_order = ?'); vals.push(req.body.sort_order); }
  if (ups.length > 0) {
    vals.push(id, req.user.id);
    db.prepare('UPDATE saved_views SET ' + ups.join(', ') + ' WHERE id = ? AND user_id = ?').run(...vals);
  }
  const view = db.prepare('SELECT * FROM saved_views WHERE id = ?').get(id);
  res.json({ view: { ...view, filters: safeJsonParse(view.filters, {}) } });
});

router.delete('/saved-views/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM saved_views WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM saved_views WHERE id = ?').run(id);
  res.json({ success: true });
});

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

// ===== TEMPLATES =====

router.get('/templates', authenticate, (req, res) => {
  const { section } = req.query;
  const db = getDb();
  const sql = section
    ? 'SELECT * FROM task_templates WHERE user_id = ? AND section = ? ORDER BY created_at DESC'
    : 'SELECT * FROM task_templates WHERE user_id = ? ORDER BY section, created_at DESC';
  const rows = section ? db.prepare(sql).all(req.user.id, section) : db.prepare(sql).all(req.user.id);
  const templates = rows.map(t => ({
    ...t,
    subtasks: safeJsonParse(t.subtasks, []),
    tag_ids: safeJsonParse(t.tag_ids, []),
  }));
  res.json({ templates });
});

router.post('/templates', authenticate, (req, res) => {
  const { section, name, title, description, priority, goals, case_reference, client_name, subtasks, tag_ids } = req.body;
  if (!section || !name || !title) return res.status(400).json({ error: 'section, name and title required' });
  if (!['home', 'work', 'inbox'].includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO task_templates (user_id, section, name, title, description, priority, goals, case_reference, client_name, subtasks, tag_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, section, name.trim(), title.trim(),
    description || '', priority || 3, goals || '',
    case_reference || null, client_name || null,
    JSON.stringify(subtasks || []),
    JSON.stringify(tag_ids || [])
  );
  const tmpl = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(result.lastInsertRowid);
  res.json({
    template: {
      ...tmpl,
      subtasks: safeJsonParse(tmpl.subtasks, []),
      tag_ids: safeJsonParse(tmpl.tag_ids, []),
    }
  });
});

router.put('/templates/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM task_templates WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const allowed = ['name', 'title', 'description', 'priority', 'goals', 'case_reference', 'client_name'];
  const ups = []; const vals = [];
  for (const f of allowed) {
    if (req.body[f] !== undefined) { ups.push(f + ' = ?'); vals.push(req.body[f]); }
  }
  if (req.body.subtasks !== undefined) { ups.push('subtasks = ?'); vals.push(JSON.stringify(req.body.subtasks)); }
  if (req.body.tag_ids !== undefined) { ups.push('tag_ids = ?'); vals.push(JSON.stringify(req.body.tag_ids)); }
  if (ups.length > 0) {
    vals.push(id, req.user.id);
    db.prepare('UPDATE task_templates SET ' + ups.join(', ') + ' WHERE id = ? AND user_id = ?').run(...vals);
  }
  const tmpl = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
  res.json({
    template: {
      ...tmpl,
      subtasks: safeJsonParse(tmpl.subtasks, []),
      tag_ids: safeJsonParse(tmpl.tag_ids, []),
    }
  });
});

router.delete('/templates/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM task_templates WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM task_templates WHERE id = ?').run(id);
  res.json({ success: true });
});

// Instantiate a template into a real task (with subtasks + tags)
router.post('/templates/:id/instantiate', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const tmpl = db.prepare('SELECT * FROM task_templates WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!tmpl) return res.status(404).json({ error: 'Not found' });

  const targetSection = req.body.section || tmpl.section;
  if (!['home', 'work', 'inbox'].includes(targetSection)) return res.status(400).json({ error: 'Invalid section' });

  const overrides = req.body.overrides || {};
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO tasks (user_id, section, title, description, priority, goals, case_reference, client_name, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'to_start')
    `).run(
      req.user.id, targetSection,
      overrides.title || tmpl.title,
      overrides.description !== undefined ? overrides.description : tmpl.description,
      overrides.priority !== undefined ? overrides.priority : tmpl.priority,
      overrides.goals !== undefined ? overrides.goals : tmpl.goals,
      overrides.case_reference !== undefined ? overrides.case_reference : tmpl.case_reference,
      overrides.client_name !== undefined ? overrides.client_name : tmpl.client_name,
      overrides.due_date || null
    );
    const newTaskId = result.lastInsertRowid;

    const subs = safeJsonParse(tmpl.subtasks, []);
    let order = 0;
    for (const s of subs) {
      const title = typeof s === 'string' ? s : (s.title || '');
      if (!title) continue;
      db.prepare('INSERT INTO subtasks (task_id, title, sort_order) VALUES (?, ?, ?)').run(newTaskId, title, order++);
    }

    const tagIds = safeJsonParse(tmpl.tag_ids, []);
    for (const tid of tagIds) {
      const tagOwned = db.prepare('SELECT id FROM tags WHERE id = ? AND user_id = ? AND section = ?').get(tid, req.user.id, targetSection);
      if (tagOwned) {
        try {
          db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(newTaskId, tid);
        } catch (e) {}
      }
    }

    logActivity(newTaskId, req.user.id, 'created', `From template: ${tmpl.name}`);
    return newTaskId;
  });
  const newTaskId = tx();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
  res.json({ task: attachTagsToTasks([task])[0] });
});

// ===== POMODORO (FOCUS SESSIONS) =====

// Start a session — records start timestamp, returns session row
router.post('/focus/start', authenticate, (req, res) => {
  const { task_id, kind, duration_seconds } = req.body;
  if (!duration_seconds || duration_seconds < 1) return res.status(400).json({ error: 'duration_seconds required' });
  const theKind = ['work', 'break', 'long_break'].includes(kind) ? kind : 'work';
  const db = getDb();
  if (task_id) {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(task_id, req.user.id);
    if (!task) return res.status(400).json({ error: 'Invalid task_id' });
  }
  const result = db.prepare(`
    INSERT INTO focus_sessions (user_id, task_id, kind, duration_seconds, completed)
    VALUES (?, ?, ?, ?, 0)
  `).run(req.user.id, task_id || null, theKind, duration_seconds);
  const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.json({ session });
});

// Mark a session finished — completed=1 if the full duration elapsed, else 0 (aborted)
router.put('/focus/:id/finish', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const completed = req.body.completed ? 1 : 0;
  const db = getDb();
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  if (ex.ended_at) return res.json({ session: ex }); // already finished, idempotent
  db.prepare("UPDATE focus_sessions SET ended_at = CURRENT_TIMESTAMP, completed = ? WHERE id = ?").run(completed, id);
  const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
  if (completed && ex.task_id && ex.kind === 'work') {
    logActivity(ex.task_id, req.user.id, 'focus_session', `${Math.round(ex.duration_seconds / 60)}min session`);
  }
  res.json({ session });
});

// Recent sessions (history)
router.get('/focus/recent', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const db = getDb();
  const sessions = db.prepare(`
    SELECT fs.*, t.title as task_title, t.section as task_section
    FROM focus_sessions fs
    LEFT JOIN tasks t ON fs.task_id = t.id
    WHERE fs.user_id = ?
    ORDER BY fs.started_at DESC
    LIMIT ?
  `).all(req.user.id, limit);
  res.json({ sessions });
});

// Today's stats (sessions completed, total minutes)
router.get('/focus/today', authenticate, (req, res) => {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString().slice(0, 19).replace('T', ' ');
  const rows = db.prepare(`
    SELECT * FROM focus_sessions
    WHERE user_id = ? AND started_at >= ? AND completed = 1 AND kind = 'work'
  `).all(req.user.id, todayIso);
  const totalSeconds = rows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  res.json({
    sessions_completed: rows.length,
    total_minutes: Math.round(totalSeconds / 60),
    total_seconds: totalSeconds,
  });
});

// ===== TODAY SUMMARY =====

router.get('/today-summary', authenticate, (req, res) => {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayStartIso = yesterdayStr + ' 00:00:00';
  const todayStartIso = today + ' 00:00:00';

  // Tasks due today, not done
  const tasksDueToday = db.prepare(`
    SELECT id, section, title, priority, status, due_date, due_time, pinned
    FROM tasks
    WHERE user_id = ? AND archived = 0 AND status != 'done' AND due_date = ?
    ORDER BY priority DESC, due_time ASC
  `).all(req.user.id, today);

  // Overdue tasks
  const overdue = db.prepare(`
    SELECT id, section, title, priority, status, due_date
    FROM tasks
    WHERE user_id = ? AND archived = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date < ?
    ORDER BY due_date ASC
    LIMIT 10
  `).all(req.user.id, today);

  // Todos for today
  const todos = db.prepare(`
    SELECT id, section, title, completed, date
    FROM todos
    WHERE user_id = ? AND date = ? AND dismissed = 0
    ORDER BY completed ASC, id ASC
  `).all(req.user.id, today);

  // Events today
  const events = db.prepare(`
    SELECT id, section, title, description, date, time
    FROM events
    WHERE user_id = ? AND date = ?
    ORDER BY time ASC
  `).all(req.user.id, today);

  // Completed yesterday
  const yesterdayCompleted = db.prepare(`
    SELECT id, section, title FROM tasks
    WHERE user_id = ? AND status = 'done' AND updated_at >= ? AND updated_at < ?
    ORDER BY updated_at DESC
    LIMIT 20
  `).all(req.user.id, yesterdayStartIso, todayStartIso);

  // Pomodoro sessions today
  const focusToday = db.prepare(`
    SELECT duration_seconds FROM focus_sessions
    WHERE user_id = ? AND started_at >= ? AND completed = 1 AND kind = 'work'
  `).all(req.user.id, todayStartIso);
  const focusMinutesToday = Math.round(focusToday.reduce((s, r) => s + r.duration_seconds, 0) / 60);

  res.json({
    today,
    tasks_due_today: tasksDueToday,
    overdue,
    todos,
    events,
    yesterday_completed: yesterdayCompleted,
    focus_sessions_today: focusToday.length,
    focus_minutes_today: focusMinutesToday,
  });
});

// ===== CALENDAR RANGE QUERY =====
// Aggregates tasks + todos + events across a date range in one call, keyed by date.
router.get('/calendar', authenticate, (req, res) => {
  const { start, end, section } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end (YYYY-MM-DD) required' });
  const db = getDb();
  const secFilter = section ? 'AND section = ?' : '';
  const secParam = section ? [section] : [];

  const tasks = db.prepare(`
    SELECT id, section, title, priority, status, due_date, due_time, pinned
    FROM tasks
    WHERE user_id = ? AND archived = 0 AND due_date IS NOT NULL
      AND due_date >= ? AND due_date <= ? ${secFilter}
    ORDER BY due_date ASC, priority DESC
  `).all(req.user.id, start, end, ...secParam);

  const todos = db.prepare(`
    SELECT id, section, title, completed, date
    FROM todos
    WHERE user_id = ? AND dismissed = 0 AND date >= ? AND date <= ? ${secFilter}
    ORDER BY date ASC
  `).all(req.user.id, start, end, ...secParam);

  const events = db.prepare(`
    SELECT id, section, title, date, time
    FROM events
    WHERE user_id = ? AND date >= ? AND date <= ? ${secFilter}
    ORDER BY date ASC, time ASC
  `).all(req.user.id, start, end, ...secParam);

  res.json({ tasks, todos, events });
});

module.exports = router;
