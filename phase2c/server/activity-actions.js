// ═══════════════════════════════════════════════════════════════════════════
// activity-actions — closed vocabulary of activity_log.action values.
//
// Shared by server/routes.js (require) AND src/pages/Dashboard.js (import).
// Uses module.exports (CommonJS) which both Node require() and CRA webpack
// import default interop handle cleanly.
//
// Previously lived as activity-actions.json, but the Dockerfile's
//   COPY server/*.js ./server/
// glob excludes .json, so the JSON never entered the image. Converted to
// .js so it rides along with the rest of the server code.
//
// kind: 'signal' shows in Timeline by default.
// kind: 'edit'   is hidden unless the user ticks "Show edits".
//
// When adding a new logActivity action in a future feature, add it here
// first. Backend validates against this map; Timeline reads it to decide
// visibility.
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Task lifecycle
  created:              { kind: 'signal' },
  status_changed:       { kind: 'signal' },
  archived:             { kind: 'signal' },
  unarchived:           { kind: 'signal' },
  moved:                { kind: 'signal' },
  deleted:              { kind: 'signal' },
  undeleted:            { kind: 'signal' },

  // Micro-edits — hidden in Timeline by default
  edited:               { kind: 'edit' },
  pinned:               { kind: 'edit' },
  unpinned:             { kind: 'edit' },

  // Subtasks
  subtask_added:        { kind: 'edit' },
  subtask_completed:    { kind: 'signal' },
  subtask_uncompleted:  { kind: 'edit' },
  subtask_removed:      { kind: 'edit' },

  // Attachments
  file_uploaded:        { kind: 'signal' },
  files_uploaded:       { kind: 'signal' },
  file_deleted:         { kind: 'signal' },

  // Notes
  note_added:           { kind: 'signal' },

  // Tags
  tagged:               { kind: 'signal' },
  untagged:             { kind: 'signal' },

  // Phase C — dependencies & time
  dependency_added:     { kind: 'signal' },
  dependency_removed:   { kind: 'signal' },
  time_started:         { kind: 'signal' },
  time_stopped:         { kind: 'signal' },
  time_deleted:         { kind: 'edit' },
};
