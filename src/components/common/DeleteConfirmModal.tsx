import React, { useEffect, useState, useRef } from 'react';
import { Trash2, X, Loader2, AlertCircle } from 'lucide-react';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  recordTitle?: string;
  moduleName?: string;
  recordId?: string;
  description?: string;
  warningNote?: string;
  details?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => Promise<void | boolean | { success: boolean; error?: string }> | void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  recordTitle,
  moduleName = 'Record',
  recordId,
  description,
  warningNote = 'This action will permanently remove this record from Azure SQL database and cannot be undone.',
  details,
  confirmLabel = 'Confirm Delete',
  cancelLabel = 'Cancel',
  isLoading: externalLoading = false,
  onConfirm,
  onCancel,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const isSubmitting = externalLoading || internalLoading;

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
      // Focus confirm button for keyboard ergonomics after modal opens
      const timer = setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (shouldRender) {
      // Trigger exit animation before unmounting
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || isSubmitting) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!shouldRender) return null;

  const handleConfirmClick = async () => {
    if (isSubmitting) return;
    try {
      setInternalLoading(true);
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-['Helvetica',sans-serif] ${
        isClosing
          ? 'opacity-0 transition-opacity duration-180 ease-in'
          : 'animate-modal-backdrop-in'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <div
        className={`relative w-full max-w-md bg-white dark:bg-[#121212] border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xl overflow-hidden ${
          isClosing
            ? 'scale-95 opacity-0 translate-y-1 transition-all duration-180 ease-in'
            : 'animate-modal-scale-in'
        }`}
      >
        {/* Modal Header */}
        <div className="p-5 pb-4 border-b border-neutral-100 dark:border-neutral-800/80 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-900 dark:text-neutral-100 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="delete-dialog-title"
                className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tracking-tight"
              >
                Delete {moduleName}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Confirmation required before permanent deletion
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-30"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
            {description || (
              <>
                Are you sure you want to delete this{' '}
                <strong className="text-neutral-900 dark:text-neutral-100 font-semibold">
                  {moduleName.toLowerCase()}
                </strong>
                ?
              </>
            )}
          </p>

          {/* Record Identification Card */}
          <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                {moduleName} Record
              </div>
              <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate mt-0.5">
                {recordTitle || 'Selected Entry'}
              </div>
              {recordId && (
                <div className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  ID: <span className="text-neutral-800 dark:text-neutral-200">{recordId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Optional Custom Details */}
          {details && (
            <div className="text-xs text-neutral-600 dark:text-neutral-300">
              {details}
            </div>
          )}

          {/* Strict Monochrome Warning Callout */}
          <div className="p-3 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
            <span className="text-[11px] text-neutral-700 dark:text-neutral-300 leading-normal">
              {warningNote}
            </span>
          </div>
        </div>

        {/* Modal Footer / Strict Monochrome Actions */}
        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirmClick}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-neutral-800 active:scale-[0.98] rounded-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
