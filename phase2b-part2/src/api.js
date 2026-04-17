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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  // Auth
  login: (body) => request('/auth/login', { method: 'POST', body }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),

  // Tasks
  getTasks: (section) => request(`/tasks?section=${section}`),
  getArchivedTasks: (section) => request(`/tasks/archived/list?section=${section}`),
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (body) => request('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PUT', body }),
  unarchiveTask: (id) => request(`/tasks/${id}/unarchive`, { method: 'PUT' }),
  reorderTasks: (body) => request('/tasks/reorder', { method: 'PUT', body }),
  weeklyReview: () => request('/tasks/weekly/review'),
  quickCapture: (body) => request('/quick-capture', { method: 'POST', body }),

  // Subtasks
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

  getActivity: (taskId) => request(`/tasks/${taskId}/activity`),
  getRecentActivity: (limit = 20) => request(`/activity/recent?limit=${limit}`),

  // Todos
  getTodos: (section, date) => request(`/todos?section=${section}&date=${date}`),
  createTodo: (body) => request('/todos', { method: 'POST', body }),
  updateTodo: (id, body) => request(`/todos/${id}`, { method: 'PUT', body }),

  // Events
  getEvents: (section) => request(`/events?section=${section}`),
  createEvent: (body) => request('/events', { method: 'POST', body }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  // Notes
  getNotes: (section) => request(`/notes?section=${section}`),
  saveNotes: (body) => request('/notes', { method: 'PUT', body }),

  // Preferences
  getPreferences: () => request('/preferences'),
  savePreferences: (body) => request('/preferences', { method: 'PUT', body }),

  // Tags
  getTags: (section) => request(`/tags?section=${section}`),
  createTag: (body) => request('/tags', { method: 'POST', body }),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),
  addTaskTag: (taskId, tagId) => request(`/tasks/${taskId}/tags/${tagId}`, { method: 'POST' }),
  removeTaskTag: (taskId, tagId) => request(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' }),

  // CSV
  exportCsv: (section) => request(`/export/csv${section ? `?section=${section}` : ''}`, { raw: true }),
  importCsv: (body) => request('/import/csv', { method: 'POST', body }),

  // Global search
  globalSearch: (q, limit = 20) => request(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Saved views
  getSavedViews: (section) => request(`/saved-views${section ? `?section=${section}` : ''}`),
  createSavedView: (body) => request('/saved-views', { method: 'POST', body }),
  updateSavedView: (id, body) => request(`/saved-views/${id}`, { method: 'PUT', body }),
  deleteSavedView: (id) => request(`/saved-views/${id}`, { method: 'DELETE' }),

  // Templates
  getTemplates: (section) => request(`/templates${section ? `?section=${section}` : ''}`),
  createTemplate: (body) => request('/templates', { method: 'POST', body }),
  updateTemplate: (id, body) => request(`/templates/${id}`, { method: 'PUT', body }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
  instantiateTemplate: (id, body) => request(`/templates/${id}/instantiate`, { method: 'POST', body }),

  // Pomodoro / focus sessions
  startFocus: (body) => request('/focus/start', { method: 'POST', body }),
  finishFocus: (id, body) => request(`/focus/${id}/finish`, { method: 'PUT', body }),
  getRecentFocus: (limit = 25) => request(`/focus/recent?limit=${limit}`),
  getFocusToday: () => request('/focus/today'),

  // Today summary
  getTodaySummary: () => request('/today-summary'),

  // Calendar range
  getCalendarRange: (start, end, section) =>
    request(`/calendar?start=${start}&end=${end}${section ? `&section=${section}` : ''}`),
};

export default api;
