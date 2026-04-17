import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(ts => ts.filter(t => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const show = useCallback((opts) => {
    const id = nextId++;
    const toast = {
      id,
      message: opts.message || '',
      type: opts.type || 'info', // info, success, error, undo
      undo: opts.undo || null,   // function to call on undo
      duration: opts.duration != null ? opts.duration : 5000,
    };
    setToasts(ts => [...ts, toast]);
    if (toast.duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), toast.duration);
    }
    return id;
  }, [dismiss]);

  const triggerUndo = useCallback((id) => {
    const toast = toasts.find(t => t.id === id);
    if (toast && toast.undo) {
      toast.undo();
    }
    dismiss(id);
  }, [toasts, dismiss]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span className="toast-message">{t.message}</span>
            {t.undo && (
              <button className="toast-undo" onClick={() => triggerUndo(t.id)}>
                Undo
              </button>
            )}
            <button className="toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
