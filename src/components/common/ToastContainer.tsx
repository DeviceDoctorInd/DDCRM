import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useCrm();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
      {toasts.map((toast) => {
        let icon = <Info className="w-5 h-5 text-slate-800 dark:text-slate-200 shrink-0" />;
        let borderClass = 'border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';

        if (toast.type === 'success') {
          icon = <CheckCircle2 className="w-5 h-5 text-slate-800 dark:text-slate-200 shrink-0" />;
          borderClass = 'border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';
        } else if (toast.type === 'error') {
          icon = <AlertCircle className="w-5 h-5 text-slate-800 dark:text-slate-200 shrink-0" />;
          borderClass = 'border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';
        } else if (toast.type === 'warning') {
          icon = <AlertTriangle className="w-5 h-5 text-slate-800 dark:text-slate-200 shrink-0" />;
          borderClass = 'border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-lg transition-all duration-200 text-sm ${borderClass}`}
          >
            {icon}
            <div className="flex-1 font-medium leading-relaxed">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
