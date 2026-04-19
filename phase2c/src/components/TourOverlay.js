import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useTour } from './TourContext';

// ═══════════════════════════════════════════════════════════════════════════
// TourOverlay — renders the tour UI when tourActive.
//
// Composed of three layered pieces:
//   1. Backdrop — a fixed-position semi-opaque black layer covering the page,
//      with an SVG cutout for the spotlight target. Pointer-events pass
//      through on the cutout so the user can still interact with spotlighted
//      elements (critical for the "create a task" interactive step).
//   2. Spotlight ring — a glowing outline around the cutout so it's visually
//      prominent.
//   3. SpeechBubble — positioned relative to the spotlight (or screen centre
//      if no spotlight), with tail pointer, message text, and Next/Skip
//      buttons.
//
// Layout caveat: the spotlight target's bounding rect is re-measured on
// window resize AND on a short interval during an active step so that
// layouts which shift (e.g. lazy-loaded content, font swap) don't leave
// the spotlight framing the wrong area.
// ═══════════════════════════════════════════════════════════════════════════

const MEASURE_INTERVAL_MS = 250;
const BUBBLE_OFFSET = 20;

function getTargetRect(selector) {
  if (!selector) return null;
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  } catch (_) { return null; }
}

// Compute the speech bubble position given the spotlight rect and preferred
// anchor. Returns {x, y, placement} where placement tells the bubble which
// direction its tail points.
function computeBubblePosition(rect, anchor, viewportW, viewportH) {
  const bubbleW = 340;
  const bubbleH = 150;  // approximate, CSS may vary; used for clamping only
  if (!rect) {
    // No spotlight — centre of screen
    return {
      x: Math.max(20, (viewportW - bubbleW) / 2),
      y: Math.max(20, (viewportH - bubbleH) / 2),
      placement: 'center',
    };
  }
  let x, y, placement = anchor;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  switch (anchor) {
    case 'top':
      x = cx - bubbleW / 2;
      y = rect.top - bubbleH - BUBBLE_OFFSET;
      break;
    case 'bottom':
      x = cx - bubbleW / 2;
      y = rect.top + rect.height + BUBBLE_OFFSET;
      break;
    case 'left':
      x = rect.left - bubbleW - BUBBLE_OFFSET;
      y = cy - bubbleH / 2;
      break;
    case 'right':
      x = rect.left + rect.width + BUBBLE_OFFSET;
      y = cy - bubbleH / 2;
      break;
    case 'center':
    default:
      x = cx - bubbleW / 2;
      y = cy - bubbleH / 2;
      placement = 'center';
      break;
  }

  // Clamp to viewport so the bubble never leaves the screen.
  x = Math.max(16, Math.min(viewportW - bubbleW - 16, x));
  y = Math.max(16, Math.min(viewportH - bubbleH - 16, y));
  return { x, y, placement };
}

export default function TourOverlay() {
  const { tourActive, currentStep, stepIndex, totalSteps, advance, skip } = useTour();
  const [rect, setRect] = useState(null);
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1400,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  });

  // Re-measure on resize, on step change, and on a small interval during
  // the step (covers delayed renders / lazy content).
  useLayoutEffect(() => {
    if (!tourActive || !currentStep) return;
    const measure = () => {
      setRect(getTargetRect(currentStep.spotlightSelector));
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    const interval = setInterval(measure, MEASURE_INTERVAL_MS);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', measure);
    };
  }, [tourActive, currentStep]);

  // Keyboard: Esc skips the tour, Enter advances.
  useEffect(() => {
    if (!tourActive) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); skip(); }
      else if (e.key === 'Enter') { e.preventDefault(); advance(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tourActive, advance, skip]);

  if (!tourActive || !currentStep) return null;

  const bubble = computeBubblePosition(rect, currentStep.anchor || 'bottom', viewport.w, viewport.h);
  const isAutoStep = currentStep.advance && currentStep.advance !== 'button';
  const manualAdvance = !isAutoStep;

  // SVG mask for the backdrop: a full-rect mask with a rectangular cutout
  // at the spotlight location. Rounded corners on the cutout for polish.
  const PAD = 8;
  const CORNER = 10;
  const cutout = rect ? {
    x: rect.left - PAD,
    y: rect.top - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  } : null;

  return (
    <div className="tour-overlay">
      {/* Backdrop with spotlight cutout */}
      <svg
        className="tour-backdrop"
        width={viewport.w}
        height={viewport.h}
        style={{ pointerEvents: cutout ? 'none' : 'auto' }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width={viewport.w} height={viewport.h} fill="white" />
            {cutout && (
              <rect
                x={cutout.x}
                y={cutout.y}
                width={cutout.width}
                height={cutout.height}
                rx={CORNER}
                ry={CORNER}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width={viewport.w}
          height={viewport.h}
          fill="rgba(5, 8, 15, 0.72)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {cutout && (
        <div
          className="tour-spotlight"
          style={{
            left: cutout.x,
            top: cutout.y,
            width: cutout.width,
            height: cutout.height,
            borderRadius: CORNER,
          }}
        />
      )}

      {/* Speech bubble */}
      <div
        className={`tour-bubble tour-bubble--${bubble.placement}`}
        style={{ left: bubble.x, top: bubble.y }}
        role="dialog"
        aria-live="polite"
      >
        <div className="tour-bubble-header">
          <span className="tour-bubble-name">Kaseki</span>
          <span className="tour-bubble-progress">{stepIndex + 1} / {totalSteps}</span>
        </div>
        <div className="tour-bubble-body">
          {currentStep.speech}
        </div>
        <div className="tour-bubble-actions">
          <button type="button" className="tour-bubble-skip" onClick={skip}>
            Skip tour
          </button>
          {manualAdvance ? (
            <button type="button" className="tour-bubble-next" onClick={advance}>
              {stepIndex + 1 === totalSteps ? 'Done' : 'Next →'}
            </button>
          ) : (
            <span className="tour-bubble-waiting">
              Waiting for you…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
