import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { ToastContext, type ToastContextValue, type ToastItem } from './useToast';
import './Toast.css';

// ═══════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>): string => {
    const id = `toast-${++idCounter.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Convenience methods
  const success = useCallback(
    (message: string, duration = 3000) => {
      return showToast({ type: 'success', message, duration });
    },
    [showToast],
  );

  const error = useCallback(
    (message: string, duration = 5000) => {
      return showToast({ type: 'error', message, duration });
    },
    [showToast],
  );

  const warning = useCallback(
    (message: string, duration = 4000) => {
      return showToast({ type: 'warning', message, duration });
    },
    [showToast],
  );

  const info = useCallback(
    (message: string, duration = 3000) => {
      return showToast({ type: 'info', message, duration });
    },
    [showToast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      showToast,
      dismissToast,
      success,
      error,
      warning,
      info,
    }),
    [toasts, showToast, dismissToast, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// Toast Container
// ═══════════════════════════════════════════════════════════

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastNotification key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Individual Toast
// ═══════════════════════════════════════════════════════════

interface ToastNotificationProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const remainingRef = useRef(toast.duration ?? 3000);
  // Initialized to 0; startTimer() overwrites with Date.now() before pauseTimer()
  // can read it.
  const startTimeRef = useRef(0);

  const startTimer = useCallback(() => {
    if (remainingRef.current <= 0) return;
    startTimeRef.current = Date.now();
    timeoutRef.current = window.setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, remainingRef.current);
  }, [toast.id, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      remainingRef.current -= Date.now() - startTimeRef.current;
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [startTimer]);

  const handleMouseEnter = () => {
    setIsPaused(true);
    pauseTimer();
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    startTimer();
  };

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
    }
  };

  return (
    <div
      className={`toast toast-${toast.type} ${isExiting ? 'toast-exit' : 'toast-enter'} ${isPaused ? 'toast-paused' : ''}`}
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="toast-icon">{getIcon()}</span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action?.onClick();
            handleDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        className="toast-close"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
