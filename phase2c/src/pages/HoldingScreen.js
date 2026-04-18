import React, { useState, useEffect } from 'react';
import { Settings, LogOut, Sun, Moon } from 'lucide-react';
import api from '../api';
import SpaceIcon from '../components/SpaceIcon';

export default function HoldingScreen({ user, theme, onToggleTheme, onOpenSettings, onLogout }) {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSpaces()
      .then(d => setSpaces(d.spaces || []))
      .catch(() => setSpaces([]))
      .finally(() => setLoading(false));
  }, []);

  const greeting = user?.display_name || user?.username || 'friend';

  return (
    <div className="holding-root">
      <header className="holding-header">
        <div className="holding-brand">Kaseki</div>
        <div className="holding-header-actions">
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
            <Settings size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="holding-main">
        <h1 className="holding-title">Hey {greeting}.</h1>
        <p className="holding-lead">
          Your spaces are set up and the new foundation is live. The full dashboard is being rebuilt
          on top of spaces and ships in the next deploy. For now, you can manage spaces from Settings.
        </p>

        {loading ? (
          <div className="holding-spinner">Loading spaces…</div>
        ) : spaces.length === 0 ? (
          <div className="holding-empty">
            <p>No active spaces. Go to Settings to create one, or re-run onboarding.</p>
            <button type="button" className="btn btn-primary" onClick={onOpenSettings}>Open Settings</button>
          </div>
        ) : (
          <>
            <div className="holding-spaces-title">Your spaces</div>
            <div className="holding-spaces">
              {spaces.map(s => (
                <div key={s.id} className="holding-space-card" style={{ borderColor: s.color + '40' }}>
                  <SpaceIcon icon={s.icon} color={s.color} size={28} />
                  <div className="holding-space-info">
                    <div className="holding-space-name">{s.name}</div>
                    {s.preset && <div className="holding-space-sub">{s.preset}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="holding-footnote">
          <strong>What's live now:</strong> space creation, settings, onboarding.<br />
          <strong>Coming in the next deploy:</strong> dashboards, tasks, todos, events, notes, tags,
          search, pomodoro, templates, saved views.
        </div>
      </main>

      <footer className="holding-footer">
        <span>Kaseki v2.1.0 — Deploy 1a (foundation)</span>
      </footer>
    </div>
  );
}
