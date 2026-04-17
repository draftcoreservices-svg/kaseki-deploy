import React, { useState, useEffect } from 'react';
import api from '../api';

const MODULE_CARDS = [
  { id: 'quick-notes', icon: '📝', name: 'Quick Notes', desc: 'Persistent scratchpad for ideas & lists' },
  { id: 'contacts', icon: '👥', name: 'Contacts', desc: 'Key people with phone, email, address' },
  { id: 'server-status', icon: '🖥️', name: 'Server Status', desc: 'Docker services at a glance' },
  { id: 'bookmarks', icon: '🔖', name: 'Bookmarks', desc: 'Quick links to frequently used URLs' },
  { id: 'weather', icon: '🌤️', name: 'Weather', desc: 'Current weather and 3-day forecast' },
  { id: 'world-clocks', icon: '🕐', name: 'World Clocks', desc: 'Multiple time zones at once' },
  { id: 'habit-tracker', icon: '✅', name: 'Habit Tracker', desc: 'Daily habits with streak counting' },
  { id: 'budget-tracker', icon: '💰', name: 'Budget Tracker', desc: 'Monthly income vs expenses' },
  { id: 'upcoming', icon: '📅', name: 'Upcoming', desc: 'Deadlines & events from Home and Work' },
  { id: 'countdown', icon: '⏳', name: 'Countdown Timers', desc: 'Countdown to specific dates' },
  { id: 'media-watchlist', icon: '🎬', name: 'Media Watchlist', desc: 'Films, TV, anime, books tracker' },
  { id: 'health-log', icon: '❤️', name: 'Health Log', desc: 'Weight, medication, appointments' },
];

function useTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Orb() {
  return (
    <div className="landing-orb" title="Kaseki Orb">
      <div className="landing-orb-pulse" />
      <div className="landing-orb-inner" />
      <div className="landing-orb-core" />
    </div>
  );
}

function formatRelativeTime(iso) {
  const then = new Date(iso + (iso.includes('Z') ? '' : 'Z'));
  const now = new Date();
  const diff = Math.floor((now - then) / 1000);
  if (isNaN(diff)) return '';
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function describeActivity(a) {
  const map = {
    created: 'Created',
    status_changed: 'Status changed',
    archived: 'Archived',
    unarchived: 'Restored',
    pinned: 'Pinned',
    unpinned: 'Unpinned',
    edited: 'Edited',
    note_added: 'Note added',
    subtask_added: 'Subtask added',
    subtask_removed: 'Subtask removed',
    subtask_completed: 'Subtask done',
    subtask_uncompleted: 'Subtask reopened',
    file_uploaded: 'File uploaded',
    file_deleted: 'File deleted',
    tagged: 'Tag added',
    untagged: 'Tag removed',
    moved: 'Moved',
  };
  return map[a.action] || a.action;
}

function ActivityFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    api.getRecentActivity(10)
      .then(d => { if (!cancelled) setItems(d.activity || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (items.length === 0) {
    return <div className="landing-activity-empty">No recent activity</div>;
  }
  return (
    <div className="landing-activity-feed">
      {items.map(a => (
        <div key={a.id} className="landing-activity-item">
          <div className={`landing-activity-badge landing-activity-badge--${a.task_section}`}>
            {a.task_section === 'work' ? '💼' : a.task_section === 'inbox' ? '📥' : '🏠'}
          </div>
          <div className="landing-activity-info">
            <div className="landing-activity-text">
              <strong>{describeActivity(a)}</strong> · {a.task_title}
            </div>
            <div className="landing-activity-meta">{formatRelativeTime(a.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage({ user, theme, onToggleTheme, onSelectSection, onLogout }) {
  const now = useTime();

  const formatDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const displayName = user?.displayName || user?.username || 'there';
  const firstName = displayName.split(' ')[0];
  const capitalised = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="landing-page">
      <div className="landing-bg">
        <div className="landing-bg-noise" />
      </div>

      {/* Header */}
      <div className="landing-header">
        <div className="landing-greeting">
          <span className="landing-greeting-wave">👋</span>
          Hey, <strong>{capitalised}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onToggleTheme}
            style={{ padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-tertiary)', fontSize: '0.9rem', transition: 'all 150ms ease' }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="landing-logout" onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      {/* Main content */}
      <div className="landing-content">
        {/* Left — Sections */}
        <div className="landing-left">
          <div className="landing-title">What are we working on?</div>
          <div className="landing-sections">
            <button className="landing-card landing-card--home" onClick={() => onSelectSection('home')} style={{ animationName: 'cardStagger1', animationDuration: '500ms', animationTimingFunction: 'var(--ease-out)', animationFillMode: 'both', animationDelay: '100ms' }}>
              <div className="landing-card-glow" />
              <div className="landing-card-content">
                <div className="landing-card-icon">🏠</div>
                <div className="landing-card-title">Home</div>
                <div className="landing-card-desc">Personal tasks, goals & life admin</div>
              </div>
              <div className="landing-card-arrow">→</div>
            </button>

            <button className="landing-card landing-card--work" onClick={() => onSelectSection('work')} style={{ animationName: 'cardStagger2', animationDuration: '500ms', animationTimingFunction: 'var(--ease-out)', animationFillMode: 'both', animationDelay: '200ms' }}>
              <div className="landing-card-glow" />
              <div className="landing-card-content">
                <div className="landing-card-icon">💼</div>
                <div className="landing-card-title">Work</div>
                <div className="landing-card-desc">Cases, clients & court schedule</div>
              </div>
              <div className="landing-card-arrow">→</div>
            </button>

            <button className="landing-card landing-card--inbox" onClick={() => onSelectSection('inbox')} style={{ animationName: 'cardStagger1', animationDuration: '500ms', animationTimingFunction: 'var(--ease-out)', animationFillMode: 'both', animationDelay: '300ms' }}>
              <div className="landing-card-glow" />
              <div className="landing-card-content">
                <div className="landing-card-icon">📥</div>
                <div className="landing-card-title">Inbox</div>
                <div className="landing-card-desc">Quick-captured items to triage</div>
              </div>
              <div className="landing-card-arrow">→</div>
            </button>
          </div>

          {/* Activity Feed */}
          <div style={{ marginTop: 20 }}>
            <div className="landing-right-title" style={{ marginBottom: 10 }}>Recent Activity</div>
            <ActivityFeed />
          </div>
        </div>

        {/* Right — Module cards */}
        <div className="landing-right">
          <div className="landing-right-title">Quick Access</div>
          <div className="landing-modules">
            {MODULE_CARDS.map((card, i) => (
              <button
                key={card.id}
                className="landing-module"
                style={{ animationName: 'slideUp', animationDuration: '400ms', animationTimingFunction: 'var(--ease-out)', animationFillMode: 'both', animationDelay: `${150 + i * 50}ms` }}
                onClick={() => {}}
              >
                <div className="landing-module-icon">{card.icon}</div>
                <div className="landing-module-info">
                  <div className="landing-module-name">{card.name}</div>
                  <div className="landing-module-desc">{card.desc}</div>
                </div>
                <div className="landing-module-arrow">›</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="landing-bottom">
        <div className="landing-version">Kaseki v2.0.0 · Press <kbd>/</kbd> to search, <kbd>Shift+N</kbd> to capture, <kbd>?</kbd> for shortcuts</div>
        <div className="landing-bottom-right">
          <div className="landing-datetime">
            <div className="landing-date">{formatDate(now)}</div>
            <div className="landing-time">{formatTime(now)}</div>
          </div>
          <Orb />
        </div>
      </div>
    </div>
  );
}
