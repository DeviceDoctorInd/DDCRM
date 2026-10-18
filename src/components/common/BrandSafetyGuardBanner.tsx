import React from 'react';
import { BrandName, BRAND_CONFIG, getBrandPrefix } from '../../types/crm';
import { ShieldAlert, Building2, Wrench, Code2, TrendingUp, RefreshCw } from 'lucide-react';

interface BrandSafetyGuardBannerProps {
  entityType: 'Client' | 'Project' | 'Service' | 'Category' | 'Payment' | 'Expense' | string;
  targetBrand: BrandName;
  isEditing?: boolean;
  recordId?: string;
  onChangeWorkspace?: () => void;
}

export const BrandSafetyGuardBanner: React.FC<BrandSafetyGuardBannerProps> = ({
  entityType,
  targetBrand,
  isEditing = false,
  recordId,
  onChangeWorkspace,
}) => {
  const meta = BRAND_CONFIG[targetBrand] || BRAND_CONFIG['Device Doctor India'];
  const prefix = getBrandPrefix(targetBrand);

  const getBrandIcon = (name: BrandName, className: string = 'w-4 h-4') => {
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
    <div className="p-3.5 sm:p-4 rounded-xl border bg-slate-50/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${meta.avatarBg} flex items-center justify-center text-white shadow-sm shrink-0 mt-0.5 sm:mt-0`}
          >
            {getBrandIcon(targetBrand, 'w-4 h-4')}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Brand Workspace:
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${meta.badgeBg} ${meta.badgeBorder} ${meta.badgeText} border`}>
                <span>{targetBrand}</span>
                <span className="font-mono text-[10px] font-extrabold opacity-80">[{prefix}]</span>
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1.5 leading-relaxed">
              <ShieldAlert className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span>
                {isEditing ? (
                  <>
                    Modifying existing <strong className="font-semibold text-slate-900 dark:text-slate-100">{entityType}</strong> partitioned under{' '}
                    <strong className="font-semibold">{targetBrand}</strong> ({recordId || prefix}).
                  </>
                ) : (
                  <>
                    This <strong className="font-semibold text-slate-900 dark:text-slate-100">{entityType}</strong> will be saved strictly to{' '}
                    <strong className="font-semibold">{targetBrand}</strong> with prefix <span className="font-mono font-bold">{prefix}-***</span>.
                  </>
                )}
              </span>
            </p>
          </div>
        </div>

        {!isEditing && onChangeWorkspace && (
          <button
            type="button"
            onClick={onChangeWorkspace}
            className="self-end sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors shadow-2xs shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>Change Brand</span>
          </button>
        )}
      </div>
    </div>
  );
};
