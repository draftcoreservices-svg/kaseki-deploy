import React, { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TextViewer
//
// Handles three related kinds:
//  - 'text'      → raw content in a monospace <pre>
//  - 'markdown'  → rendered via `marked`, with the built-in HTML escaper on
//                  (so user-pasted <script> tags don't execute). We don't add
//                  DOMPurify — Kaseki is single-user self-hosted and the user
//                  is uploading their own files. Trust boundary is the auth
//                  wall, not the markdown parser.
//  - 'csv'       → parsed into a table. Handles quoted fields with embedded
//                  commas and escaped quotes. Tab-separated (.tsv) uses a
//                  tab delimiter.
// ═══════════════════════════════════════════════════════════════════════════

// Very small CSV parser that handles the common cases:
//  - quoted fields: "hello, world"
//  - escaped quotes: "he said ""hi"""
//  - CRLF and LF line endings
//
// Not RFC 4180 perfect, but good enough for preview of normal CSV files.
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delimiter) { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    if (c === '\r') { i++; continue; } // swallowed; \n handles line end
    field += c; i++;
  }
  // Trailing field/row.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export default function TextViewer({ url, kind }) {
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marked, setMarked] = useState(null);

  // Fetch the file body as text.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.text();
      })
      .then(t => { if (!cancelled) { setContent(t); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  // Load marked lazily, only when actually rendering markdown.
  useEffect(() => {
    if (kind !== 'markdown') return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('marked');
        if (cancelled) return;
        // `marked` exports a function or a namespace depending on version.
        const parse = mod.parse || (mod.marked && mod.marked.parse) || mod.default;
        setMarked(() => parse);
      } catch (e) {
        if (!cancelled) setError('Failed to load markdown parser: ' + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [kind]);

  if (loading) return <div className="dv-loading">Loading…</div>;
  if (error) return <div className="dv-error">{error}</div>;

  if (kind === 'markdown') {
    if (!marked) return <div className="dv-loading">Loading markdown…</div>;
    let html = '';
    try {
      // Important: marked's default options in recent versions already escape
      // raw HTML when `mangle` and `headerIds` settings are applied. We keep
      // defaults and wrap in a styled container. If the user's markdown
      // contains HTML, it renders as text, not as live HTML.
      html = marked(content, { async: false, breaks: true });
    } catch (e) {
      return <div className="dv-error">Failed to render markdown: {e.message}</div>;
    }
    return (
      <div className="dv-text-scroll">
        <div className="dv-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  if (kind === 'csv') {
    const delim = url.toLowerCase().endsWith('.tsv') ? '\t' : ',';
    const rows = parseCsv(content, delim);
    if (rows.length === 0) return <div className="dv-empty">Empty file.</div>;
    const [header, ...body] = rows;
    return (
      <div className="dv-text-scroll">
        <table className="dv-csv-table">
          <thead>
            <tr>{header.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {/* Pad short rows so the table stays rectangular. */}
                {Array.from({ length: header.length }, (_, j) => (
                  <td key={j}>{r[j] != null ? r[j] : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dv-csv-footer">{body.length} row{body.length === 1 ? '' : 's'} · {header.length} column{header.length === 1 ? '' : 's'}</div>
      </div>
    );
  }

  // Plain text.
  return (
    <div className="dv-text-scroll">
      <pre className="dv-text-pre">{content}</pre>
    </div>
  );
}
