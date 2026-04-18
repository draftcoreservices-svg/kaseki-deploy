import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// EventContext — app-wide pub/sub bus for UI signals.
//
// Purpose: let features emit named signals (task_completed, error,
// quick_capture_success, etc.) without knowing who — if anyone — is
// listening. The Orb (Phase H) subscribes to this to drive its emotional
// state machine. Until then, subscribers are zero and signal() is a no-op.
//
// Design:
//   - No persistence. Signals are ephemeral.
//   - No backend. Purely in-memory.
//   - Listeners return an unsubscribe function.
//   - signal() never throws and never blocks — listener errors are logged
//     and swallowed so a broken subscriber cannot cascade.
//
// Usage in features:
//   const { signal } = useEventBus();
//   signal('task_completed', { taskId: t.id });
//
// Usage in subscribers (future Orb, etc.):
//   const { subscribe } = useEventBus();
//   useEffect(() => {
//     return subscribe((event) => {
//       if (event.kind === 'task_completed') doSomething();
//     });
//   }, [subscribe]);
//
// Signal kinds currently understood (extend as needed):
//   task_created          — { taskId }
//   task_completed        — { taskId }
//   task_error            — { message }
//   file_uploaded         — { taskId, count }
//   timer_started         — { taskId }
//   timer_stopped         — { taskId, durationSeconds }
//   dependency_blocked    — { taskId, blockers: [] }
//   app_error             — { message }    (generic error toast peer)
//   app_success           — { message }    (generic success toast peer)
// ═══════════════════════════════════════════════════════════════════════════

const EventContext = createContext(null);

export function EventProvider({ children }) {
  // Ref not state — we never want a re-render just because someone
  // subscribed or unsubscribed.
  const listenersRef = useRef(new Set());

  const subscribe = useCallback((listener) => {
    if (typeof listener !== 'function') return () => {};
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const signal = useCallback((kind, data) => {
    const event = { kind, data: data || null, at: Date.now() };
    for (const listener of listenersRef.current) {
      try { listener(event); }
      catch (e) { console.error('[EventBus] listener threw:', e); }
    }
  }, []);

  const value = useMemo(() => ({ signal, subscribe }), [signal, subscribe]);

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

// Safe accessor — if EventProvider isn't in the tree (e.g. a test harness),
// returns a no-op so callers never need to null-check. This matters because
// we want to encourage sprinkling signal() calls throughout the app without
// defensive code at every site.
export function useEventBus() {
  const ctx = useContext(EventContext);
  if (ctx) return ctx;
  return {
    signal: () => {},
    subscribe: () => () => {},
  };
}

export default EventContext;
