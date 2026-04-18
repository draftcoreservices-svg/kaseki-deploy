const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'kaseki.db');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

let db = null;

function initDb() {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Fresh installs and upgraded installs both end up at the same schema
  // by the time this function returns.
  initCoreTables();            // users, reset_tokens (not section-scoped, always safe)
  migrateToSpacesIfNeeded();   // the Phase 2C migration (idempotent)
  initSpaceScopedTables();     // creates the new shape if not already present
  initDependentTables();       // subtasks, task_notes, task_files, activity_log, task_tags, focus_sessions
  initUserPreferences();       // base table + ensureColumn for new fields
  initIndexes();

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// ───────────────────────────────────────────────────────────────────────────
// Core tables (not section-scoped, identical across pre and post Phase 2C)
// ───────────────────────────────────────────────────────────────────────────
function initCoreTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// ───────────────────────────────────────────────────────────────────────────
// The Phase 2C migration.
//
// Strategy: fresh-start. The user has explicitly agreed to lose all task/todo/
// event/note/tag/saved-view/template data. We drop every section-scoped table
// and every table whose rows cascade from one, then let initSpaceScopedTables
// and initDependentTables create everything fresh with space_id.
//
// Safety guarantees:
//   1. We detect "already migrated" by the presence of the spaces table. If
//      that table exists, this function is a no-op. Safe to re-run.
//   2. We never ALTER existing tables in place. No rename-dance, no CHECK
//      rewrites, no FK repair. Previous migration broke via that route.
//   3. We disable foreign_keys for the drops, then re-enable. FK cascades
//      would fire during DROP otherwise, which is fine for CASCADE DELETE
//      but slower and noisier in logs.
//   4. Uploaded files on disk are left alone here (they'll be orphaned but
//      harmless). A separate cleanup function scans /app/uploads after
//      migration and logs/removes orphans.
// ───────────────────────────────────────────────────────────────────────────
function migrateToSpacesIfNeeded() {
  const hasSpaces = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spaces'").get();
  if (hasSpaces) return; // already migrated, no-op

  // Detect whether this is a fresh install or an upgrade. Fresh install =
  // no 'tasks' table with a section column. Upgrade = tasks exists with
  // a section column.
  const tasksInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (!tasksInfo) {
    // Fresh install. Nothing to migrate. initSpaceScopedTables will create
    // the new shape.
    return;
  }

  const hasSectionColumn = tasksInfo.sql && tasksInfo.sql.includes('section');
  if (!hasSectionColumn) {
    // tasks exists but without section column. This is an inconsistent state
    // (not a pre-Phase-2C shape we recognise). Bail loudly rather than
    // destroying data.
    throw new Error('[migration] tasks table exists but has no section column. Refusing to auto-migrate; inspect DB manually.');
  }

  console.log('[migration] Phase 2C: detected pre-2C schema, performing fresh-start migration');

  db.exec('PRAGMA foreign_keys = OFF;');

  const tx = db.transaction(() => {
    // Drop in dependency order (children first, then section-scoped parents).
    // All of these are either section-scoped or FK'd to a section-scoped
    // table and would be orphaned by the drops.
    const toDrop = [
      'task_tags',         // FK → tags, tasks
      'activity_log',      // FK → tasks
      'task_files',        // FK → tasks (files on disk handled separately)
      'task_notes',        // FK → tasks
      'subtasks',          // FK → tasks
      'focus_sessions',    // FK → tasks (ON DELETE SET NULL, but being wiped anyway)
      'saved_views',       // section-scoped
      'task_templates',    // section-scoped
      'tags',              // section-scoped
      'notes',             // section-scoped
      'events',            // section-scoped
      'todos',             // section-scoped
      'tasks',             // section-scoped
    ];
    for (const t of toDrop) {
      db.exec(`DROP TABLE IF EXISTS ${t};`);
    }
  });
  tx();

  db.exec('PRAGMA foreign_keys = ON;');

  console.log('[migration] Phase 2C: old tables dropped, new shape will be created now');

  // Orphaned uploads cleanup. Non-fatal on errors.
  try {
    cleanupOrphanedUploads();
  } catch (e) {
    console.error('[migration] upload cleanup failed (non-fatal):', e.message);
  }
}

function cleanupOrphanedUploads() {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  const files = fs.readdirSync(UPLOADS_DIR);
  if (files.length === 0) return;
  let removed = 0;
  for (const f of files) {
    const p = path.join(UPLOADS_DIR, f);
    try {
      const stat = fs.statSync(p);
      if (stat.isFile()) {
        fs.unlinkSync(p);
        removed++;
      }
    } catch (e) {
      // Ignore per-file errors; keep going.
    }
  }
  if (removed > 0) console.log(`[migration] removed ${removed} orphaned upload(s) from ${UPLOADS_DIR}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Space-scoped tables (new shape)
// ───────────────────────────────────────────────────────────────────────────
function initSpaceScopedTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      preset TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'to_start',
      priority INTEGER DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
      due_date TEXT,
      due_time TEXT,
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      goals TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      dismissed INTEGER DEFAULT 0,
      is_recurring INTEGER DEFAULT 0,
      recurrence_interval INTEGER,
      recurrence_unit TEXT,
      recurrence_parent_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      time TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      content TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, space_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'blue',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, space_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      filters TEXT NOT NULL DEFAULT '{}',
      view_type TEXT DEFAULT 'list',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      space_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority INTEGER DEFAULT 3,
      goals TEXT DEFAULT '',
      subtasks TEXT DEFAULT '[]',
      tag_ids TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );
  `);
}

// ───────────────────────────────────────────────────────────────────────────
// Dependent tables (scoped via tasks / tags)
// ───────────────────────────────────────────────────────────────────────────
function initDependentTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER,
      kind TEXT DEFAULT 'work' CHECK(kind IN ('work','break','long_break')),
      duration_seconds INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
  `);
}

// ───────────────────────────────────────────────────────────────────────────
// User preferences (base table + new Phase 2C columns)
// ───────────────────────────────────────────────────────────────────────────
function initUserPreferences() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      theme TEXT DEFAULT 'dark',
      pomodoro_work_mins INTEGER DEFAULT 25,
      pomodoro_break_mins INTEGER DEFAULT 5,
      pomodoro_long_break_mins INTEGER DEFAULT 15,
      pomodoro_sessions_until_long_break INTEGER DEFAULT 4,
      default_view TEXT DEFAULT 'list',
      keyboard_shortcuts_enabled INTEGER DEFAULT 1,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      quick_capture_space_id INTEGER,
      last_active_space_id INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // These ensureColumn calls are only for DBs that existed pre-Phase-2C and
  // skipped the fresh-create path. Idempotent.
  ensureColumn('user_preferences', 'pomodoro_work_mins', 'INTEGER DEFAULT 25');
  ensureColumn('user_preferences', 'pomodoro_break_mins', 'INTEGER DEFAULT 5');
  ensureColumn('user_preferences', 'pomodoro_long_break_mins', 'INTEGER DEFAULT 15');
  ensureColumn('user_preferences', 'pomodoro_sessions_until_long_break', 'INTEGER DEFAULT 4');
  ensureColumn('user_preferences', 'default_view', "TEXT DEFAULT 'list'");
  ensureColumn('user_preferences', 'keyboard_shortcuts_enabled', 'INTEGER DEFAULT 1');
  ensureColumn('user_preferences', 'onboarding_complete', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('user_preferences', 'quick_capture_space_id', 'INTEGER');
  ensureColumn('user_preferences', 'last_active_space_id', 'INTEGER');
}

function ensureColumn(table, column, def) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.find(c => c.name === column)) {
      console.log(`[migration] Adding ${table}.${column}`);
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  } catch (e) {
    console.error(`[migration] failed to add ${table}.${column}:`, e.message);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Indexes
// ───────────────────────────────────────────────────────────────────────────
function initIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_spaces_user ON spaces(user_id, archived, sort_order);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_space ON tasks(user_id, space_id, archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_todos_user_space_date ON todos(user_id, space_id, date);
    CREATE INDEX IF NOT EXISTS idx_events_user_space_date ON events(user_id, space_id, date);
    CREATE INDEX IF NOT EXISTS idx_tags_user_space ON tags(user_id, space_id);
    CREATE INDEX IF NOT EXISTS idx_saved_views_user_space ON saved_views(user_id, space_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_templates_user_space ON task_templates(user_id, space_id);
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_focus_user ON focus_sessions(user_id, started_at DESC);
  `);
}

module.exports = { initDb, getDb };
