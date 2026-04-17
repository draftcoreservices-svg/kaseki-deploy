const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'kaseki.db');

let db = null;

function initDb() {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  initTables();
  runMigrations();
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function initTables() {
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

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'to_start',
      priority INTEGER DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
      due_date TEXT,
      due_time TEXT,
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      case_reference TEXT,
      client_name TEXT,
      court_date TEXT,
      goals TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      date TEXT NOT NULL,
      dismissed INTEGER DEFAULT 0,
      is_recurring INTEGER DEFAULT 0,
      recurrence_interval INTEGER,
      recurrence_unit TEXT,
      recurrence_parent_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      time TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      content TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      theme TEXT DEFAULT 'dark',
      pomodoro_work_mins INTEGER DEFAULT 25,
      pomodoro_break_mins INTEGER DEFAULT 5,
      pomodoro_long_break_mins INTEGER DEFAULT 15,
      pomodoro_sessions_until_long_break INTEGER DEFAULT 4,
      default_view TEXT DEFAULT 'list',
      keyboard_shortcuts_enabled INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'blue',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, section, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      name TEXT NOT NULL,
      filters TEXT NOT NULL DEFAULT '{}',
      view_type TEXT DEFAULT 'list',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('home', 'work', 'inbox')),
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority INTEGER DEFAULT 3,
      goals TEXT DEFAULT '',
      case_reference TEXT,
      client_name TEXT,
      subtasks TEXT DEFAULT '[]',
      tag_ids TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tags_user_section ON tags(user_id, section);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_section ON tasks(user_id, section, archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_todos_user_section_date ON todos(user_id, section, date);
    CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views(user_id, section, sort_order);
    CREATE INDEX IF NOT EXISTS idx_templates_user ON task_templates(user_id, section);
    CREATE INDEX IF NOT EXISTS idx_focus_user ON focus_sessions(user_id, started_at DESC);
  `);
}

// Safe idempotent migrations for existing databases
function runMigrations() {
  // 0. Repair any previously broken migration before doing anything else.
  // This fixes databases wedged by the first Phase 2B migration (which used a
  // RENAME-OLD pattern on a SQLite with legacy_alter_table=OFF, causing child-table
  // FKs to be rewritten to point at the intermediate name).
  repairBrokenForeignKeys();

  // Expand section CHECK constraint from ('home','work') to ('home','work','inbox')
  // SQLite doesn't support ALTER TABLE ... ALTER CHECK, so we rebuild tables that need it.
  try {
    const tasksSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
    if (tasksSql && tasksSql.sql && !tasksSql.sql.includes("'inbox'")) {
      console.log('[migration] Expanding section CHECK constraint to include inbox');
      migrateExpandSectionCheck();
    }
  } catch (e) {
    console.error('[migration] failed to check tasks schema:', e.message);
  }

  // Add columns that may not exist on older tasks tables
  ensureColumn('tasks', 'due_time', 'TEXT');

  // Add preference columns that may not exist on older user_preferences tables
  ensureColumn('user_preferences', 'pomodoro_work_mins', 'INTEGER DEFAULT 25');
  ensureColumn('user_preferences', 'pomodoro_break_mins', 'INTEGER DEFAULT 5');
  ensureColumn('user_preferences', 'pomodoro_long_break_mins', 'INTEGER DEFAULT 15');
  ensureColumn('user_preferences', 'pomodoro_sessions_until_long_break', 'INTEGER DEFAULT 4');
  ensureColumn('user_preferences', 'default_view', "TEXT DEFAULT 'list'");
  ensureColumn('user_preferences', 'keyboard_shortcuts_enabled', 'INTEGER DEFAULT 1');
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

// Repair databases broken by the original Phase 2B migration.
// Problem: child tables' FK references were rewritten to point at an intermediate
// table (tasks__old_migration) that was then dropped. We detect this by scanning
// each table's stored CREATE sql for references to the known stale name, and for
// each affected child we rebuild it with a corrected CREATE.
function repairBrokenForeignKeys() {
  try {
    const stale = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%__old_migration%'").all();
    if (stale.length === 0) return;

    console.log(`[repair] detected ${stale.length} tables with stale FK references`);
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('PRAGMA legacy_alter_table = ON;');

    const tx = db.transaction(() => {
      for (const row of stale) {
        const t = row.name;
        // Rewrite stale table refs back to their real names.
        // Example: "REFERENCES tasks__old_migration(id)" -> "REFERENCES tasks(id)"
        let fixed = row.sql.replace(/(\w+)__old_migration/g, '$1');

        // Drop any previous repair table.
        try { db.exec(`DROP TABLE IF EXISTS ${t}__repair;`); } catch (e) {}

        // Change the CREATE TABLE name to ${t}__repair so we can build alongside.
        fixed = fixed.replace(new RegExp(`CREATE TABLE\\s+"?${t}"?`), `CREATE TABLE ${t}__repair`);

        db.exec(fixed);
        const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).join(',');
        db.exec(`INSERT INTO ${t}__repair (${cols}) SELECT ${cols} FROM ${t};`);
        db.exec(`DROP TABLE ${t};`);
        db.exec(`ALTER TABLE ${t}__repair RENAME TO ${t};`);
        console.log(`[repair] rebuilt ${t} with corrected FK references`);
      }
    });
    tx();

    db.exec('PRAGMA legacy_alter_table = OFF;');
    db.exec('PRAGMA foreign_keys = ON;');
  } catch (e) {
    console.error('[repair] failed:', e.message);
  }
}

function migrateExpandSectionCheck() {
  // Expand CHECK(section IN ('home','work')) -> CHECK(section IN ('home','work','inbox'))
  // Correct approach: CREATE ${t}__new with expanded check, copy data, DROP ${t}, RENAME __new.
  // We MUST NOT rename ${t} to something else first, because by default SQLite rewrites child
  // tables' FK references to point at the renamed name. With this pattern, ${t} only ever
  // disappears briefly between DROP and RENAME (both inside a single transaction), and FKs
  // in child tables always reference the name `${t}` which is restored by the rename.
  const tablesToRebuild = ['tasks', 'todos', 'events', 'notes', 'tags'];

  // Clean up any leftover __new tables from previous failed attempts.
  for (const t of tablesToRebuild) {
    try { db.exec(`DROP TABLE IF EXISTS ${t}__new;`); } catch (e) {}
    try { db.exec(`DROP TABLE IF EXISTS ${t}__old_migration;`); } catch (e) {}
  }

  db.exec('PRAGMA foreign_keys = OFF;');

  const tx = db.transaction(() => {
    for (const t of tablesToRebuild) {
      const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`).get();
      if (!info || !info.sql) continue;
      if (info.sql.includes("'inbox'")) continue; // already migrated

      // 1. Build a CREATE statement for the replacement table, named __new.
      let newSql = info.sql.replace(
        /CHECK\s*\(\s*section\s+IN\s*\(\s*'home'\s*,\s*'work'\s*\)\s*\)/i,
        "CHECK(section IN ('home', 'work', 'inbox'))"
      );
      if (newSql === info.sql) {
        console.log(`[migration] Could not rewrite CHECK for ${t}, skipping`);
        continue;
      }
      newSql = newSql.replace(new RegExp(`CREATE TABLE\\s+"?${t}"?`), `CREATE TABLE ${t}__new`);

      // 2. Create the new table.
      db.exec(newSql);

      // 3. Copy all data.
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).join(',');
      db.exec(`INSERT INTO ${t}__new (${cols}) SELECT ${cols} FROM ${t};`);

      // 4. Drop the original.
      db.exec(`DROP TABLE ${t};`);

      // 5. Rename __new -> original name. SQLite may still try to rewrite FK references
      // in child tables. We enable legacy_alter_table only for this rename to prevent that.
      db.exec('PRAGMA legacy_alter_table = ON;');
      db.exec(`ALTER TABLE ${t}__new RENAME TO ${t};`);
      db.exec('PRAGMA legacy_alter_table = OFF;');

      console.log(`[migration] Rebuilt ${t} with expanded section check`);
    }
  });
  tx();

  db.exec('PRAGMA foreign_keys = ON;');
}

module.exports = { initDb, getDb };
