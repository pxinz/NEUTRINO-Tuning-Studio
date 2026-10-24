import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../state/useAppStore';

export default function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={clsx('toast', `toast-${toast.kind}`)}>
          <span className="toast-icon">
            {toast.kind === 'success' ? (
              <CheckCircle2 size={16} />
            ) : toast.kind === 'error' ? (
              <AlertCircle size={16} />
            ) : toast.kind === 'warning' ? (
              <TriangleAlert size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Close">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
