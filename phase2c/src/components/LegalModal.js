import React, { useEffect } from 'react';
import { LEGAL_DOCUMENTS } from '../legal-documents';

// ═══════════════════════════════════════════════════════════════════════════
// LegalModal — displays Terms / Privacy / Acceptable Use documents from the
// legal-documents data module. Reusable: pass `docId` = 'terms' | 'privacy'
// | 'acceptable-use'. Closes on Esc, click-outside, or the ✕ button.
// ═══════════════════════════════════════════════════════════════════════════

export default function LegalModal({ docId, onClose }) {
  const doc = docId ? LEGAL_DOCUMENTS[docId] : null;

  // Esc to close. Key handler only active while a doc is open.
  useEffect(() => {
    if (!doc) return;
    const h = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [doc, onClose]);

  if (!doc) return null;

  return (
    <div className="legal-overlay" onClick={onClose}>
      <div className="legal-modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="legal-modal-title">
        <div className="legal-modal-header">
          <h2 id="legal-modal-title">{doc.title}</h2>
          <button className="legal-modal-close" onClick={onClose} title="Close (Esc)" aria-label="Close">✕</button>
        </div>
        <div className="legal-modal-scroll">
          <div className="legal-modal-effective">{doc.effective}</div>
          <p className="legal-modal-preamble">{doc.preamble}</p>
          {doc.sections.map((s) => (
            <section key={s.n} className="legal-modal-section">
              <h3>{s.n}. {s.heading}</h3>
              {typeof s.body === 'string' && <p>{s.body}</p>}
              {Array.isArray(s.body) && (
                <>
                  {s.intro && <p>{s.intro}</p>}
                  <ol className="legal-modal-sublist">
                    {s.body.map((item) => (
                      <li key={item.sub} value={item.sub.charCodeAt(0) - 96 /* a=1, b=2… for <ol> */}>
                        <span className="legal-modal-sublabel">({item.sub})</span> {item.text}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          ))}
          <p className="legal-modal-closing">{doc.closing}</p>
        </div>
      </div>
    </div>
  );
}
