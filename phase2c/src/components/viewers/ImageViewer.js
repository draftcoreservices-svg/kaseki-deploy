import React, { useState, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// ImageViewer
//
// Zoom with wheel or +/- buttons, pan by dragging when zoomed in. Starts
// fit-to-viewport. Double-click resets. Purely CSS transforms — no canvas,
// no library.
// ═══════════════════════════════════════════════════════════════════════════

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

export default function ImageViewer({ url, alt }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset zoom/pan when the image source changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setError(false);
  }, [url]);

  const zoomBy = (factor, centerX, centerY) => {
    setZoom(z => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      // If zoom is back to 1 the pan should recentre.
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const onWheel = (e) => {
    // Zoom with wheel. We preventDefault to stop the outer scroll from eating
    // it. Positive deltaY = wheel down = zoom out.
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomBy(factor, e.clientX, e.clientY);
  };

  const onMouseDown = (e) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  };

  const onMouseUp = () => setDragging(false);

  const onDoubleClick = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (error) {
    return <div className="dv-error">Failed to load image.</div>;
  }

  return (
    <div className="dv-image">
      <div className="dv-image-toolbar">
        <button className="dv-iconbtn" onClick={() => zoomBy(1 / 1.25)} title="Zoom out">−</button>
        <button
          className="dv-iconbtn"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          title="Reset (or double-click image)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className="dv-iconbtn" onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
      </div>
      <div
        className={`dv-image-stage${dragging ? ' dv-image-stage--dragging' : ''}${zoom > 1 ? ' dv-image-stage--zoomable' : ''}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          src={url}
          alt={alt || ''}
          draggable={false}
          onError={() => setError(true)}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.1s ease-out',
          }}
        />
      </div>
    </div>
  );
}
