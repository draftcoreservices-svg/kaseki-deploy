import React, { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// PdfViewer
//
// Renders a PDF one page at a time using pdfjs-dist. The worker is loaded
// from a CDN (unpkg) keyed to the exact installed version — this avoids
// needing to configure a CRA worker-loader and keeps the build self-contained.
//
// Controls: page nav (Prev/Next + page input), zoom (-/+/fit), and text
// selection works because we render the text layer.
// ═══════════════════════════════════════════════════════════════════════════

const CDN_WORKER = (version) =>
  `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js`;

export default function PdfViewer({ url }) {
  const [pdfLib, setPdfLib] = useState(null);
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageInput, setPageInput] = useState('1');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Load pdfjs-dist lazily and configure the worker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await import('pdfjs-dist');
        if (cancelled) return;
        // Configure worker. Version is read from the package so unpkg URL
        // matches exactly — a mismatch throws "Invalid worker version".
        const ver = lib.version || '3.11.174';
        if (!lib.GlobalWorkerOptions.workerSrc) {
          lib.GlobalWorkerOptions.workerSrc = CDN_WORKER(ver);
        }
        setPdfLib(lib);
      } catch (e) {
        if (!cancelled) setError('Failed to load PDF engine: ' + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch and parse the PDF document whenever url or pdfLib changes.
  useEffect(() => {
    if (!pdfLib || !url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    setPageInput('1');
    const task = pdfLib.getDocument({ url });
    task.promise.then(
      (pdf) => {
        if (cancelled) return;
        setDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError('Failed to load PDF: ' + (err && err.message ? err.message : 'unknown error'));
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
      try { task.destroy && task.destroy(); } catch (_) {}
    };
  }, [pdfLib, url]);

  // Render the current page whenever doc, page or scale changes.
  const renderPage = useCallback(async () => {
    if (!doc || !canvasRef.current) return;
    try {
      // Cancel any in-flight render before starting a new one.
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
      }

      const pg = await doc.getPage(page);
      const viewport = pg.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      // Use device pixel ratio for crisp rendering on hi-dpi screens.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const renderContext = {
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      };

      const task = pg.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;

      // Render text layer for selection. Best-effort — if it fails we still
      // have the visual page.
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.width = Math.floor(viewport.width) + 'px';
        textLayerRef.current.style.height = Math.floor(viewport.height) + 'px';
        try {
          const textContent = await pg.getTextContent();
          // Simple text layer: position each span using the transform matrix
          // returned by pdfjs. Not a perfect visual overlay but works for copy.
          const fragment = document.createDocumentFragment();
          textContent.items.forEach(item => {
            const tx = pdfLib.Util.transform(viewport.transform, item.transform);
            const style = textContent.styles[item.fontName];
            const span = document.createElement('span');
            span.textContent = item.str;
            span.style.position = 'absolute';
            span.style.left = tx[4] + 'px';
            span.style.top = (tx[5] - item.height * scale) + 'px';
            span.style.fontSize = (item.height * scale) + 'px';
            span.style.fontFamily = style ? style.fontFamily : 'sans-serif';
            span.style.whiteSpace = 'pre';
            span.style.transformOrigin = '0% 0%';
            fragment.appendChild(span);
          });
          textLayerRef.current.appendChild(fragment);
        } catch (_) {
          // Text layer failure is non-fatal.
        }
      }
    } catch (e) {
      // Rendering cancellation throws; ignore those.
      if (e && e.name === 'RenderingCancelledException') return;
      setError('Failed to render page: ' + (e && e.message ? e.message : 'unknown'));
    }
  }, [doc, page, scale, pdfLib]);

  useEffect(() => { renderPage(); }, [renderPage]);

  useEffect(() => { setPageInput(String(page)); }, [page]);

  const goPrev = () => setPage(p => Math.max(1, p - 1));
  const goNext = () => setPage(p => Math.min(numPages, p + 1));
  const zoomIn = () => setScale(s => Math.min(4, s + 0.2));
  const zoomOut = () => setScale(s => Math.max(0.4, s - 0.2));
  const zoomReset = () => setScale(1.2);
  const submitPage = (e) => {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n)) setPage(Math.max(1, Math.min(numPages, n)));
    else setPageInput(String(page));
  };

  if (error) return <div className="dv-error">{error}</div>;
  if (loading && !doc) return <div className="dv-loading">Loading PDF…</div>;

  return (
    <div className="dv-pdf">
      <div className="dv-pdf-toolbar">
        <button className="dv-iconbtn" onClick={goPrev} disabled={page <= 1} title="Previous page">◀</button>
        <form onSubmit={submitPage} className="dv-pdf-page-form">
          <input
            className="dv-pdf-page-input"
            value={pageInput}
            onChange={e => setPageInput(e.target.value)}
            onBlur={submitPage}
            aria-label="Page number"
          />
          <span className="dv-pdf-page-total">/ {numPages}</span>
        </form>
        <button className="dv-iconbtn" onClick={goNext} disabled={page >= numPages} title="Next page">▶</button>
        <span className="dv-pdf-sep" />
        <button className="dv-iconbtn" onClick={zoomOut} title="Zoom out">−</button>
        <button className="dv-iconbtn" onClick={zoomReset} title="Reset zoom">{Math.round(scale * 100)}%</button>
        <button className="dv-iconbtn" onClick={zoomIn} title="Zoom in">+</button>
      </div>
      <div className="dv-pdf-scroll">
        <div className="dv-pdf-page-wrap">
          <canvas ref={canvasRef} className="dv-pdf-canvas" />
          <div ref={textLayerRef} className="dv-pdf-textlayer" />
        </div>
      </div>
    </div>
  );
}
