const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./db');
const { authenticate } = require('./auth');
const { PRESETS, ICON_SET, COLOR_SET, getPreset } = require('./onboarding-presets');

const router = express.Router();

// ───────────────────────────────────────────────────────────────────────────
// Soft-delete support
// Tasks/todos/events/tags carry a deleted_at timestamp. Setting it hides the
// row from API responses immediately (so the user's UI updates). If not
// undone within the 10-second window, purgeExpiredDeletions() hard-deletes
// the row — cascades fire then (subtasks, files, task_notes, etc.).
// ───────────────────────────────────────────────────────────────────────────
const UNDO_WINDOW_SECONDS = 10;
let lastPurgeAt = 0;

function purgeExpiredDeletions() {
  // Rate-limit: don't run more than once every 2 seconds across the whole
  // process. The worst case delay between soft and hard delete is
  // UNDO_WINDOW_SECONDS + 2, which is fine.
  const now = Date.now();
  if (now - lastPurgeAt < 2000) return;
  lastPurgeAt = now;
  const db = getDb();
  const cutoff = `datetime('now', '-${UNDO_WINDOW_SECONDS} seconds')`;
  try {
    db.exec(`
      DELETE FROM tasks  WHERE deleted_at IS NOT NULL AND deleted_at <= ${cutoff};
      DELETE FROM todos  WHERE deleted_at IS NOT NULL AND deleted_at <= ${cutoff};
      DELETE FROM events WHERE deleted_at IS NOT NULL AND deleted_at <= ${cutoff};
      DELETE FROM tags   WHERE deleted_at IS NOT NULL AND deleted_at <= ${cutoff};
    `);
  } catch (e) {
    console.error('[purge] failed:', e.message);
  }
}

// Filter an array of rows, removing any with deleted_at set. Used at the
// response layer so we don't have to patch every SQL query with
// `AND deleted_at IS NULL`. Applied to list endpoints.
function filterDeleted(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.filter(r => !r || r.deleted_at == null);
}

// Middleware: purge expired soft-deletes at the start of every authenticated
// request. Cheap when rate-limited, catches everything within ~12s.
router.use((req, res, next) => {
  purgeExpiredDeletions();
  next();
});

// ───────────────────────────────────────────────────────────────────────────
// File upload config
// ───────────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

// Closed vocabulary of activity_log.action values — see activity-actions.js.
// Lives in server/ alongside this file so it's copied by the Dockerfile's
// `COPY server/*.js ./server/` glob into the running container. The SAME
// file is also pushed to client-src/src/ on deploy so the frontend Timeline
// reads identical classification via import. Source of truth is
// server/activity-actions.js.
const ACTIVITY_ACTIONS = require('./activity-actions');

function logActivity(taskId, userId, action, details) {
  if (!Object.prototype.hasOwnProperty.call(ACTIVITY_ACTIONS, action)) {
    // Fail-open in prod (don't break the surrounding write), fail-loud in
    // dev so whoever added the new action notices immediately.
    const msg = `[activity-actions] unknown action "${action}" — add it to activity-actions.json`;
    if (process.env.NODE_ENV === 'production') console.warn(msg);
    else throw new Error(msg);
  }
  const db = getDb();
  db.prepare('INSERT INTO activity_log (task_id, user_id, action, details) VALUES (?, ?, ?, ?)').run(taskId, userId, action, details);
}

function getTagsForTask(taskId) {
  const db = getDb();
  return db.prepare('SELECT * FROM tags WHERE id IN (SELECT tag_id FROM task_tags WHERE task_id = ?) ORDER BY name ASC').all(taskId);
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

// ───────────────────────────────────────────────────────────────────────────
// Custom fields: seed preset defaults when a new space is created
// Idempotent — skips any field_key already present for that space.
// ───────────────────────────────────────────────────────────────────────────
function seedDefaultFieldsForSpace(userId, spaceId, presetId) {
  const preset = getPreset(presetId);
  if (!preset || !preset.default_fields || preset.default_fields.length === 0) return;
  const db = getDb();
  const existing = db.prepare('SELECT field_key FROM custom_field_definitions WHERE user_id = ? AND space_id = ?').all(userId, spaceId);
  const existingKeys = new Set(existing.map(r => r.field_key));
  const insert = db.prepare(`
    INSERT INTO custom_field_definitions
      (user_id, space_id, field_key, label, type, options, sort_order, show_in_list, show_in_create, is_client_identifier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  preset.default_fields.forEach((f, i) => {
    if (existingKeys.has(f.key)) return;
    const optsJson = f.options ? JSON.stringify(f.options) : null;
    // Heuristic: first two fields peek in list view and show on create modal.
    const showInList = i < 2 ? 1 : 0;
    const showInCreate = i < 2 ? 1 : 0;
    const isClientId = f.client_identifier ? 1 : 0;
    insert.run(userId, spaceId, f.key, f.label, f.type, optsJson, i, showInList, showInCreate, isClientId);
  });
}

// One-shot migration — runs on first request per process for each user-space.
// Seeds preset defaults for any pre-existing space that has no field
// definitions yet. After the first successful pass, we mark the user as
// migrated via a sentinel key so we don't rescan on every request.
const customFieldMigrationDone = new Set();
function runCustomFieldBackfillOnce(userId) {
  if (customFieldMigrationDone.has(userId)) return;
  customFieldMigrationDone.add(userId);
  try {
    const db = getDb();
    const spaces = db.prepare('SELECT id, preset FROM spaces WHERE user_id = ?').all(userId);
    for (const s of spaces) {
      const cnt = db.prepare('SELECT COUNT(*) AS n FROM custom_field_definitions WHERE user_id = ? AND space_id = ?').get(userId, s.id);
      if (cnt.n === 0 && s.preset) {
        seedDefaultFieldsForSpace(userId, s.id, s.preset);
      }
    }
  } catch (e) {
    console.error('[custom-field backfill] failed for user', userId, e.message);
    customFieldMigrationDone.delete(userId); // allow retry
  }
}

// Verify a space belongs to the current user. Returns the space row or null.
function getUserSpace(userId, spaceId) {
  const db = getDb();
  const id = parseInt(spaceId);
  if (!Number.isFinite(id)) return null;
  return db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ? AND archived = 0').get(id, userId);
}

function requireSpace(req, res, spaceId) {
  const space = getUserSpace(req.user.id, spaceId);
  if (!space) { res.status(404).json({ error: 'Space not found' }); return null; }
  return space;
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPACES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/spaces', authenticate, (req, res) => {
  const db = getDb();
  const spaces = db.prepare('SELECT * FROM spaces WHERE user_id = ? AND archived = 0 ORDER BY sort_order ASC, id ASC').all(req.user.id);
  res.json({ spaces });
});

router.get('/spaces/archived', authenticate, (req, res) => {
  const db = getDb();
  const spaces = db.prepare('SELECT * FROM spaces WHERE user_id = ? AND archived = 1 ORDER BY sort_order ASC, id ASC').all(req.user.id);
  res.json({ spaces });
});

router.get('/spaces/:id', authenticate, (req, res) => {
  const space = getUserSpace(req.user.id, req.params.id);
  if (!space) return res.status(404).json({ error: 'Not found' });
  res.json({ space });
});

router.post('/spaces', authenticate, (req, res) => {
  const { name, icon, color, preset, visible } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (!icon || !ICON_SET.includes(icon)) return res.status(400).json({ error: 'Invalid icon' });
  if (!color || !COLOR_SET.includes(color)) return res.status(400).json({ error: 'Invalid color' });

  const db = getDb();
  const max = db.prepare('SELECT MAX(sort_order) as m FROM spaces WHERE user_id = ?').get(req.user.id);
  try {
    const result = db.prepare(
      'INSERT INTO spaces (user_id, name, icon, color, preset, sort_order, visible) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      req.user.id, name.trim(), icon, color, preset || null, (max?.m || 0) + 1, visible === 0 ? 0 : 1
    );
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(result.lastInsertRowid);
    // Seed preset's default fields for the new space.
    if (preset) {
      try { seedDefaultFieldsForSpace(req.user.id, space.id, preset); }
      catch (e) { console.error('[space create] field seed failed:', e.message); }
    }
    res.json({ space });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'A space with that name already exists' });
    throw err;
  }
});

router.put('/spaces/:id', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  const db = getDb();

  const allowed = ['name', 'icon', 'color', 'visible', 'sort_order'];
  const ups = []; const vals = [];
  for (const f of allowed) {
    if (req.body[f] === undefined) continue;
    if (f === 'icon' && !ICON_SET.includes(req.body[f])) return res.status(400).json({ error: 'Invalid icon' });
    if (f === 'color' && !COLOR_SET.includes(req.body[f])) return res.status(400).json({ error: 'Invalid color' });
    if (f === 'name' && (!req.body[f] || !String(req.body[f]).trim())) return res.status(400).json({ error: 'Name cannot be empty' });
    ups.push(`${f} = ?`);
    vals.push(f === 'name' ? String(req.body[f]).trim() : req.body[f]);
  }
  if (ups.length === 0) return res.json({ space });

  vals.push(space.id, req.user.id);
  try {
    db.prepare(`UPDATE spaces SET ${ups.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
    const updated = db.prepare('SELECT * FROM spaces WHERE id = ?').get(space.id);
    res.json({ space: updated });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'A space with that name already exists' });
    throw err;
  }
});

// Soft archive (sets archived=1). Child tasks remain but are hidden with the space.
router.delete('/spaces/:id', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  const db = getDb();
  db.prepare('UPDATE spaces SET archived = 1 WHERE id = ? AND user_id = ?').run(space.id, req.user.id);
  // If this was the quick capture target, clear it.
  db.prepare('UPDATE user_preferences SET quick_capture_space_id = NULL WHERE user_id = ? AND quick_capture_space_id = ?').run(req.user.id, space.id);
  res.json({ success: true });
});

router.post('/spaces/:id/unarchive', authenticate, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!space) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE spaces SET archived = 0 WHERE id = ? AND user_id = ?').run(id, req.user.id);
  const updated = db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
  res.json({ space: updated });
});

router.put('/spaces/reorder', authenticate, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids[] required' });
  const db = getDb();
  const stmt = db.prepare('UPDATE spaces SET sort_order = ? WHERE id = ? AND user_id = ?');
  const tx = db.transaction((items) => {
    items.forEach((id, idx) => stmt.run(idx, id, req.user.id));
  });
  tx(ids);
  res.json({ success: true });
});

// Hard-delete a space and all its content (tasks, todos, events, notes, tags,
// saved_views, task_templates cascade via FK). Destructive, used from the
// Danger Zone in settings.
router.delete('/spaces/:id/hard', authenticate, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!space) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE user_preferences SET quick_capture_space_id = NULL WHERE user_id = ? AND quick_capture_space_id = ?').run(req.user.id, id);
  db.prepare('UPDATE user_preferences SET last_active_space_id = NULL WHERE user_id = ? AND last_active_space_id = ?').run(req.user.id, id);
  db.prepare('DELETE FROM spaces WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════

router.get('/user/onboarding-status', authenticate, (req, res) => {
  const db = getDb();
  const pref = db.prepare('SELECT onboarding_complete FROM user_preferences WHERE user_id = ?').get(req.user.id);
  res.json({ complete: pref?.onboarding_complete === 1 });
});

router.post('/user/restart-onboarding', authenticate, (req, res) => {
  const db = getDb();
  const ex = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(req.user.id);
  if (ex) {
    db.prepare('UPDATE user_preferences SET onboarding_complete = 0 WHERE user_id = ?').run(req.user.id);
  } else {
    db.prepare('INSERT INTO user_preferences (user_id, onboarding_complete) VALUES (?, 0)').run(req.user.id);
  }
  res.json({ success: true });
});

// Available preset metadata for the wizard UI.
router.get('/onboarding/presets', authenticate, (req, res) => {
  // Strip the default_fields from the response for Deploy 1 (not used yet).
  const lite = PRESETS.map(p => ({
    preset: p.preset, name: p.name, icon: p.icon, color: p.color, description: p.description,
  }));
  res.json({ presets: lite, icons: ICON_SET, colors: COLOR_SET });
});

// Bulk-create spaces from the wizard. Body:
//   { spaces: [{ preset, name?, icon?, color?, visible? }, ...],
//     quick_capture_preset: 'personal' }   // preset id from the list above
router.post('/spaces/onboard', authenticate, (req, res) => {
  const { spaces, quick_capture_preset } = req.body;
  if (!Array.isArray(spaces) || spaces.length === 0) {
    return res.status(400).json({ error: 'At least one space required' });
  }

  const db = getDb();
  const insertStmt = db.prepare(
    'INSERT INTO spaces (user_id, name, icon, color, preset, sort_order, visible) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  // Build a list of rows to insert with validation before touching the DB.
  const rows = [];
  for (let i = 0; i < spaces.length; i++) {
    const s = spaces[i] || {};
    const preset = s.preset ? getPreset(s.preset) : null;
    const name = (s.name || preset?.name || '').toString().trim();
    const icon = s.icon || preset?.icon || 'sparkles';
    const color = s.color || preset?.color || '#64748B';
    if (!name) return res.status(400).json({ error: `Space ${i + 1} has no name` });
    if (!ICON_SET.includes(icon)) return res.status(400).json({ error: `Space ${i + 1}: invalid icon "${icon}"` });
    if (!COLOR_SET.includes(color)) return res.status(400).json({ error: `Space ${i + 1}: invalid color "${color}"` });
    rows.push({
      name, icon, color,
      preset: preset ? preset.preset : null,
      visible: s.visible === 0 ? 0 : 1,
      sort_order: i,
      _requestedPreset: s.preset || null,
    });
  }

  let createdSpaces = [];
  let quickCaptureId = null;
  try {
    const tx = db.transaction(() => {
      for (const r of rows) {
        const result = insertStmt.run(req.user.id, r.name, r.icon, r.color, r.preset, r.sort_order, r.visible);
        const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(result.lastInsertRowid);
        createdSpaces.push(space);
      }

      // Figure out which space is the quick capture target.
      if (quick_capture_preset) {
        const match = createdSpaces.find(s => s.preset === quick_capture_preset);
        if (match) quickCaptureId = match.id;
      }
      // Fallback: first space.
      if (!quickCaptureId && createdSpaces.length > 0) {
        quickCaptureId = createdSpaces[0].id;
      }

      // Upsert preferences.
      const prefEx = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(req.user.id);
      if (prefEx) {
        db.prepare('UPDATE user_preferences SET onboarding_complete = 1, quick_capture_space_id = ?, last_active_space_id = COALESCE(last_active_space_id, ?) WHERE user_id = ?')
          .run(quickCaptureId, quickCaptureId, req.user.id);
      } else {
        db.prepare('INSERT INTO user_preferences (user_id, onboarding_complete, quick_capture_space_id, last_active_space_id) VALUES (?, 1, ?, ?)')
          .run(req.user.id, quickCaptureId, quickCaptureId);
      }
    });
    tx();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'One of the names you chose is already used by another space. Rename it and try again.' });
    }
    throw err;
  }

  // Seed custom field definitions from each preset — outside the transaction
  // so a seed failure doesn't block space creation itself.
  for (const s of createdSpaces) {
    if (s.preset) {
      try { seedDefaultFieldsForSpace(req.user.id, s.id, s.preset); }
      catch (e) { console.error('[onboard] field seed failed for space', s.id, e.message); }
    }
  }

  res.json({ spaces: createdSpaces, quick_capture_space_id: quickCaptureId });
});

// ═══════════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/tasks', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? AND space_id = ? AND archived = 0 ORDER BY pinned DESC, sort_order ASC, updated_at DESC').all(req.user.id, space.id);
  // Phase C — compute blocked set in one query. A task is "blocked" if any
  // of its dependencies is not done (and is not itself soft-deleted).
  const blockedRows = db.prepare(`
    SELECT DISTINCT d.task_id
    FROM task_dependencies d
    JOIN tasks t ON t.id = d.depends_on_task_id
    JOIN tasks self ON self.id = d.task_id
    WHERE self.user_id = ? AND self.space_id = ?
      AND t.status != 'done' AND t.deleted_at IS NULL
  `).all(req.user.id, space.id);
  const blocked = new Set(blockedRows.map(r => r.task_id));
  // Phase C Batch 3 — attach custom field values as { field_id → value } per
  // task so client-side filtering (Clients tab) and future features (kanban
  // colouring by field, etc.) have the data without a second round trip.
  // Single grouped query rather than N+1.
  const fieldValsByTask = {};
  const filteredKept = filterDeleted(tasks);
  const keptIds = filteredKept.map(t => t.id);
  if (keptIds.length > 0) {
    const placeholders = keptIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT task_id, field_id, value FROM custom_field_values WHERE task_id IN (${placeholders})`).all(...keptIds);
    for (const r of rows) {
      if (!fieldValsByTask[r.task_id]) fieldValsByTask[r.task_id] = {};
      fieldValsByTask[r.task_id][r.field_id] = r.value;
    }
  }
  const decorated = attachTagsToTasks(filteredKept).map(t => ({
    ...t,
    blocked: blocked.has(t.id),
    custom_fields: fieldValsByTask[t.id] || {},
  }));
  res.json({ tasks: decorated });
});

router.get('/tasks/archived/list', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? AND space_id = ? AND archived = 1 ORDER BY updated_at DESC').all(req.user.id, space.id);
  res.json({ tasks: attachTagsToTasks(filterDeleted(tasks)) });
});

// Weekly review is cross-space by default. Optional ?space_id= narrows it.
router.get('/tasks/weekly/review', authenticate, (req, res) => {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAhead = new Date(now); weekAhead.setDate(weekAhead.getDate() + 7);
  const todayStr = now.toISOString().split('T')[0];
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  const weekAheadStr = weekAhead.toISOString().split('T')[0];

  let spaceFilter = '';
  const bind = [req.user.id];
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    spaceFilter = ' AND space_id = ?';
    bind.push(space.id);
  }

  const db = getDb();
  const completedThisWeek = filterDeleted(db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND status = 'done' AND updated_at >= ?${spaceFilter} ORDER BY updated_at DESC`).all(...bind, weekAgoStr));
  const overdue = filterDeleted(db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND archived = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date < ?${spaceFilter} ORDER BY due_date ASC`).all(...bind, todayStr));
  const upcoming = filterDeleted(db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND archived = 0 AND status != 'done' AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ?${spaceFilter} ORDER BY due_date ASC`).all(...bind, todayStr, weekAheadStr));

  // Todos for the review use the same scope.
  const todosCompleted = filterDeleted(db.prepare(`SELECT * FROM todos WHERE user_id = ? AND completed = 1 AND date >= ?${spaceFilter}`).all(...bind, weekAgoStr));
  const todosTotal = filterDeleted(db.prepare(`SELECT * FROM todos WHERE user_id = ? AND date >= ?${spaceFilter}`).all(...bind, weekAgoStr));

  res.json({
    completedThisWeek,
    overdue,
    upcoming,
    todoCompletionRate: todosTotal.length > 0 ? Math.round((todosCompleted.length / todosTotal.length) * 100) : 0,
    todosCompleted: todosCompleted.length,
    todosTotal: todosTotal.length,
  });
});

router.put('/tasks/reorder', authenticate, (req, res) => {
  const { space_id, ids } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids[] required' });
  const db = getDb();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ? AND user_id = ? AND space_id = ?');
  const tx = db.transaction((items) => {
    items.forEach((id, idx) => stmt.run(idx, id, req.user.id, space.id));
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
  // Phase C — dependencies this task waits on, plus incoming (who waits on it).
  const dependencies = db.prepare(`
    SELECT t.id, t.title, t.status, d.id AS dep_id
    FROM task_dependencies d
    JOIN tasks t ON t.id = d.depends_on_task_id
    WHERE d.task_id = ? AND t.deleted_at IS NULL
    ORDER BY t.title
  `).all(task.id);
  const dependents = db.prepare(`
    SELECT t.id, t.title, t.status
    FROM task_dependencies d
    JOIN tasks t ON t.id = d.task_id
    WHERE d.depends_on_task_id = ? AND t.deleted_at IS NULL
    ORDER BY t.title
  `).all(task.id);
  // Phase C — time entries for this task. active session has ended_at=NULL.
  const timeEntries = db.prepare(`
    SELECT * FROM time_entries WHERE task_id = ? ORDER BY started_at DESC
  `).all(task.id);
  const totalSeconds = timeEntries.reduce((acc, e) => acc + (e.duration_seconds || 0), 0);
  res.json({
    task: { ...task, tags },
    subtasks, notes, files, activity, tags,
    dependencies, dependents,
    timeEntries, totalSeconds,
  });
});

router.post('/tasks', authenticate, (req, res) => {
  const { space_id, title, description, status, priority, due_date, due_time, goals } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO tasks (user_id,space_id,title,description,status,priority,due_date,due_time,goals) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(
    req.user.id, space.id, title, description || '', status || 'to_start', priority || 3,
    due_date || null, due_time || null, goals || ''
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

  // Phase C: if this transition sets status=done, verify all dependencies
  // are done too. Reject with 409 so the client can show a useful toast.
  if (req.body.status === 'done' && ex.status !== 'done') {
    const blockers = db.prepare(`
      SELECT t.id, t.title, t.status
      FROM task_dependencies d
      JOIN tasks t ON t.id = d.depends_on_task_id
      WHERE d.task_id = ? AND t.status != 'done' AND t.deleted_at IS NULL
    `).all(id);
    if (blockers.length > 0) {
      return res.status(409).json({
        error: 'Cannot complete: waiting on ' + blockers.map(b => b.title).join(', '),
        code: 'BLOCKED_BY_DEPENDENCIES',
        blockers,
      });
    }
  }

  const fields = ['title', 'description', 'status', 'priority', 'due_date', 'due_time', 'pinned', 'archived', 'sort_order', 'goals', 'space_id'];
  const ups = []; const vals = [];
  for (const f of fields) {
    if (req.body[f] === undefined) continue;
    if (f === 'space_id') {
      const target = getUserSpace(req.user.id, req.body[f]);
      if (!target) return res.status(400).json({ error: 'Invalid target space' });
      if (target.id !== ex.space_id) logActivity(id, req.user.id, 'moved', `Moved to ${target.name}`);
    }
    ups.push(`${f} = ?`); vals.push(req.body[f]);
    if (f === 'status' && req.body[f] !== ex[f]) logActivity(id, req.user.id, 'status_changed', 'Changed to ' + req.body[f]);
    if (f === 'archived' && req.body[f] === 1 && ex[f] !== 1) logActivity(id, req.user.id, 'archived', 'Archived');
    if (f === 'pinned' && req.body[f] !== ex[f]) logActivity(id, req.user.id, req.body[f] ? 'pinned' : 'unpinned', req.body[f] ? 'Pinned' : 'Unpinned');
    if (f === 'title' && req.body[f] !== ex.title) logActivity(id, req.user.id, 'edited', 'Title changed');
    if (f === 'description' && req.body[f] !== ex.description) logActivity(id, req.user.id, 'edited', 'Description updated');
    if (f === 'goals' && req.body[f] !== ex.goals) logActivity(id, req.user.id, 'edited', 'Goals updated');
    if (f === 'priority' && req.body[f] !== ex.priority) logActivity(id, req.user.id, 'edited', 'Priority changed to ' + req.body[f]);
    if (f === 'due_date' && req.body[f] !== ex.due_date) logActivity(id, req.user.id, 'edited', 'Due date changed to ' + (req.body[f] || 'none'));
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

// ═══════════════════════════════════════════════════════════════════════════
// SOFT DELETE + UNDO
// Feature A1 — task/todo/event/tag soft delete with 10-second undo window.
// Rows are marked with deleted_at; purgeExpiredDeletions() hard-deletes
// after UNDO_WINDOW_SECONDS.
// ═══════════════════════════════════════════════════════════════════════════

// TASK: soft delete (only allowed on archived tasks — belt and braces)
router.delete('/tasks/:id/soft', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Task not found' });
  if (!ex.archived) return res.status(400).json({ error: 'Archive the task before deleting it' });
  db.prepare('UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  logActivity(id, req.user.id, 'deleted', `Soft-deleted: ${ex.title}`);
  res.json({ id, deleted: true, undo_window_seconds: UNDO_WINDOW_SECONDS });
});

router.post('/tasks/:id/undo-delete', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Nothing to undo (already purged or not deleted)' });
  db.prepare('UPDATE tasks SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  logActivity(id, req.user.id, 'undeleted', `Undid delete: ${ex.title}`);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json({ task });
});

// TODO: soft delete (todos don't have archive; direct delete)
router.delete('/todos/:id/soft', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Todo not found' });
  db.prepare('UPDATE todos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ id, deleted: true, undo_window_seconds: UNDO_WINDOW_SECONDS });
});

router.post('/todos/:id/undo-delete', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Nothing to undo' });
  db.prepare('UPDATE todos SET deleted_at = NULL WHERE id = ? AND user_id = ?').run(id, req.user.id);
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ todo });
});

// EVENT: soft delete
router.delete('/events/:id/soft', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Event not found' });
  db.prepare('UPDATE events SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ id, deleted: true, undo_window_seconds: UNDO_WINDOW_SECONDS });
});

router.post('/events/:id/undo-delete', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Nothing to undo' });
  db.prepare('UPDATE events SET deleted_at = NULL WHERE id = ? AND user_id = ?').run(id, req.user.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  res.json({ event });
});

// TAG: soft delete
router.delete('/tags/:id/soft', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Tag not found' });
  db.prepare('UPDATE tags SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ id, deleted: true, undo_window_seconds: UNDO_WINDOW_SECONDS });
});

router.post('/tags/:id/undo-delete', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Nothing to undo' });
  db.prepare('UPDATE tags SET deleted_at = NULL WHERE id = ? AND user_id = ?').run(id, req.user.id);
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  res.json({ tag });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUICK CAPTURE — routes to user's designated quick_capture_space_id
// ═══════════════════════════════════════════════════════════════════════════

router.post('/quick-capture', authenticate, (req, res) => {
  const { title, due_date, due_time, priority } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });

  const db = getDb();
  const pref = db.prepare('SELECT quick_capture_space_id FROM user_preferences WHERE user_id = ?').get(req.user.id);
  const targetId = pref?.quick_capture_space_id;
  if (!targetId) {
    return res.status(400).json({
      error: 'No quick capture target configured',
      code: 'no_quick_capture_space',
      message: 'Go to Settings and pick a space to receive quick-captured tasks.',
    });
  }
  const space = getUserSpace(req.user.id, targetId);
  if (!space) {
    // Target space was archived/deleted. Clear the stale preference.
    db.prepare('UPDATE user_preferences SET quick_capture_space_id = NULL WHERE user_id = ?').run(req.user.id);
    return res.status(400).json({
      error: 'Quick capture target no longer exists',
      code: 'stale_quick_capture_space',
      message: 'Your quick capture target was deleted. Pick a new one in Settings.',
    });
  }

  const result = db.prepare(
    'INSERT INTO tasks (user_id,space_id,title,priority,due_date,due_time) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, space.id, title.trim(), priority || 3, due_date || null, due_time || null);
  logActivity(result.lastInsertRowid, req.user.id, 'created', `Quick-captured to ${space.name}`);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.json({ task: { ...task, tags: [] }, space });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBTASKS / TASK NOTES / FILES — unchanged from pre-2C (scoped via task)
// ═══════════════════════════════════════════════════════════════════════════

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

// Batch upload — up to 20 files in one request, inserts atomically.
// Frontend uses this for multi-file pickers and (eventually) drag-drop.
router.post('/tasks/:id/files/batch', authenticate, upload.array('files', 20), (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const insert = db.prepare('INSERT INTO task_files (task_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)');
  const selectById = db.prepare('SELECT * FROM task_files WHERE id = ?');

  const insertAll = db.transaction((incoming) => {
    const created = [];
    for (const f of incoming) {
      const r = insert.run(taskId, f.filename, f.originalname, f.mimetype, f.size);
      created.push(selectById.get(r.lastInsertRowid));
    }
    return created;
  });

  const files = insertAll(req.files);
  // One activity log entry summarising the batch rather than N rows.
  logActivity(
    taskId,
    req.user.id,
    'files_uploaded',
    files.length === 1
      ? 'File uploaded: ' + files[0].original_name
      : files.length + ' files uploaded: ' + files.map(f => f.original_name).join(', ')
  );
  res.json({ files });
});

router.delete('/files/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const file = db.prepare('SELECT f.*, t.user_id FROM task_files f JOIN tasks t ON f.task_id = t.id WHERE f.id = ?').get(id);
  if (!file || file.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(__dirname, '..', 'uploads', file.filename);
  if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (_) {} }
  db.prepare('DELETE FROM task_files WHERE id = ?').run(id);
  logActivity(file.task_id, req.user.id, 'file_deleted', 'File deleted: ' + file.original_name);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════════════════

router.get('/tasks/:id/activity', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const activity = db.prepare('SELECT * FROM activity_log WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
  res.json({ activity });
});

// Cross-space recent activity for the landing page.
// Optional ?space_id= narrows to one space. Returns space metadata for each entry.
router.get('/activity/recent', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const db = getDb();
  let rows;
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    rows = db.prepare(`
      SELECT a.*, t.title AS task_title, t.space_id AS task_space_id,
             s.name AS space_name, s.color AS space_color, s.icon AS space_icon
      FROM activity_log a
      JOIN tasks t ON a.task_id = t.id
      LEFT JOIN spaces s ON t.space_id = s.id
      WHERE a.user_id = ?
        AND t.space_id = ?
        AND t.deleted_at IS NULL
        AND (s.archived IS NULL OR s.archived = 0)
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(req.user.id, space.id, limit);
  } else {
    rows = db.prepare(`
      SELECT a.*, t.title AS task_title, t.space_id AS task_space_id,
             s.name AS space_name, s.color AS space_color, s.icon AS space_icon
      FROM activity_log a
      JOIN tasks t ON a.task_id = t.id
      LEFT JOIN spaces s ON t.space_id = s.id
      WHERE a.user_id = ?
        AND t.deleted_at IS NULL
        AND (s.archived IS NULL OR s.archived = 0)
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(req.user.id, limit);
  }
  res.json({ activity: rows });
});

// ═══════════════════════════════════════════════════════════════════════════
// TODOS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/todos', authenticate, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date required' });
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ? AND space_id = ? AND dismissed = 0 AND (date = ? OR (date <= ? AND completed = 0)) ORDER BY created_at ASC').all(req.user.id, space.id, date, date);
  res.json({ todos: filterDeleted(todos) });
});

router.post('/todos', authenticate, (req, res) => {
  const { space_id, title, date, is_recurring, recurrence_interval, recurrence_unit } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO todos (user_id,space_id,title,date,is_recurring,recurrence_interval,recurrence_unit) VALUES (?,?,?,?,?,?,?)'
  ).run(req.user.id, space.id, title, date, is_recurring || 0, recurrence_interval || null, recurrence_unit || null);
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
      db.prepare('INSERT INTO todos (user_id,space_id,title,date,is_recurring,recurrence_interval,recurrence_unit,recurrence_parent_id) VALUES (?,?,?,?,?,?,?,?)').run(
        req.user.id, ex.space_id, ex.title, nd.toISOString().split('T')[0], 1, ex.recurrence_interval, ex.recurrence_unit, ex.recurrence_parent_id || ex.id
      );
    }
  }
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  res.json({ todo });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/events', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const events = db.prepare('SELECT * FROM events WHERE user_id = ? AND space_id = ? ORDER BY date ASC, time ASC').all(req.user.id, space.id);
  res.json({ events: filterDeleted(events) });
});

router.post('/events', authenticate, (req, res) => {
  const { space_id, title, description, date, time } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO events (user_id,space_id,title,description,date,time) VALUES (?,?,?,?,?,?)').run(
    req.user.id, space.id, title, description || '', date, time || null
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

// ═══════════════════════════════════════════════════════════════════════════
// NOTES (one per space, auto-saved)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/notes', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const note = db.prepare('SELECT * FROM notes WHERE user_id = ? AND space_id = ?').get(req.user.id, space.id);
  res.json({ note });
});

router.put('/notes', authenticate, (req, res) => {
  const { space_id, content } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  const db = getDb();
  const ex = db.prepare('SELECT * FROM notes WHERE user_id = ? AND space_id = ?').get(req.user.id, space.id);
  if (ex) {
    db.prepare('UPDATE notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND space_id = ?').run(content || '', req.user.id, space.id);
  } else {
    db.prepare('INSERT INTO notes (user_id,space_id,content) VALUES (?,?,?)').run(req.user.id, space.id, content || '');
  }
  const note = db.prepare('SELECT * FROM notes WHERE user_id = ? AND space_id = ?').get(req.user.id, space.id);
  res.json({ note });
});

// ═══════════════════════════════════════════════════════════════════════════
// USER PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/preferences', authenticate, (req, res) => {
  const db = getDb();
  const pref = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
  res.json({
    preferences: pref || {
      theme: 'dark', keyboard_shortcuts_enabled: 1, default_view: 'list',
      pomodoro_work_mins: 25, pomodoro_break_mins: 5, pomodoro_long_break_mins: 15,
      pomodoro_sessions_until_long_break: 4,
      onboarding_complete: 0,
      quick_capture_space_id: null,
      last_active_space_id: null,
      tour_completed: 0,
    },
  });
});

router.put('/preferences', authenticate, (req, res) => {
  const db = getDb();
  const allowed = [
    'theme', 'pomodoro_work_mins', 'pomodoro_break_mins', 'pomodoro_long_break_mins',
    'pomodoro_sessions_until_long_break', 'default_view', 'keyboard_shortcuts_enabled',
    'quick_capture_space_id', 'last_active_space_id',
    // Phase H Stage 2 — tour_completed is writable so the frontend can mark
    // completion/skip, and the Settings page can reset it (write 0) to
    // re-trigger the tour.
    'tour_completed',
  ];

  // Validate space-ref fields: must belong to the user, or be null.
  for (const f of ['quick_capture_space_id', 'last_active_space_id']) {
    if (req.body[f] === undefined) continue;
    if (req.body[f] === null) continue;
    const s = getUserSpace(req.user.id, req.body[f]);
    if (!s) return res.status(400).json({ error: `Invalid ${f}` });
  }

  const ex = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
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

// ═══════════════════════════════════════════════════════════════════════════
// TAGS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/tags', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const tags = db.prepare('SELECT * FROM tags WHERE user_id = ? AND space_id = ? ORDER BY name ASC').all(req.user.id, space.id);
  res.json({ tags: filterDeleted(tags) });
});

// Tags with usage counts for the tag manager modal.
router.get('/tags/with-usage', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.query.space_id);
  if (!space) return;
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.*, (
      SELECT COUNT(*)
      FROM task_tags tt
      JOIN tasks tk ON tt.task_id = tk.id
      WHERE tt.tag_id = t.id
        AND tk.deleted_at IS NULL
    ) AS usage_count
    FROM tags t
    WHERE t.user_id = ? AND t.space_id = ?
    ORDER BY t.name ASC
  `).all(req.user.id, space.id);
  res.json({ tags: filterDeleted(rows) });
});

router.post('/tags', authenticate, (req, res) => {
  const { space_id, name, color } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO tags (user_id, space_id, name, color) VALUES (?, ?, ?, ?)').run(req.user.id, space.id, name.trim(), color || 'blue');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.json({ tag });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tag already exists' });
    throw err;
  }
});

// Rename / recolour
router.put('/tags/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, color } = req.body;
  const db = getDb();
  const ex = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const ups = []; const vals = [];
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    ups.push('name = ?'); vals.push(name.trim());
  }
  if (color !== undefined) { ups.push('color = ?'); vals.push(color); }
  if (ups.length === 0) return res.json({ tag: ex });
  vals.push(id, req.user.id);
  try {
    db.prepare('UPDATE tags SET ' + ups.join(', ') + ' WHERE id = ? AND user_id = ?').run(...vals);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tag with that name already exists' });
    throw err;
  }
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
  res.json({ tag });
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
  if (task.space_id !== tag.space_id) return res.status(400).json({ error: 'Tag belongs to a different space' });
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

// ═══════════════════════════════════════════════════════════════════════════
// CSV EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════════════════

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

router.get('/export/csv', authenticate, (req, res) => {
  const db = getDb();
  let tasks;
  let spaceNameForFile = 'all';
  let fieldDefs = []; // custom field definitions in scope
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? AND space_id = ? ORDER BY id ASC').all(req.user.id, space.id);
    spaceNameForFile = space.name.replace(/[^a-z0-9\-]+/gi, '_').toLowerCase();
    fieldDefs = db.prepare('SELECT id, field_key, label, type FROM custom_field_definitions WHERE user_id = ? AND space_id = ? ORDER BY sort_order ASC, id ASC').all(req.user.id, space.id);
  } else {
    tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC').all(req.user.id);
    // Cross-space export: include every distinct field across the user's spaces.
    fieldDefs = db.prepare('SELECT id, field_key, label, type FROM custom_field_definitions WHERE user_id = ? ORDER BY space_id ASC, sort_order ASC, id ASC').all(req.user.id);
  }

  const withTags = attachTagsToTasks(tasks);
  const spaces = db.prepare('SELECT id, name FROM spaces WHERE user_id = ?').all(req.user.id);
  const spaceNameById = Object.fromEntries(spaces.map(s => [s.id, s.name]));

  // Preload custom field values for all tasks in one query.
  let fieldValsByTask = {};
  if (tasks.length > 0 && fieldDefs.length > 0) {
    const taskIds = tasks.map(t => t.id);
    const placeholders = taskIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT task_id, field_id, value
      FROM custom_field_values
      WHERE task_id IN (${placeholders})
    `).all(...taskIds);
    for (const r of rows) {
      if (!fieldValsByTask[r.task_id]) fieldValsByTask[r.task_id] = {};
      fieldValsByTask[r.task_id][r.field_id] = r.value;
    }
  }

  const baseCols = ['id', 'space_id', 'space_name', 'title', 'description', 'status', 'priority', 'due_date', 'pinned', 'archived', 'goals', 'tags', 'created_at', 'updated_at'];
  // Custom field columns use field_key; label goes into a secondary header
  // line is overkill — we just prefix with cf_ so the column is obviously a
  // custom field and the label is human-reference via export_fields.json.
  const cfCols = fieldDefs.map(f => `cf_${f.field_key}`);
  const cols = [...baseCols, ...cfCols];

  const lines = [cols.join(',')];
  for (const t of withTags) {
    const baseValues = baseCols.map(c => {
      if (c === 'tags') return csvEscape((t.tags || []).map(tg => tg.name).join('|'));
      if (c === 'space_name') return csvEscape(spaceNameById[t.space_id] || '');
      return csvEscape(t[c]);
    });
    const cfValues = fieldDefs.map(f => {
      const raw = fieldValsByTask[t.id]?.[f.id];
      if (raw === undefined || raw === null) return '';
      // multi-select is stored as JSON array — flatten to pipe-separated for CSV.
      if (f.type === 'multi-select') {
        try { const arr = JSON.parse(raw); return csvEscape(Array.isArray(arr) ? arr.join('|') : raw); }
        catch { return csvEscape(raw); }
      }
      return csvEscape(raw);
    });
    lines.push([...baseValues, ...cfValues].join(','));
  }
  const csv = lines.join('\n');
  const fname = `kaseki-${spaceNameForFile}-${new Date().toISOString().split('T')[0]}.csv`;
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
  const { csv, space_id } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!csv) return res.status(400).json({ error: 'csv required' });
  const lines = String(csv).split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });
  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const titleIdx = idx('title');
  if (titleIdx === -1) return res.status(400).json({ error: 'CSV missing "title" column' });

  const db = getDb();
  let imported = 0, skipped = 0;
  const insertTask = db.prepare('INSERT INTO tasks (user_id,space_id,title,description,status,priority,due_date,goals) VALUES (?,?,?,?,?,?,?,?)');

  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const title = (row[titleIdx] || '').trim();
      if (!title) { skipped++; continue; }
      const pick = (k, fallback) => { const j = idx(k); return j >= 0 ? row[j] : fallback; };
      insertTask.run(
        req.user.id,
        space.id,
        title,
        pick('description', '') || '',
        pick('status', 'to_start') || 'to_start',
        parseInt(pick('priority', '3')) || 3,
        pick('due_date', null) || null,
        pick('goals', '') || ''
      );
      imported++;
    }
  });
  tx();

  res.json({ imported, skipped });
});

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH — cross-space by default, optional ?space_id= narrows
// ═══════════════════════════════════════════════════════════════════════════

router.get('/search', authenticate, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ tasks: [], todos: [], events: [] });
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const likeQ = '%' + q.toLowerCase() + '%';
  const db = getDb();

  let spaceFilter = '';
  const spaceBind = [];
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    spaceFilter = ' AND space_id = ?';
    spaceBind.push(space.id);
  }

  const tasks = db.prepare(`
    SELECT t.id, t.space_id, t.title, t.description, t.status, t.priority, t.due_date, t.archived, t.pinned, t.updated_at
    FROM tasks t
    LEFT JOIN spaces s ON t.space_id = s.id
    WHERE t.user_id = ?
      AND t.deleted_at IS NULL
      AND (s.archived IS NULL OR s.archived = 0)
      AND (
        LOWER(t.title) LIKE ?
        OR LOWER(t.description) LIKE ?
        OR LOWER(t.goals) LIKE ?
        OR EXISTS (
          SELECT 1 FROM custom_field_values v
          WHERE v.task_id = t.id AND LOWER(v.value) LIKE ?
        )
      )${spaceFilter.replace('space_id', 't.space_id')}
    ORDER BY t.archived ASC, t.pinned DESC, t.updated_at DESC
    LIMIT ?
  `).all(req.user.id, likeQ, likeQ, likeQ, likeQ, ...spaceBind, limit);

  const todos = db.prepare(`
    SELECT t.id, t.space_id, t.title, t.completed, t.date, t.dismissed
    FROM todos t
    LEFT JOIN spaces s ON t.space_id = s.id
    WHERE t.user_id = ?
      AND t.deleted_at IS NULL
      AND (s.archived IS NULL OR s.archived = 0)
      AND LOWER(t.title) LIKE ?
      AND t.dismissed = 0${spaceFilter.replace('space_id', 't.space_id')}
    ORDER BY t.date DESC
    LIMIT ?
  `).all(req.user.id, likeQ, ...spaceBind, limit);

  const events = db.prepare(`
    SELECT e.id, e.space_id, e.title, e.description, e.date, e.time
    FROM events e
    LEFT JOIN spaces s ON e.space_id = s.id
    WHERE e.user_id = ?
      AND e.deleted_at IS NULL
      AND (s.archived IS NULL OR s.archived = 0)
      AND (LOWER(e.title) LIKE ? OR LOWER(e.description) LIKE ?)${spaceFilter.replace('space_id', 'e.space_id')}
    ORDER BY e.date DESC
    LIMIT ?
  `).all(req.user.id, likeQ, likeQ, ...spaceBind, limit);

  // Attach space metadata so the UI can render coloured badges next to each result.
  const spaces = db.prepare('SELECT id, name, icon, color FROM spaces WHERE user_id = ?').all(req.user.id);
  const spaceById = Object.fromEntries(spaces.map(s => [s.id, s]));
  const attachSpace = (arr) => arr.map(r => ({ ...r, space: spaceById[r.space_id] || null }));

  res.json({
    tasks: attachSpace(attachTagsToTasks(tasks)),
    todos: attachSpace(todos),
    events: attachSpace(events),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAVED VIEWS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/saved-views', authenticate, (req, res) => {
  const db = getDb();
  let rows;
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    rows = db.prepare('SELECT * FROM saved_views WHERE user_id = ? AND space_id = ? ORDER BY sort_order ASC, created_at ASC').all(req.user.id, space.id);
  } else {
    rows = db.prepare('SELECT * FROM saved_views WHERE user_id = ? ORDER BY space_id, sort_order ASC, created_at ASC').all(req.user.id);
  }
  const views = rows.map(v => ({ ...v, filters: safeJsonParse(v.filters, {}) }));
  res.json({ views });
});

router.post('/saved-views', authenticate, (req, res) => {
  const { space_id, name, filters, view_type } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const filtersJson = JSON.stringify(filters || {});
  const max = db.prepare('SELECT MAX(sort_order) as m FROM saved_views WHERE user_id = ? AND space_id = ?').get(req.user.id, space.id);
  const result = db.prepare('INSERT INTO saved_views (user_id, space_id, name, filters, view_type, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, space.id, name.trim(), filtersJson, view_type || 'list', (max?.m || 0) + 1
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
  if (req.body.name !== undefined) { ups.push('name = ?'); vals.push(String(req.body.name).trim()); }
  if (req.body.filters !== undefined) { ups.push('filters = ?'); vals.push(JSON.stringify(req.body.filters || {})); }
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

// ═══════════════════════════════════════════════════════════════════════════
// TASK TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/templates', authenticate, (req, res) => {
  const db = getDb();
  let rows;
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    rows = db.prepare('SELECT * FROM task_templates WHERE user_id = ? AND space_id = ? ORDER BY name ASC').all(req.user.id, space.id);
  } else {
    rows = db.prepare('SELECT * FROM task_templates WHERE user_id = ? ORDER BY space_id, name ASC').all(req.user.id);
  }
  const templates = rows.map(t => ({
    ...t,
    subtasks: safeJsonParse(t.subtasks, []),
    tag_ids: safeJsonParse(t.tag_ids, []),
  }));
  res.json({ templates });
});

router.post('/templates', authenticate, (req, res) => {
  const { space_id, name, title, description, priority, goals, subtasks, tag_ids } = req.body;
  const space = requireSpace(req, res, space_id);
  if (!space) return;
  if (!name || !title) return res.status(400).json({ error: 'Name and title required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO task_templates (user_id, space_id, name, title, description, priority, goals, subtasks, tag_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    req.user.id, space.id, name.trim(), title.trim(), description || '', priority || 3, goals || '',
    JSON.stringify(subtasks || []), JSON.stringify(tag_ids || [])
  );
  const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(result.lastInsertRowid);
  res.json({
    template: {
      ...template,
      subtasks: safeJsonParse(template.subtasks, []),
      tag_ids: safeJsonParse(template.tag_ids, []),
    },
  });
});

router.put('/templates/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM task_templates WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  const ups = []; const vals = [];
  const map = { name: 'name', title: 'title', description: 'description', priority: 'priority', goals: 'goals' };
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) { ups.push(`${col} = ?`); vals.push(req.body[k]); }
  }
  if (req.body.subtasks !== undefined) { ups.push('subtasks = ?'); vals.push(JSON.stringify(req.body.subtasks || [])); }
  if (req.body.tag_ids !== undefined) { ups.push('tag_ids = ?'); vals.push(JSON.stringify(req.body.tag_ids || [])); }
  if (ups.length > 0) {
    vals.push(id, req.user.id);
    db.prepare('UPDATE task_templates SET ' + ups.join(', ') + ' WHERE id = ? AND user_id = ?').run(...vals);
  }
  const updated = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
  res.json({
    template: {
      ...updated,
      subtasks: safeJsonParse(updated.subtasks, []),
      tag_ids: safeJsonParse(updated.tag_ids, []),
    },
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

// Create a task from a template. Body: { due_date?, override_space_id? }
router.post('/templates/:id/instantiate', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const tpl = db.prepare('SELECT * FROM task_templates WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!tpl) return res.status(404).json({ error: 'Not found' });

  const targetSpaceId = req.body.override_space_id || tpl.space_id;
  const space = getUserSpace(req.user.id, targetSpaceId);
  if (!space) return res.status(400).json({ error: 'Target space not found' });

  const tx = db.transaction(() => {
    const result = db.prepare('INSERT INTO tasks (user_id, space_id, title, description, priority, goals, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      req.user.id, space.id, tpl.title, tpl.description || '', tpl.priority || 3, tpl.goals || '',
      req.body.due_date || null
    );
    const taskId = result.lastInsertRowid;
    logActivity(taskId, req.user.id, 'created', `Created from template: ${tpl.name}`);

    const subtasks = safeJsonParse(tpl.subtasks, []);
    for (let i = 0; i < subtasks.length; i++) {
      const s = subtasks[i];
      db.prepare('INSERT INTO subtasks (task_id, title, sort_order) VALUES (?, ?, ?)').run(taskId, typeof s === 'string' ? s : s.title, i);
    }

    const tagIds = safeJsonParse(tpl.tag_ids, []);
    for (const tagId of tagIds) {
      const tag = db.prepare('SELECT id, space_id FROM tags WHERE id = ? AND user_id = ?').get(tagId, req.user.id);
      if (tag && tag.space_id === space.id) {
        db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(taskId, tagId);
      }
    }
    return taskId;
  });
  const newTaskId = tx();

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newTaskId);
  res.json({ task: { ...task, tags: getTagsForTask(newTaskId) } });
});

// ═══════════════════════════════════════════════════════════════════════════
// FOCUS / POMODORO (unchanged semantically; task_id still nullable)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/focus/start', authenticate, (req, res) => {
  const { task_id, kind, duration_seconds } = req.body;
  if (!duration_seconds || duration_seconds <= 0) return res.status(400).json({ error: 'Invalid duration' });
  const db = getDb();
  // Validate task ownership if provided.
  if (task_id) {
    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').get(task_id, req.user.id);
    if (!task) return res.status(400).json({ error: 'Invalid task_id' });
  }
  const result = db.prepare('INSERT INTO focus_sessions (user_id, task_id, kind, duration_seconds) VALUES (?, ?, ?, ?)').run(
    req.user.id, task_id || null, kind || 'work', duration_seconds
  );
  const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.json({ session });
});

router.put('/focus/:id/finish', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE focus_sessions SET completed = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.completed === 0 ? 0 : 1, id);
  const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
  res.json({ session });
});

router.get('/focus/recent', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const db = getDb();
  const sessions = db.prepare('SELECT * FROM focus_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?').all(req.user.id, limit);
  res.json({ sessions });
});

router.get('/focus/today', authenticate, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const sessions = db.prepare("SELECT * FROM focus_sessions WHERE user_id = ? AND started_at >= ? ORDER BY started_at DESC").all(req.user.id, today);
  const totalWork = sessions.filter(s => s.kind === 'work' && s.completed === 1).reduce((a, s) => a + (s.duration_seconds || 0), 0);
  res.json({ sessions, totalWorkSeconds: totalWork, count: sessions.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// TODAY SUMMARY + CALENDAR RANGE
// ═══════════════════════════════════════════════════════════════════════════

router.get('/today-summary', authenticate, (req, res) => {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  // Tasks and todos get space metadata joined so the client can render
  // space icons, colours, and names without a second round trip.
  const taskJoin = `
    SELECT t.*,
           s.name  AS space_name,
           s.icon  AS space_icon,
           s.color AS space_color,
           s.preset AS space_preset
    FROM tasks t
    LEFT JOIN spaces s ON t.space_id = s.id
  `;
  const todoJoin = `
    SELECT t.*,
           s.name  AS space_name,
           s.icon  AS space_icon,
           s.color AS space_color
    FROM todos t
    LEFT JOIN spaces s ON t.space_id = s.id
  `;
  const eventJoin = `
    SELECT e.*,
           s.name  AS space_name,
           s.icon  AS space_icon,
           s.color AS space_color
    FROM events e
    LEFT JOIN spaces s ON e.space_id = s.id
  `;

  // Exclude tasks/todos/events from archived spaces (Feature 5).
  const archivedSpaceFilter = ' AND (s.archived IS NULL OR s.archived = 0)';
  const todos = filterDeleted(db.prepare(`${todoJoin} WHERE t.user_id = ? AND t.date = ? AND t.dismissed = 0${archivedSpaceFilter}`).all(req.user.id, today));
  const events = filterDeleted(db.prepare(`${eventJoin} WHERE e.user_id = ? AND e.date = ?${archivedSpaceFilter.replace('t.', 'e.')} ORDER BY e.time ASC`).all(req.user.id, today));
  const tasks_due_today = filterDeleted(db.prepare(`${taskJoin} WHERE t.user_id = ? AND t.archived = 0 AND t.status != 'done' AND t.due_date = ?${archivedSpaceFilter} ORDER BY t.priority DESC`).all(req.user.id, today));
  const overdue = filterDeleted(db.prepare(`${taskJoin} WHERE t.user_id = ? AND t.archived = 0 AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < ?${archivedSpaceFilter} ORDER BY t.due_date ASC`).all(req.user.id, today));

  // Yesterday's completed tasks — anything whose status flipped to 'done'
  // yesterday. We approximate via updated_at date match since we don't store
  // a separate completion timestamp.
  const yesterday_completed = filterDeleted(db.prepare(`
    ${taskJoin}
    WHERE t.user_id = ?
      AND t.status = 'done'
      AND DATE(t.updated_at) = ?
      ${archivedSpaceFilter}
    ORDER BY t.updated_at DESC
  `).all(req.user.id, yesterday));

  // Pomodoro stats for today.
  const focusRows = db.prepare(`
    SELECT duration_seconds, completed, kind
    FROM focus_sessions
    WHERE user_id = ?
      AND DATE(started_at) = ?
      AND kind = 'work'
      AND completed = 1
  `).all(req.user.id, today);
  const focus_seconds_today = focusRows.reduce((a, r) => a + (r.duration_seconds || 0), 0);
  const focus_minutes_today = Math.floor(focus_seconds_today / 60);
  const focus_sessions_today = focusRows.length;

  res.json({
    todos,
    events,
    tasks_due_today,
    overdue,
    yesterday_completed,
    focus_minutes_today,
    focus_sessions_today,
    // Legacy field names preserved for anything still reading them.
    dueTasks: tasks_due_today,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE C BATCH 3 — COUNTDOWN
// ═══════════════════════════════════════════════════════════════════════════
// Cross-space list of things with a date in the next 30 days. Merges tasks
// (by due_date) and events (by date), returns chronologically ascending so
// the soonest thing is first. Also includes overdue items (past due_date
// but not yet done) because "three days overdue" is more useful in a
// countdown view than silence.
//
// Return shape: [{ kind: 'task'|'event', id, title, date, time?, space_id,
// space_name, space_icon, space_color, status? (tasks only), days_away }]
// where days_away is negative for overdue, 0 for today, positive for future.

router.get('/countdown', authenticate, (req, res) => {
  const db = getDb();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 30);
  const horizonStr = horizon.toISOString().slice(0, 10);

  // Tasks: due_date in [past-overdue, today .. today+30]. Exclude archived,
  // soft-deleted, and 'done' tasks. Overdue done tasks would be clutter.
  const tasks = db.prepare(`
    SELECT t.id, t.title, t.due_date AS date, t.due_time AS time, t.status,
           t.space_id, s.name AS space_name, s.icon AS space_icon, s.color AS space_color
    FROM tasks t
    JOIN spaces s ON s.id = t.space_id
    WHERE t.user_id = ?
      AND t.archived = 0
      AND t.deleted_at IS NULL
      AND s.visible = 1
      AND s.archived = 0
      AND t.status != 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date != ''
      AND t.due_date <= ?
    ORDER BY t.due_date ASC, t.due_time ASC
  `).all(req.user.id, horizonStr);

  // Events: date in [today .. today+30]. Events don't have a "done" concept
  // and don't become "overdue" the way tasks do — past events are just past
  // events. So we only look forward here.
  const events = db.prepare(`
    SELECT e.id, e.title, e.date, e.time,
           e.space_id, s.name AS space_name, s.icon AS space_icon, s.color AS space_color
    FROM events e
    JOIN spaces s ON s.id = e.space_id
    WHERE e.user_id = ?
      AND e.deleted_at IS NULL
      AND s.visible = 1
      AND s.archived = 0
      AND e.date >= ?
      AND e.date <= ?
    ORDER BY e.date ASC, e.time ASC
  `).all(req.user.id, todayStr, horizonStr);

  // Compute days_away server-side so the client doesn't have to worry about
  // timezone edge cases. String date arithmetic via Date parsing is good
  // enough for day-granularity.
  const todayDate = new Date(todayStr + 'T00:00:00Z');
  const daysAway = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    return Math.round((d - todayDate) / (1000 * 60 * 60 * 24));
  };

  const taskItems = tasks.map(t => ({
    kind: 'task',
    id: t.id, title: t.title, date: t.date, time: t.time || null,
    status: t.status,
    space_id: t.space_id, space_name: t.space_name, space_icon: t.space_icon, space_color: t.space_color,
    days_away: daysAway(t.date),
  }));
  const eventItems = events.map(e => ({
    kind: 'event',
    id: e.id, title: e.title, date: e.date, time: e.time || null,
    space_id: e.space_id, space_name: e.space_name, space_icon: e.space_icon, space_color: e.space_color,
    days_away: daysAway(e.date),
  }));

  const merged = [...taskItems, ...eventItems].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    // Same-day: items with a time sort by time; events first when both lack times.
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.kind === 'event' ? -1 : 1;
  });

  res.json({ items: merged });
});

router.get('/calendar', authenticate, (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required (YYYY-MM-DD)' });
  const db = getDb();

  let spaceFilter = '';
  const bind = [req.user.id, start, end];
  if (req.query.space_id) {
    const space = requireSpace(req, res, req.query.space_id);
    if (!space) return;
    spaceFilter = ' AND space_id = ?';
    bind.push(space.id);
  }

  const events = filterDeleted(db.prepare(`SELECT * FROM events WHERE user_id = ? AND date >= ? AND date <= ?${spaceFilter} ORDER BY date ASC, time ASC`).all(...bind));
  const tasks = filterDeleted(db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND due_date >= ? AND due_date <= ?${spaceFilter} AND archived = 0 ORDER BY due_date ASC`).all(...bind));
  const todos = filterDeleted(db.prepare(`SELECT * FROM todos WHERE user_id = ? AND date >= ? AND date <= ?${spaceFilter} AND dismissed = 0 ORDER BY date ASC`).all(...bind));

  res.json({ events, tasks, todos });
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM FIELDS (Phase B Batch 4)
// ═══════════════════════════════════════════════════════════════════════════

// Parse options JSON for dropdown/multi-select fields into an array.
function parseFieldDef(row) {
  if (!row) return null;
  return {
    ...row,
    options: row.options ? safeParseArray(row.options) : null,
  };
}
function safeParseArray(s) {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : null; } catch { return null; }
}

// GET /spaces/:id/fields — list field definitions for a space
router.get('/spaces/:id/fields', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  // On first access, backfill from preset if the space has no fields yet.
  runCustomFieldBackfillOnce(req.user.id);
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM custom_field_definitions
    WHERE user_id = ? AND space_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(req.user.id, space.id);
  res.json({ fields: rows.map(parseFieldDef) });
});

// GET /tasks/:id/fields — get field values for a task, joined with definitions
// so the client can render labelled inputs without a second call.
router.get('/tasks/:id/fields', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  // Make sure fields exist for the space — backfill if missing.
  runCustomFieldBackfillOnce(req.user.id);
  const rows = db.prepare(`
    SELECT d.id AS field_id, d.field_key, d.label, d.type, d.options,
           d.required, d.show_in_list, d.show_in_create, d.sort_order,
           v.value
    FROM custom_field_definitions d
    LEFT JOIN custom_field_values v
      ON v.field_id = d.id AND v.task_id = ?
    WHERE d.user_id = ? AND d.space_id = ?
    ORDER BY d.sort_order ASC, d.id ASC
  `).all(id, req.user.id, task.space_id);
  const fields = rows.map(r => ({
    field_id: r.field_id,
    field_key: r.field_key,
    label: r.label,
    type: r.type,
    options: r.options ? safeParseArray(r.options) : null,
    required: !!r.required,
    show_in_list: !!r.show_in_list,
    show_in_create: !!r.show_in_create,
    sort_order: r.sort_order,
    value: r.value,
  }));
  res.json({ fields });
});

// PUT /tasks/:id/fields — bulk update field values
// Body: { values: { field_id: <value>, ... } }
// Value of null or empty string deletes the row.
router.put('/tasks/:id/fields', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const { values } = req.body || {};
  if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values object required' });

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Guard: only accept field_ids that actually belong to this space.
  const validFields = db.prepare(`
    SELECT id, type, options, label FROM custom_field_definitions
    WHERE user_id = ? AND space_id = ?
  `).all(req.user.id, task.space_id);
  const validIds = new Map(validFields.map(f => [f.id, f]));

  const upsert = db.prepare(`
    INSERT INTO custom_field_values (task_id, field_id, value, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(task_id, field_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const del = db.prepare('DELETE FROM custom_field_values WHERE task_id = ? AND field_id = ?');

  const tx = db.transaction(() => {
    for (const [fidStr, raw] of Object.entries(values)) {
      const fid = parseInt(fidStr);
      if (!validIds.has(fid)) continue;
      const def = validIds.get(fid);
      // Normalise value by type
      let v = raw;
      if (v === undefined || v === null || v === '') {
        del.run(id, fid);
        continue;
      }
      if (def.type === 'checkbox') v = v ? '1' : '0';
      else if (def.type === 'multi-select') v = Array.isArray(v) ? JSON.stringify(v) : String(v);
      else v = String(v);
      upsert.run(id, fid, v);
    }
    db.prepare('UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  });
  tx();

  logActivity(id, req.user.id, 'edited', 'Custom fields updated');
  res.json({ success: true });
});

// ── Field definition CRUD (Batch 5) ───────────────────────────────────────
const VALID_FIELD_TYPES = [
  'text', 'long-text', 'number', 'currency',
  'date', 'datetime', 'checkbox',
  'dropdown', 'multi-select',
  'email', 'url', 'phone',
];

function slugifyKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'field';
}

// Field definitions with usage count (how many tasks in the space have
// a non-null value for this field). Used by the field manager modal to
// warn before deletion.
router.get('/spaces/:id/fields/with-usage', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  runCustomFieldBackfillOnce(req.user.id);
  const db = getDb();
  const rows = db.prepare(`
    SELECT d.*, (
      SELECT COUNT(*) FROM custom_field_values v
      JOIN tasks t ON v.task_id = t.id
      WHERE v.field_id = d.id
        AND t.deleted_at IS NULL
        AND v.value IS NOT NULL
        AND v.value != ''
    ) AS usage_count
    FROM custom_field_definitions d
    WHERE d.user_id = ? AND d.space_id = ?
    ORDER BY d.sort_order ASC, d.id ASC
  `).all(req.user.id, space.id);
  res.json({ fields: rows.map(parseFieldDef) });
});

router.post('/spaces/:id/fields', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  const { label, type, options, required, show_in_list, show_in_create } = req.body || {};
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'Label required' });
  if (!VALID_FIELD_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if ((type === 'dropdown' || type === 'multi-select') && (!Array.isArray(options) || options.length === 0)) {
    return res.status(400).json({ error: `${type} requires at least one option` });
  }

  const db = getDb();
  // Next sort_order
  const max = db.prepare('SELECT MAX(sort_order) AS m FROM custom_field_definitions WHERE user_id = ? AND space_id = ?').get(req.user.id, space.id);
  const nextOrder = (max?.m ?? -1) + 1;

  // Generate a unique field_key from the label.
  let base = slugifyKey(label);
  let key = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM custom_field_definitions WHERE user_id = ? AND space_id = ? AND field_key = ?').get(req.user.id, space.id, key)) {
    n++;
    key = `${base}_${n}`;
  }

  try {
    const result = db.prepare(`
      INSERT INTO custom_field_definitions
        (user_id, space_id, field_key, label, type, options, required, show_in_list, show_in_create, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, space.id, key, String(label).trim(), type,
      options ? JSON.stringify(options) : null,
      required ? 1 : 0, show_in_list ? 1 : 0, show_in_create ? 1 : 0,
      nextOrder
    );
    const field = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(result.lastInsertRowid);
    res.json({ field: parseFieldDef(field) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Field already exists' });
    throw err;
  }
});

router.put('/spaces/:spaceId/fields/:fieldId', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.spaceId);
  if (!space) return;
  const fieldId = parseInt(req.params.fieldId);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ? AND user_id = ? AND space_id = ?').get(fieldId, req.user.id, space.id);
  if (!ex) return res.status(404).json({ error: 'Field not found' });

  const { label, options, required, show_in_list, show_in_create, is_client_identifier } = req.body || {};
  const ups = []; const vals = [];
  if (label !== undefined) {
    if (!String(label).trim()) return res.status(400).json({ error: 'Label cannot be empty' });
    ups.push('label = ?'); vals.push(String(label).trim());
  }
  if (options !== undefined) {
    if ((ex.type === 'dropdown' || ex.type === 'multi-select') && (!Array.isArray(options) || options.length === 0)) {
      return res.status(400).json({ error: `${ex.type} requires at least one option` });
    }
    ups.push('options = ?'); vals.push(options ? JSON.stringify(options) : null);
  }
  if (required !== undefined)      { ups.push('required = ?');       vals.push(required ? 1 : 0); }
  if (show_in_list !== undefined)  { ups.push('show_in_list = ?');   vals.push(show_in_list ? 1 : 0); }
  if (show_in_create !== undefined){ ups.push('show_in_create = ?'); vals.push(show_in_create ? 1 : 0); }
  // Phase C Batch 3 — client identifier flag. Only one field per space may be
  // the identifier. When we set a field to 1, clear it from any other field
  // in the same space first so the invariant holds. When setting to 0, just
  // unset this field.
  if (is_client_identifier !== undefined) {
    if (is_client_identifier) {
      db.prepare('UPDATE custom_field_definitions SET is_client_identifier = 0 WHERE user_id = ? AND space_id = ? AND id != ?')
        .run(req.user.id, space.id, fieldId);
    }
    ups.push('is_client_identifier = ?'); vals.push(is_client_identifier ? 1 : 0);
  }

  if (ups.length === 0) return res.json({ field: parseFieldDef(ex) });
  vals.push(fieldId);
  db.prepare(`UPDATE custom_field_definitions SET ${ups.join(', ')} WHERE id = ?`).run(...vals);
  const field = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(fieldId);
  res.json({ field: parseFieldDef(field) });
});

router.delete('/spaces/:spaceId/fields/:fieldId', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.spaceId);
  if (!space) return;
  const fieldId = parseInt(req.params.fieldId);
  const db = getDb();
  const ex = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ? AND user_id = ? AND space_id = ?').get(fieldId, req.user.id, space.id);
  if (!ex) return res.status(404).json({ error: 'Field not found' });
  // FK cascade removes all custom_field_values for this field.
  db.prepare('DELETE FROM custom_field_definitions WHERE id = ?').run(fieldId);
  res.json({ success: true });
});

router.put('/spaces/:id/fields/reorder', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const db = getDb();
  const upd = db.prepare('UPDATE custom_field_definitions SET sort_order = ? WHERE id = ? AND user_id = ? AND space_id = ?');
  const tx = db.transaction(() => {
    order.forEach((id, i) => { upd.run(i, id, req.user.id, space.id); });
  });
  tx();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE C BATCH 3 — CLIENT DIRECTORY
// ═══════════════════════════════════════════════════════════════════════════
//
// Given a space with an is_client_identifier-flagged custom field, aggregate
// all distinct values of that field across the space's tasks and return per-
// client statistics. Drives the Clients tab in the dashboard view.
//
// Returns:
//   {
//     identifier_field: { id, key, label } | null,  // null if no flag set
//     clients: [ { value, task_count, active_count, last_activity_at } ]
//   }
//
// Task counts exclude archived and soft-deleted tasks. active_count is tasks
// whose status is not 'done'. last_activity_at is the max updated_at across
// the task set for the client (used to sort by recency).

router.get('/spaces/:id/clients', authenticate, (req, res) => {
  const space = requireSpace(req, res, req.params.id);
  if (!space) return;
  const db = getDb();
  const field = db.prepare(`
    SELECT id, field_key, label
    FROM custom_field_definitions
    WHERE user_id = ? AND space_id = ? AND is_client_identifier = 1
    LIMIT 1
  `).get(req.user.id, space.id);
  if (!field) {
    return res.json({ identifier_field: null, clients: [] });
  }
  const rows = db.prepare(`
    SELECT
      cfv.value AS value,
      COUNT(*) AS task_count,
      SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END) AS active_count,
      MAX(t.updated_at) AS last_activity_at
    FROM custom_field_values cfv
    JOIN tasks t ON t.id = cfv.task_id
    WHERE cfv.field_id = ?
      AND t.user_id = ?
      AND t.space_id = ?
      AND t.archived = 0
      AND t.deleted_at IS NULL
      AND cfv.value IS NOT NULL
      AND TRIM(cfv.value) != ''
    GROUP BY cfv.value
    ORDER BY last_activity_at DESC, value ASC
  `).all(field.id, req.user.id, space.id);
  res.json({
    identifier_field: { id: field.id, key: field.field_key, label: field.label },
    clients: rows,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE C — TASK DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════

// Helper: DFS cycle check. Returns true if adding "task depends on dependsOn"
// would create a cycle. Assumes the edge is not yet inserted.
function wouldCreateCycle(db, userId, taskId, dependsOnTaskId) {
  // If target already transitively depends on source, adding source -> target
  // closes a cycle. Walk forward from dependsOnTaskId following the graph;
  // if we reach taskId, it's a cycle.
  const edges = db.prepare(`
    SELECT d.task_id, d.depends_on_task_id
    FROM task_dependencies d
    JOIN tasks t1 ON t1.id = d.task_id
    JOIN tasks t2 ON t2.id = d.depends_on_task_id
    WHERE t1.user_id = ? AND t2.user_id = ?
  `).all(userId, userId);
  const graph = new Map();
  for (const e of edges) {
    if (!graph.has(e.task_id)) graph.set(e.task_id, []);
    graph.get(e.task_id).push(e.depends_on_task_id);
  }
  // Treat the hypothetical new edge as already present for traversal.
  if (!graph.has(taskId)) graph.set(taskId, []);
  graph.get(taskId).push(dependsOnTaskId);

  const seen = new Set();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === taskId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    const out = graph.get(node) || [];
    for (const n of out) stack.push(n);
  }
  return false;
}

router.post('/tasks/:id/dependencies', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const { depends_on_task_id } = req.body || {};
  if (!depends_on_task_id) return res.status(400).json({ error: 'depends_on_task_id required' });
  const dependsOnId = parseInt(depends_on_task_id);
  if (dependsOnId === taskId) return res.status(400).json({ error: 'A task cannot depend on itself' });

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  const dep = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(dependsOnId, req.user.id);
  if (!task || !dep) return res.status(404).json({ error: 'Task not found' });
  if (task.space_id !== dep.space_id) return res.status(400).json({ error: 'Dependencies must be in the same space' });
  if (task.deleted_at || dep.deleted_at) return res.status(400).json({ error: 'Cannot link deleted tasks' });

  if (wouldCreateCycle(db, req.user.id, taskId, dependsOnId)) {
    return res.status(400).json({ error: 'Would create a circular dependency', code: 'CIRCULAR_DEPENDENCY' });
  }

  try {
    db.prepare('INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)').run(taskId, dependsOnId);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Dependency already exists' });
    throw e;
  }
  logActivity(taskId, req.user.id, 'dependency_added', 'Now depends on: ' + dep.title);
  res.json({ success: true });
});

router.delete('/tasks/:id/dependencies/:depId', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const depId = parseInt(req.params.depId);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  // Look up dependency row, scoped to user ownership of the source task.
  const row = db.prepare(`
    SELECT d.*, t.title AS dep_title
    FROM task_dependencies d
    JOIN tasks t ON t.id = d.depends_on_task_id
    WHERE d.id = ? AND d.task_id = ?
  `).get(depId, taskId);
  if (!row) return res.status(404).json({ error: 'Dependency not found' });
  db.prepare('DELETE FROM task_dependencies WHERE id = ?').run(depId);
  logActivity(taskId, req.user.id, 'dependency_removed', 'No longer depends on: ' + row.dep_title);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE C — TIME TRACKING
// ═══════════════════════════════════════════════════════════════════════════

// Start a timer on a task. One active timer per user (across all tasks).
// If the user has an active timer elsewhere, stop it first and include the
// closed entry in the response so the client can show "previous timer stopped".
router.post('/tasks/:id/time/start', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  let stoppedPrevious = null;
  const active = db.prepare('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(req.user.id);
  if (active) {
    // Close the previous timer.
    const now = new Date();
    const started = new Date(active.started_at);
    const dur = Math.max(0, Math.round((now - started) / 1000));
    db.prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?')
      .run(now.toISOString(), dur, active.id);
    stoppedPrevious = { id: active.id, task_id: active.task_id, duration_seconds: dur };
    logActivity(active.task_id, req.user.id, 'time_stopped', 'Timer stopped (switched tasks): ' + formatDuration(dur));
  }

  const startedAt = new Date().toISOString();
  const result = db.prepare('INSERT INTO time_entries (task_id, user_id, started_at) VALUES (?, ?, ?)').run(taskId, req.user.id, startedAt);
  logActivity(taskId, req.user.id, 'time_started', 'Timer started');
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid);
  res.json({ entry, stoppedPrevious });
});

// Stop the active timer (on any task — idempotent: stops whatever is running).
router.post('/tasks/:id/time/stop', authenticate, (req, res) => {
  const taskId = parseInt(req.params.id);
  const db = getDb();
  const entry = db.prepare('SELECT * FROM time_entries WHERE task_id = ? AND user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(taskId, req.user.id);
  if (!entry) return res.status(404).json({ error: 'No active timer on this task' });
  const now = new Date();
  const started = new Date(entry.started_at);
  const dur = Math.max(0, Math.round((now - started) / 1000));
  db.prepare('UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?').run(now.toISOString(), dur, entry.id);
  logActivity(taskId, req.user.id, 'time_stopped', 'Timer stopped: ' + formatDuration(dur));
  const updated = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entry.id);
  res.json({ entry: updated });
});

// What's the user's currently-running timer, if any? Used by the client on
// mount so a recovered session can display the right task highlighted.
router.get('/time/active', authenticate, (req, res) => {
  const db = getDb();
  const entry = db.prepare(`
    SELECT te.*, t.title AS task_title, t.space_id
    FROM time_entries te
    JOIN tasks t ON t.id = te.task_id
    WHERE te.user_id = ? AND te.ended_at IS NULL
    ORDER BY te.started_at DESC
    LIMIT 1
  `).get(req.user.id);
  res.json({ entry: entry || null });
});

// Delete a time entry — useful to prune mistaken sessions.
router.delete('/time-entries/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const entry = db.prepare(`
    SELECT te.* FROM time_entries te
    JOIN tasks t ON t.id = te.task_id
    WHERE te.id = ? AND t.user_id = ?
  `).get(id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  logActivity(entry.task_id, req.user.id, 'time_deleted', 'Time entry deleted');
  res.json({ success: true });
});

// Tiny formatter mirror of the client-side one, for activity log strings.
function formatDuration(seconds) {
  if (seconds < 60) return seconds + 's';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

module.exports = router;
