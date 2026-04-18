import React, { useState, useEffect } from 'react';
import api from '../api';
import TodayPanel from '../components/TodayPanel';
import SpaceIcon from '../components/SpaceIcon';
import LegalModal from '../components/LegalModal';
import CountdownModal from '../components/CountdownModal';

const MODULE_CARDS = [
  { id: 'quick-notes', icon: '📝', name: 'Quick Notes', desc: 'Persistent scratchpad for ideas & lists' },
  { id: 'contacts', icon: '👥', name: 'Contacts', desc: 'Key people with phone, email, address' },
  { id: 'server-status', icon: '🖥️', name: 'Server Status', desc: 'Docker services at a glance' },
  { id: 'bookmarks', icon: '🔖', name: 'Bookmarks', desc: 'Quick links to frequently used URLs' },
  { id: 'weather', icon: '🌤️', name: 'Weather', desc: 'Current weather and 3-day forecast' },
  { id: 'world-clocks', icon: '🕐', name: 'World Clocks', desc: 'Multiple time zones at once' },
  { id: 'habit-tracker', icon: '✅', name: 'Habit Tracker', desc: 'Daily habits with streak counting' },
  { id: 'budget-tracker', icon: '💰', name: 'Budget Tracker', desc: 'Monthly income vs expenses' },
  { id: 'upcoming', icon: '📅', name: 'Upcoming', desc: 'Deadlines & events across all spaces' },
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

function formatRelativeTime(iso) {
  if (!iso) return '';
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
    focus_session: 'Pomodoro',
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
          <div
            className="landing-activity-badge"
            style={{
              background: (a.space_color || '#6b7280') + '22',
              color: a.space_color || '#9ca3af',
            }}
          >
            <SpaceIcon icon={a.space_icon || 'home'} color={a.space_color || '#6b7280'} size={14} />
          </div>
          <div className="landing-activity-info">
            <div className="landing-activity-text">
              <strong>{describeActivity(a)}</strong> · {a.task_title}
            </div>
            <div className="landing-activity-meta">
              {a.space_name && <span>{a.space_name} · </span>}
              {formatRelativeTime(a.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage({ user, theme, onToggleTheme, onSelectSpace, onOpenTaskInSpace, onLogout, onOpenPomodoro, onOpenSettings, onOpenHelp }) {
  const now = useTime();
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [presetsByKey, setPresetsByKey] = useState({});
  // Which legal document modal is currently open, or null for none.
  const [legalDoc, setLegalDoc] = useState(null);
  // Phase C Batch 3 — countdown modal open flag. Wired to the Countdown
  // Timers Quick Access card.
  const [countdownOpen, setCountdownOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getSpaces()
      .then(d => { if (!cancelled) setSpaces((d.spaces || []).filter(s => !s.hidden)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    // Load preset metadata so we can show proper preset names on cards
    // instead of lowercased IDs. Non-critical — silent on failure.
    api.getOnboardingPresets?.()
      .then(d => {
        if (cancelled) return;
        const map = {};
        for (const p of (d?.presets || [])) map[p.preset] = p;
        setPresetsByKey(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const formatDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const displayName = user?.display_name || user?.displayName || user?.username || 'there';
  const firstName = displayName.split(' ')[0];
  const capitalised = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="landing-p2c-root">
      <div className="landing-p2c-header">
        <div className="landing-p2c-greeting">
          <span>👋</span>
          Hey, <strong>{capitalised}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onToggleTheme}
            className="icon-btn"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {onOpenHelp && (
            <button
              onClick={onOpenHelp}
              className="icon-btn"
              title="Keyboard shortcuts (press ? anywhere)"
              aria-label="Keyboard shortcuts"
            >⌨️</button>
          )}
          {onOpenSettings && (
            <button className="icon-btn" onClick={onOpenSettings} title="Settings">⚙️</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign Out</button>
        </div>
      </div>

      <div className="landing-p2c-content">
        <div>
          <TodayPanel onNavigateSpace={onSelectSpace} onOpenPomodoro={onOpenPomodoro} />

          <div className="landing-p2c-title" style={{ marginTop: 28 }}>What are we working on?</div>
          {loading ? (
            <div className="landing-p2c-empty">Loading your spaces…</div>
          ) : spaces.length === 0 ? (
            <div className="landing-p2c-empty">
              No visible spaces. <button className="btn btn-ghost btn-sm" onClick={onOpenSettings}>Open Settings</button> to create or un-hide one.
            </div>
          ) : (
            <div className="landing-p2c-spaces">
              {spaces.map(s => (
                <button
                  key={s.id}
                  className="landing-p2c-card"
                  onClick={() => onSelectSpace(s)}
                  style={{
                    '--card-accent': s.color,
                    '--card-accent-bg': s.color + '22',
                  }}
                >
                  <div className="landing-p2c-card-icon">
                    <SpaceIcon icon={s.icon} color={s.color} size={28} />
                  </div>
                  <div className="landing-p2c-card-info">
                    <div className="landing-p2c-card-name">{s.name}</div>
                    {s.preset && <div className="landing-p2c-card-sub">{presetsByKey[s.preset]?.name || s.preset} space</div>}
                  </div>
                  <div className="landing-p2c-card-arrow">→</div>
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 28 }}>
            <div className="landing-p2c-right-title">Recent activity</div>
            <ActivityFeed />
          </div>
        </div>

        <div>
          <div className="landing-p2c-right-title">Quick access</div>
          <div className="landing-p2c-quick-access">
            {MODULE_CARDS.map(card => {
              // Phase C Batch 3 — only `countdown` is wired so far. Other
              // cards remain dimmed with a "Coming in a future phase"
              // tooltip. We deliberately do NOT use `disabled` on the button
              // because browsers hide `title` tooltips on disabled elements,
              // and we want the tooltip to show.
              const handlers = {
                countdown: () => setCountdownOpen(true),
              };
              const handler = handlers[card.id];
              return (
                <button
                  key={card.id}
                  className={`landing-p2c-qa-card${handler ? '' : ' landing-p2c-qa-card--pending'}`}
                  onClick={handler || (() => {})}
                  title={handler ? card.name : 'Coming in a future phase'}
                  aria-disabled={!handler}
                >
                  <span className="landing-p2c-qa-icon">{card.icon}</span>
                  <div className="landing-p2c-qa-info">
                    <div className="landing-p2c-qa-name">{card.name}</div>
                    <div className="landing-p2c-qa-desc">{card.desc}</div>
                  </div>
                  <span className="landing-p2c-qa-arrow">›</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="landing-p2c-footer">
        <div>
          Kaseki v2.1.0 · Press <kbd>/</kbd> to search, <kbd>Shift+N</kbd> to capture, <kbd>?</kbd> for shortcuts
        </div>
        <div className="landing-p2c-footer-legal">
          <span className="landing-p2c-footer-signature">Self-hosted · No tracking · No third-party access</span>
          <span className="landing-p2c-footer-sep">·</span>
          <button className="landing-p2c-footer-link" onClick={() => setLegalDoc('terms')}>Terms</button>
          <span className="landing-p2c-footer-sep">·</span>
          <button className="landing-p2c-footer-link" onClick={() => setLegalDoc('privacy')}>Privacy</button>
          <span className="landing-p2c-footer-sep">·</span>
          <button className="landing-p2c-footer-link" onClick={() => setLegalDoc('acceptable-use')}>Acceptable Use</button>
        </div>
        <div>
          <span>{formatDate(now)} · {formatTime(now)}</span>
        </div>
      </div>
      <LegalModal docId={legalDoc} onClose={() => setLegalDoc(null)} />
      <CountdownModal
        open={countdownOpen}
        onClose={() => setCountdownOpen(false)}
        onOpenTask={onOpenTaskInSpace}
      />
    </div>
  );
}
