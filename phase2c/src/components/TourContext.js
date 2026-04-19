import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useEventBus } from './EventContext';
import api from '../api';

// ═══════════════════════════════════════════════════════════════════════════
// TourContext — Phase H Stage 2.
//
// Runs the Orb-led onboarding tour. The tour is a sequence of "steps", each
// defined by an object shaped roughly:
//   {
//     id: 'intro',
//     speech: 'Hi, I\'m Kaseki. I\'m going to show you around.',
//     spotlightSelector: null,    // CSS selector to spotlight, or null for none
//     anchor: 'center',           // where the speech bubble sits relative to
//                                  // the spotlight ('top' | 'right' | 'bottom' |
//                                  // 'left' | 'center' | near orb if null)
//     advance: 'button',          // 'button' (manual Next) |
//                                  // { event: 'task_created' } (auto-advance)
//     onBeforeShow: ({ api }) => {...} // optional hook
//   }
//
// The context exposes:
//   - tourActive (bool)          — is the tour currently showing?
//   - stepIndex                  — current step number
//   - currentStep                — the full step object
//   - advance()                  — go to next step (or complete if at end)
//   - skip()                     — abort the tour and mark completed
//   - start(script)              — begin a tour with the given script
//
// The tour itself doesn't render — it drives a <TourOverlay /> which is
// rendered once at app-root level and reads from this context.
// ═══════════════════════════════════════════════════════════════════════════

const TourContext = createContext(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}

export function TourProvider({ children }) {
  const [tourActive, setTourActive] = useState(false);
  const [script, setScript] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const { subscribe } = useEventBus();

  // Track whether the user has already been flagged as complete so repeated
  // calls don't hammer the API. Refs are fine — they don't need to trigger
  // re-renders.
  const completedRef = useRef(false);

  const markCompletedOnServer = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    try { await api.savePreferences({ tour_completed: 1 }); }
    catch (_) { /* best-effort — no UI on failure */ }
  }, []);

  const start = useCallback((newScript) => {
    if (!Array.isArray(newScript) || newScript.length === 0) return;
    completedRef.current = false;
    setScript(newScript);
    setStepIndex(0);
    setTourActive(true);
  }, []);

  const advance = useCallback(() => {
    setStepIndex(i => {
      const next = i + 1;
      if (next >= script.length) {
        // End of tour — dismiss and persist completion.
        setTourActive(false);
        markCompletedOnServer();
        return i;
      }
      return next;
    });
  }, [script.length, markCompletedOnServer]);

  const skip = useCallback(() => {
    setTourActive(false);
    markCompletedOnServer();
  }, [markCompletedOnServer]);

  // Auto-advance on event. Each step may declare an advance trigger that
  // waits for a specific EventContext signal (e.g. 'task_created' when the
  // user is asked to create their first task).
  useEffect(() => {
    if (!tourActive) return;
    const step = script[stepIndex];
    if (!step || !step.advance || step.advance === 'button') return;
    if (step.advance.event) {
      const wanted = step.advance.event;
      const unsub = subscribe((event) => {
        if (event.kind === wanted) {
          // Small delay so the user sees their own action land (the Orb's
          // celebration plays, the task appears) before Kaseki moves on.
          setTimeout(() => advance(), 500);
        }
      });
      return unsub;
    }
  }, [tourActive, stepIndex, script, subscribe, advance]);

  const currentStep = tourActive ? script[stepIndex] : null;

  const value = {
    tourActive, stepIndex, currentStep, totalSteps: script.length,
    start, advance, skip,
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
