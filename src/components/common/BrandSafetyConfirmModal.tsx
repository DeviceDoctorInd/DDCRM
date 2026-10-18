import React from 'react';
import { BrandName, BRAND_CONFIG, getBrandPrefix } from '../../types/crm';
import { ShieldCheck, AlertTriangle, ArrowRight, X, Building2, Wrench, Code2, TrendingUp } from 'lucide-react';

interface BrandSafetyConfirmModalProps {
  isOpen: boolean;
  entityType: 'Client' | 'Project' | string;
  entityName: string;
  targetBrand: BrandName;
  onConfirm: () => void;
  onCancel: () => void;
  onChangeBrand?: () => void;
}

export const BrandSafetyConfirmModal: React.FC<BrandSafetyConfirmModalProps> = ({
  isOpen,
  entityType,
  entityName,
  targetBrand,
  onConfirm,
  onCancel,
  onChangeBrand,
}) => {
  if (!isOpen) return null;

  const meta = BRAND_CONFIG[targetBrand] || BRAND_CONFIG['Device Doctor India'];
  const prefix = getBrandPrefix(targetBrand);

  const getBrandIcon = (name: BrandName, className: string = 'w-5 h-5') => {
    switch (name) {
      case 'Device Doctor India':
        return <Wrench className={className} />;
      case 'Codestro':
        return <Code2 className={className} />;
      case 'FX Launch Pad':
        return <TrendingUp className={className} />;
      default:
        return <Building2 className={className} />;
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Confirm Workspace Destination
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              To prevent accidental cross-brand data mixing, please confirm that this new{' '}
              <strong className="text-slate-800 dark:text-slate-200">{entityType.toLowerCase()}</strong> belongs to the workspace below:
            </p>
          </div>

          {/* Active Workspace Highlight Box */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${meta.avatarBg} flex items-center justify-center text-white shadow-sm shrink-0`}
            >
              {getBrandIcon(targetBrand, 'w-5 h-5')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {targetBrand}
                </span>
                <span className="font-mono text-xs font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  {prefix}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Record: <strong className="text-slate-800 dark:text-slate-200">{entityName || 'New Entry'}</strong>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 text-[11px] text-cyan-800 dark:text-cyan-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
            <span>
              This record will be auto-prefixed with <span className="font-mono font-bold">{prefix}-***</span> and filtered to the {targetBrand} database partition.
            </span>
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5">
          {onChangeBrand ? (
            <button
              type="button"
              onClick={onChangeBrand}
              className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 py-1 text-center sm:text-left cursor-pointer"
            >
              Wrong Brand? Switch Workspace
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-sm transition-all cursor-pointer"
            >
              <span>Confirm & Save</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
