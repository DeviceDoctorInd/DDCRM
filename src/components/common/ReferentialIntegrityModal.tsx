import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { ShieldAlert, X, AlertTriangle, ArrowRight } from 'lucide-react';

export const ReferentialIntegrityModal: React.FC = () => {
  const { referentialModal, closeReferentialModal } = useCrm();

  if (!referentialModal.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-['Helvetica',sans-serif] animate-modal-backdrop-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#121212] border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xl overflow-hidden animate-modal-scale-in">
        {/* Modal Header */}
        <div className="p-5 pb-4 border-b border-neutral-100 dark:border-neutral-800/80 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-900 dark:text-neutral-100 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                {referentialModal.title}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Strict Referential Integrity Guard · Device Doctor India CRM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeReferentialModal}
            className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
            <div className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed">
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">{referentialModal.message}</p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Deleting this record would break relational foreign keys, compromise past invoices, and corrupt project history.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closeReferentialModal}
            className="px-3.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            Cancel & Keep Record
          </button>

          {referentialModal.onSetInactive && (
            <button
              type="button"
              onClick={referentialModal.onSetInactive}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-neutral-800 active:scale-[0.98] rounded-md transition-all flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Mark as Inactive Instead</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
