import React, { useState, useEffect, useCallback, useRef } from 'react';
import PdfViewer from './viewers/PdfViewer';
import ImageViewer from './viewers/ImageViewer';
import TextViewer from './viewers/TextViewer';

// ═══════════════════════════════════════════════════════════════════════════
// DocumentViewer — Phase D
//
// Full-screen overlay that renders any attached file inline. Supports PDF,
// images, plain text, markdown, and CSV. Provides a sidebar listing all
// files on the current task plus keyboard navigation (← → to cycle, Esc to
// close, Space for fullscreen toggle).
//
// Rendered from TaskDetail above its own overlay. Opening this does NOT
// close TaskDetail — closing this returns the user straight to TaskDetail.
// ═══════════════════════════════════════════════════════════════════════════

// Map a file to one of the renderer kinds, or 'unsupported' as a fallback.
// Strategy: use mime_type first, fall back to extension. We try to be
// generous — ".md" files often come in as text/plain or application/octet-stream,
// and CSVs sometimes arrive as text/plain too.
export function detectKind(file) {
  if (!file) return 'unsupported';
  const mime = (file.mime_type || '').toLowerCase();
  const name = (file.original_name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) {
    return 'image';
  }
  if (ext === 'md' || ext === 'markdown' || mime === 'text/markdown') return 'markdown';
  if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv') return 'csv';
  if (mime.startsWith('text/') || ['txt', 'log', 'json', 'xml', 'yaml', 'yml', 'js', 'css', 'html', 'py', 'sh', 'sql'].includes(ext)) {
    return 'text';
  }
  return 'unsupported';
}

// Human-friendly label for the file list row.
function fileIcon(kind) {
  switch (kind) {
    case 'pdf': return '📄';
    case 'image': return '🖼️';
    case 'markdown': return '📝';
    case 'csv': return '📊';
    case 'text': return '📋';
    default: return '📎';
  }
}

function fileSize(b) {
  if (b == null) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function DocumentViewer({ files, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(() => {
    if (!files || files.length === 0) return 0;
    return Math.max(0, Math.min(initialIndex, files.length - 1));
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef(null);

  const file = files && files.length > 0 ? files[index] : null;
  const kind = detectKind(file);

  const next = useCallback(() => {
    if (!files || files.length === 0) return;
    setIndex(i => (i + 1) % files.length);
  }, [files]);

  const prev = useCallback(() => {
    if (!files || files.length === 0) return;
    setIndex(i => (i - 1 + files.length) % files.length);
  }, [files]);

  // Keyboard navigation — only active while the viewer is mounted. Bound on
  // window so it works regardless of focus position, but skips when the user
  // is actually typing into a text field inside a viewer (e.g. the PDF page
  // jump input).
  useEffect(() => {
    const isTyping = (e) => {
      const el = e.target;
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (fullscreen) { setFullscreen(false); return; }
        onClose();
        return;
      }
      if (isTyping(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === ' ') { e.preventDefault(); setFullscreen(f => !f); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [next, prev, onClose, fullscreen]);

  if (!file) {
    return (
      <div className="dv-overlay" onClick={onClose}>
        <div className="dv-empty-msg" onClick={e => e.stopPropagation()}>
          No files to view.
          <button className="dv-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const downloadUrl = `/uploads/${file.filename}`;

  return (
    <div className={`dv-overlay${fullscreen ? ' dv-overlay--fs' : ''}`} ref={rootRef}>
      {/* Top bar — always visible even in fullscreen so the user can escape. */}
      <div className="dv-topbar">
        <button
          className="dv-iconbtn"
          onClick={() => setSidebarCollapsed(c => !c)}
          title={sidebarCollapsed ? 'Show file list' : 'Hide file list'}
        >
          {sidebarCollapsed ? '☰' : '←'}
        </button>
        <div className="dv-title" title={file.original_name}>
          <span className="dv-title-icon">{fileIcon(kind)}</span>
          <span className="dv-title-text">{file.original_name}</span>
          {files.length > 1 && (
            <span className="dv-title-count">{index + 1} / {files.length}</span>
          )}
        </div>
        <div className="dv-topbar-actions">
          <button className="dv-iconbtn" onClick={prev} disabled={files.length < 2} title="Previous (←)">◀</button>
          <button className="dv-iconbtn" onClick={next} disabled={files.length < 2} title="Next (→)">▶</button>
          <button
            className="dv-iconbtn"
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit fullscreen (Space)' : 'Fullscreen (Space)'}
          >
            {fullscreen ? '⛶' : '⛶'}
          </button>
          <a className="dv-iconbtn" href={downloadUrl} download={file.original_name} title="Download">⬇</a>
          <button className="dv-iconbtn dv-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
      </div>

      <div className="dv-body">
        {/* Sidebar */}
        {!sidebarCollapsed && !fullscreen && (
          <div className="dv-sidebar">
            <div className="dv-sidebar-header">Files ({files.length})</div>
            <div className="dv-sidebar-list">
              {files.map((f, i) => {
                const k = detectKind(f);
                return (
                  <button
                    key={f.id}
                    className={`dv-sidebar-item${i === index ? ' dv-sidebar-item--active' : ''}`}
                    onClick={() => setIndex(i)}
                    title={f.original_name}
                  >
                    <span className="dv-sidebar-icon">{fileIcon(k)}</span>
                    <div className="dv-sidebar-info">
                      <span className="dv-sidebar-name">{f.original_name}</span>
                      <span className="dv-sidebar-meta">{fileSize(f.size)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="dv-sidebar-footer">
              <span className="dv-kbd-hint">← → to switch · Esc to close · Space fullscreen</span>
            </div>
          </div>
        )}

        {/* Main viewport */}
        <div className="dv-viewport">
          {kind === 'pdf' && <PdfViewer url={downloadUrl} key={file.id} />}
          {kind === 'image' && <ImageViewer url={downloadUrl} alt={file.original_name} key={file.id} />}
          {(kind === 'text' || kind === 'markdown' || kind === 'csv') && (
            <TextViewer url={downloadUrl} kind={kind} key={file.id} />
          )}
          {kind === 'unsupported' && (
            <div className="dv-unsupported">
              <div className="dv-unsupported-icon">📎</div>
              <div className="dv-unsupported-title">Preview not available</div>
              <div className="dv-unsupported-meta">
                {file.mime_type || 'unknown type'} · {fileSize(file.size)}
              </div>
              <a className="dv-btn" href={downloadUrl} download={file.original_name}>
                Download {file.original_name}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
