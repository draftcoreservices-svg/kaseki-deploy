// ═══════════════════════════════════════════════════════════════════════════
// tour-script.js — Phase H Stage 2.
//
// Ordered steps for Kaseki's onboarding tour. This file ships with a 3-step
// proof-of-concept covering intro / task list spotlight / goodbye. The full
// 10-step script (space header, task detail, timeline, notes, timer, clients,
// shortcuts) lands in Stage 2 session 2 when the infrastructure has been
// validated in production.
//
// Step shape:
//   - id                 — string identifier for debugging
//   - speech             — what Kaseki says; kept short. Multi-sentence ok.
//   - spotlightSelector  — CSS selector to spotlight, or null for no spotlight
//                           (bubble centres on screen instead)
//   - anchor             — 'top' | 'right' | 'bottom' | 'left' | 'center'
//                           — where the speech bubble sits relative to the
//                             spotlight. Ignored if no spotlight.
//   - advance            — 'button' (user clicks Next) |
//                           { event: '<signal-kind>' } to auto-advance when
//                           that EventContext signal fires
//
// Voice: warm, slightly playful, matches the legal-docs register from Phase
// C Batch 2. Never more than ~2 sentences — the bubble is small and the
// user is reading, not listening to a lecture.
// ═══════════════════════════════════════════════════════════════════════════

const TOUR_SCRIPT = [
  {
    id: 'intro',
    speech: "Hi, I'm Kaseki. I live in the corner, I'll show you around the place, and then I'll mostly keep quiet unless something interesting happens.",
    spotlightSelector: null,
    anchor: 'center',
    advance: 'button',
  },
  {
    id: 'task-list',
    // Spotlights the "+ New" button specifically. The class on the button
    // was originally just .dash-add-btn, but that selector also matches the
    // archive/active toggle (first in DOM order), which led to the tour
    // spotlighting the wrong button and getting stuck in a loop when the
    // user clicked the archive toggle instead. Targeting the more specific
    // .dash-add-btn--new modifier fixes it.
    speech: "This is your task list. Try clicking '+ New' to add something — I'll wait.",
    spotlightSelector: '.dash-add-btn--new',
    anchor: 'right',
    advance: { event: 'task_created' },
  },
  {
    id: 'goodbye',
    speech: "Perfect. That's everything you need for now. I'll be in the corner — drag me wherever you like, and if you ever want the tour again, there's a button in Settings.",
    spotlightSelector: null,
    anchor: 'center',
    advance: 'button',
  },
];

export default TOUR_SCRIPT;
