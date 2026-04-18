const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const config = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }
  if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  const res = await fetch(`${API_BASE}${endpoint}`, config);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv') || options.raw) {
    const text = await res.text();
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return text;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  // ── Auth ────────────────────────────────────────────────────────────────
  login: (body) => request('/auth/login', { method: 'POST', body }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),

  // ── Spaces ──────────────────────────────────────────────────────────────
  getSpaces: () => request('/spaces'),
  getArchivedSpaces: () => request('/spaces/archived'),
  getSpace: (id) => request(`/spaces/${id}`),
  createSpace: (body) => request('/spaces', { method: 'POST', body }),
  updateSpace: (id, body) => request(`/spaces/${id}`, { method: 'PUT', body }),
  archiveSpace: (id) => request(`/spaces/${id}`, { method: 'DELETE' }),
  unarchiveSpace: (id) => request(`/spaces/${id}/unarchive`, { method: 'POST' }),
  reorderSpaces: (ids) => request('/spaces/reorder', { method: 'PUT', body: { ids } }),
  hardDeleteSpace: (id) => request(`/spaces/${id}/hard`, { method: 'DELETE' }),

  // ── Onboarding ──────────────────────────────────────────────────────────
  getOnboardingStatus: () => request('/user/onboarding-status'),
  restartOnboarding: () => request('/user/restart-onboarding', { method: 'POST' }),
  getOnboardingPresets: () => request('/onboarding/presets'),
  runOnboarding: (body) => request('/spaces/onboard', { method: 'POST', body }),

  // ── Tasks ───────────────────────────────────────────────────────────────
  getTasks: (spaceId) => request(`/tasks?space_id=${spaceId}`),
  getArchivedTasks: (spaceId) => request(`/tasks/archived/list?space_id=${spaceId}`),
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (body) => request('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PUT', body }),
  unarchiveTask: (id) => request(`/tasks/${id}/unarchive`, { method: 'PUT' }),
  softDeleteTask: (id) => request(`/tasks/${id}/soft`, { method: 'DELETE' }),
  undoDeleteTask: (id) => request(`/tasks/${id}/undo-delete`, { method: 'POST' }),
  softDeleteTodo: (id) => request(`/todos/${id}/soft`, { method: 'DELETE' }),
  undoDeleteTodo: (id) => request(`/todos/${id}/undo-delete`, { method: 'POST' }),
  softDeleteEvent: (id) => request(`/events/${id}/soft`, { method: 'DELETE' }),
  undoDeleteEvent: (id) => request(`/events/${id}/undo-delete`, { method: 'POST' }),
  softDeleteTag: (id) => request(`/tags/${id}/soft`, { method: 'DELETE' }),
  undoDeleteTag: (id) => request(`/tags/${id}/undo-delete`, { method: 'POST' }),
  reorderTasks: (body) => request('/tasks/reorder', { method: 'PUT', body }),
  weeklyReview: (spaceId) => request(`/tasks/weekly/review${spaceId ? `?space_id=${spaceId}` : ''}`),
  quickCapture: (body) => request('/quick-capture', { method: 'POST', body }),

  // ── Subtasks, task notes, files ─────────────────────────────────────────
  createSubtask: (taskId, body) => request(`/tasks/${taskId}/subtasks`, { method: 'POST', body }),
  updateSubtask: (id, body) => request(`/subtasks/${id}`, { method: 'PUT', body }),
  deleteSubtask: (id) => request(`/subtasks/${id}`, { method: 'DELETE' }),
  createTaskNote: (taskId, body) => request(`/tasks/${taskId}/notes`, { method: 'POST', body }),
  uploadFile: (taskId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`/tasks/${taskId}/files`, { method: 'POST', body: fd });
  },
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),

  // ── Activity ────────────────────────────────────────────────────────────
  getActivity: (taskId) => request(`/tasks/${taskId}/activity`),
  getRecentActivity: (limit = 20, spaceId = null) =>
    request(`/activity/recent?limit=${limit}${spaceId ? `&space_id=${spaceId}` : ''}`),

  // ── Todos / events / notes / tags ───────────────────────────────────────
  getTodos: (spaceId, date) => request(`/todos?space_id=${spaceId}&date=${date}`),
  createTodo: (body) => request('/todos', { method: 'POST', body }),
  updateTodo: (id, body) => request(`/todos/${id}`, { method: 'PUT', body }),

  getEvents: (spaceId) => request(`/events?space_id=${spaceId}`),
  createEvent: (body) => request('/events', { method: 'POST', body }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  getNotes: (spaceId) => request(`/notes?space_id=${spaceId}`),
  saveNotes: (body) => request('/notes', { method: 'PUT', body }),

  getTags: (spaceId) => request(`/tags?space_id=${spaceId}`),
  getTagsWithUsage: (spaceId) => request(`/tags/with-usage?space_id=${spaceId}`),
  createTag: (body) => request('/tags', { method: 'POST', body }),
  updateTag: (id, body) => request(`/tags/${id}`, { method: 'PUT', body }),
  deleteTag: (id) => request(`/tags/${id}/soft`, { method: 'DELETE' }),
  addTaskTag: (taskId, tagId) => request(`/tasks/${taskId}/tags/${tagId}`, { method: 'POST' }),
  removeTaskTag: (taskId, tagId) => request(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' }),

  // ── Custom fields (Phase B) ─────────────────────────────────────────────
  getSpaceFields: (spaceId) => request(`/spaces/${spaceId}/fields`),
  getSpaceFieldsWithUsage: (spaceId) => request(`/spaces/${spaceId}/fields/with-usage`),
  createField: (spaceId, body) => request(`/spaces/${spaceId}/fields`, { method: 'POST', body }),
  updateField: (spaceId, fieldId, body) => request(`/spaces/${spaceId}/fields/${fieldId}`, { method: 'PUT', body }),
  deleteField: (spaceId, fieldId) => request(`/spaces/${spaceId}/fields/${fieldId}`, { method: 'DELETE' }),
  reorderFields: (spaceId, order) => request(`/spaces/${spaceId}/fields/reorder`, { method: 'PUT', body: { order } }),
  getTaskFields: (taskId) => request(`/tasks/${taskId}/fields`),
  saveTaskFields: (taskId, values) => request(`/tasks/${taskId}/fields`, { method: 'PUT', body: { values } }),

  // ── Preferences ─────────────────────────────────────────────────────────
  getPreferences: () => request('/preferences'),
  savePreferences: (body) => request('/preferences', { method: 'PUT', body }),

  // ── CSV ─────────────────────────────────────────────────────────────────
  exportCsv: (spaceId) => request(`/export/csv${spaceId ? `?space_id=${spaceId}` : ''}`, { raw: true }),
  importCsv: (body) => request('/import/csv', { method: 'POST', body }),

  // ── Global search ───────────────────────────────────────────────────────
  globalSearch: (q, limit = 20, spaceId = null) =>
    request(`/search?q=${encodeURIComponent(q)}&limit=${limit}${spaceId ? `&space_id=${spaceId}` : ''}`),

  // ── Saved views ─────────────────────────────────────────────────────────
  getSavedViews: (spaceId) => request(`/saved-views${spaceId ? `?space_id=${spaceId}` : ''}`),
  createSavedView: (body) => request('/saved-views', { method: 'POST', body }),
  updateSavedView: (id, body) => request(`/saved-views/${id}`, { method: 'PUT', body }),
  deleteSavedView: (id) => request(`/saved-views/${id}`, { method: 'DELETE' }),

  // ── Templates ───────────────────────────────────────────────────────────
  getTemplates: (spaceId) => request(`/templates${spaceId ? `?space_id=${spaceId}` : ''}`),
  createTemplate: (body) => request('/templates', { method: 'POST', body }),
  updateTemplate: (id, body) => request(`/templates/${id}`, { method: 'PUT', body }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
  instantiateTemplate: (id, body) => request(`/templates/${id}/instantiate`, { method: 'POST', body }),

  // ── Focus / Pomodoro ────────────────────────────────────────────────────
  startFocus: (body) => request('/focus/start', { method: 'POST', body }),
  finishFocus: (id, body) => request(`/focus/${id}/finish`, { method: 'PUT', body }),
  getRecentFocus: (limit = 25) => request(`/focus/recent?limit=${limit}`),
  getFocusToday: () => request('/focus/today'),

  // ── Today summary / calendar ────────────────────────────────────────────
  getTodaySummary: () => request('/today-summary'),
  getCalendarRange: (start, end, spaceId) =>
    request(`/calendar?start=${start}&end=${end}${spaceId ? `&space_id=${spaceId}` : ''}`),
};

export default api;
