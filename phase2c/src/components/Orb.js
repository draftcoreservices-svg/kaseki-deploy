import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEventBus } from './EventContext';

// ═══════════════════════════════════════════════════════════════════════════
// Orb — Kaseki (the character).
//
// The Orb is the digitised physical representation of Kaseki (the app).
// Its mood is the app's mood. Subscribes to the EventContext bus; emits
// ephemeral visual reactions to signals. Stays quiet otherwise.
//
// Design spec (Phase H Stage 1):
//   - ~90px circle with soft radial gradient. Breathes 86↔94 over 4s.
//   - Two small eye dots that express state:
//       normal    — round
//       focused   — narrow (timer active)
//       widened   — error reaction
//       curved    — "happy" on celebrations (eyes_happy)
//   - Colour picks up the active space's accent via spaceColor prop.
//     Landing page (no space) shows a neutral blue-grey.
//   - Reaction FX (all brief, non-interactive):
//       task_completed → warm flare + scale burst + 4 sparkle particles
//       task_created   → tiny squish-bounce
//       task_error     → flinch (shake + red tint + eyes widen)
//       app_error      → same as task_error
//       timer_started  → focus state (eyes narrow, slower breathing)
//       timer_stopped  → focus state off + small satisfaction pulse
//       file_uploaded  → downward ripple ring
//   - Draggable by mouse/touch. Position persists to localStorage.
//     Double-click returns to default corner.
//
// Stage 2+ (not built yet):
//   - Speech bubble infrastructure exists (state + render slot) but no
//     orchestrated tour content. Tour scripting lives in a future file.
//   - Per-event distinct celebrations. Currently one generic sparkle burst.
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_POS = { x: null, y: null, corner: 'br' }; // resolved on mount
const STORAGE_KEY = 'kaseki.orb.position';
const ORB_SIZE = 90;
const MARGIN = 24;

function resolveDefaultPosition() {
  // Bottom-right corner with margin. Computed on mount because window size
  // isn't known at module load.
  const w = typeof window !== 'undefined' ? window.innerWidth : 1400;
  const h = typeof window !== 'undefined' ? window.innerHeight : 900;
  return {
    x: w - ORB_SIZE - MARGIN,
    y: h - ORB_SIZE - MARGIN,
  };
}

function loadPosition() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch (e) { /* ignore */ }
  return null;
}

function savePosition(pos) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch (e) { /* ignore */ }
}

// Clamp position so the Orb is always fully on-screen, even after viewport
// resize. Accepts floats; returns integers for crisp CSS.
function clampToViewport(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.round(Math.max(0, Math.min(w - ORB_SIZE, x))),
    y: Math.round(Math.max(0, Math.min(h - ORB_SIZE, y))),
  };
}

export default function Orb({ spaceColor }) {
  const { subscribe } = useEventBus();
  const rootRef = useRef(null);

  // Position: lazily initialise once we know the window size.
  const [pos, setPos] = useState(null);
  // Drag state
  const dragState = useRef({ active: false, offsetX: 0, offsetY: 0, moved: false });

  // Reaction state: a transient CSS class that plays once then clears itself.
  // Stacks are rare (celebrations are short); if another reaction comes in
  // while one is playing, we override — most recent wins.
  const [reaction, setReaction] = useState(null); // 'celebrate' | 'create' | 'flinch' | 'ripple' | null
  const [focusMode, setFocusMode] = useState(false);
  // Particle bursts — each entry is a render instance; we generate 4 sparkles
  // on celebrate. Cleared after their CSS animation ends.
  const [particles, setParticles] = useState([]);

  // Initialise position on mount from storage or default corner.
  useEffect(() => {
    const stored = loadPosition();
    if (stored) {
      setPos(clampToViewport(stored.x, stored.y));
    } else {
      setPos(resolveDefaultPosition());
    }
  }, []);

  // Keep on-screen across window resize.
  useEffect(() => {
    const onResize = () => setPos(p => p ? clampToViewport(p.x, p.y) : p);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Trigger a reaction, clearing any prior transient. Focus mode is separate
  // because it's persistent (lasts while a timer is running), not transient.
  const triggerReaction = useCallback((kind, durationMs = 800) => {
    setReaction(kind);
    // Clear after the animation window ends.
    const t = setTimeout(() => setReaction(null), durationMs);
    return () => clearTimeout(t);
  }, []);

  // Generate N sparkle particles with random angles/distances for celebrations.
  const emitSparkles = useCallback((count = 4) => {
    const id = Date.now();
    const newParticles = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 50 + Math.random() * 30;
      return {
        id: id + i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        hue: 40 + Math.random() * 30, // warm yellow-orange
      };
    });
    setParticles(p => [...p, ...newParticles]);
    // Clear after the particle animation ends.
    setTimeout(() => {
      setParticles(p => p.filter(x => !newParticles.find(np => np.id === x.id)));
    }, 900);
  }, []);

  // Wire to the event bus. All reactions defined here.
  useEffect(() => {
    const unsub = subscribe((event) => {
      switch (event.kind) {
        case 'task_completed':
          triggerReaction('celebrate', 900);
          emitSparkles(4);
          break;
        case 'task_created':
          triggerReaction('create', 400);
          break;
        case 'task_error':
        case 'app_error':
          triggerReaction('flinch', 500);
          break;
        case 'timer_started':
          setFocusMode(true);
          break;
        case 'timer_stopped':
          setFocusMode(false);
          triggerReaction('relax', 600);
          break;
        case 'file_uploaded':
          triggerReaction('ripple', 700);
          break;
        case 'app_success':
          triggerReaction('create', 400);
          break;
        default:
          /* unknown kind — Orb stays quiet */
          break;
      }
    });
    return unsub;
  }, [subscribe, triggerReaction, emitSparkles]);

  // Drag handlers. We use pointer events for unified mouse + touch handling.
  const onPointerDown = useCallback((e) => {
    if (!rootRef.current || !pos) return;
    // Only primary button for mouse; touches always have button === 0.
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    rootRef.current.setPointerCapture(e.pointerId);
    const rect = rootRef.current.getBoundingClientRect();
    dragState.current = {
      active: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    };
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    if (!dragState.current.active) return;
    const nextX = e.clientX - dragState.current.offsetX;
    const nextY = e.clientY - dragState.current.offsetY;
    dragState.current.moved = true;
    setPos(clampToViewport(nextX, nextY));
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    if (rootRef.current) {
      try { rootRef.current.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    // Only persist when the user actually dragged (not on click-without-drag).
    if (dragState.current.moved && pos) {
      savePosition(pos);
    } else {
      // Treat as click — nudge Kaseki to "notice" the click.
      triggerReaction('create', 300);
    }
  }, [pos, triggerReaction]);

  const onDoubleClick = useCallback(() => {
    // Reset to default corner.
    const def = resolveDefaultPosition();
    setPos(def);
    savePosition(def);
  }, []);

  if (!pos) return null; // not initialised yet

  // Compose the body colour. If a spaceColor is provided, lean toward it;
  // otherwise use a neutral Kaseki blue-grey.
  const bodyColor = spaceColor || '#5b7a9e';

  // Root class stacks reaction state with focus/breathing.
  const rootClasses = [
    'orb',
    reaction ? `orb--react-${reaction}` : '',
    focusMode ? 'orb--focus' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={rootRef}
      className={rootClasses}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        '--orb-color': bodyColor,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      role="img"
      aria-label="Kaseki"
      title="Kaseki (drag to move, double-click to reset)"
    >
      <div className="orb-body">
        <div className="orb-eye orb-eye--left" />
        <div className="orb-eye orb-eye--right" />
      </div>
      {/* Downward ripple for file uploads — absolutely positioned relative
          to the orb. Rendered only while the reaction is active so the
          animation restarts cleanly on each trigger. */}
      {reaction === 'ripple' && <div className="orb-ripple" />}
      {/* Sparkle particles for celebrations */}
      {particles.map(p => (
        <div
          key={p.id}
          className="orb-sparkle"
          style={{
            '--sparkle-dx': `${p.dx}px`,
            '--sparkle-dy': `${p.dy}px`,
            '--sparkle-hue': p.hue,
          }}
        />
      ))}
    </div>
  );
}
