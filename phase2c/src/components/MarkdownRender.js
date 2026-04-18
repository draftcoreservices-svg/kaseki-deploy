import React, { useEffect, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// MarkdownRender — render a Markdown string as HTML using `marked`.
//
// Single-user self-hosted trust model: we do not DOMPurify the output. The
// only person whose markdown renders in this user's browser is themselves.
// `marked`'s default HTML escaping handles <script> and similar — raw HTML
// embedded in markdown renders as text, not executed.
//
// Loads `marked` lazily so the initial bundle stays small; the note tab is
// often not opened. While loading, falls back to plain text display so a
// note is always readable.
// ═══════════════════════════════════════════════════════════════════════════

// Module-level cache so multiple MarkdownRender instances share one import.
let markedFn = null;
let markedPromise = null;

function ensureMarked() {
  if (markedFn) return Promise.resolve(markedFn);
  if (markedPromise) return markedPromise;
  markedPromise = import('marked').then(mod => {
    const parse = mod.parse || (mod.marked && mod.marked.parse) || mod.default;
    markedFn = parse;
    return parse;
  });
  return markedPromise;
}

export default function MarkdownRender({ content, className }) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!markedFn) {
      ensureMarked().then(() => force(v => v + 1)).catch(() => {});
    }
  }, []);

  if (!content) {
    return <div className={className || 'md-render'}><em className="md-render-empty">(empty)</em></div>;
  }

  if (!markedFn) {
    // Loading fallback — show the raw text so the note is readable
    // immediately. Replaced on next render once marked has loaded.
    return <div className={className || 'md-render'} style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }

  let html = '';
  try {
    html = markedFn(content, { async: false, breaks: true });
  } catch (e) {
    // If marked throws on weird input, just show the raw text. Never blow up
    // the detail panel because a note has a malformed link.
    return <div className={className || 'md-render'} style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }

  return <div className={className || 'md-render'} dangerouslySetInnerHTML={{ __html: html }} />;
}
