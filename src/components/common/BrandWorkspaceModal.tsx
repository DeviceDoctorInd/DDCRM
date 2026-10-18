import React, { useState } from 'react';
import { useCrm } from '../../context/CrmContext';
import { BrandName, BRAND_CONFIG } from '../../types/crm';
import {
  Wrench,
  Code2,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  X,
  Layers,
  Building2,
} from 'lucide-react';

interface BrandWorkspaceModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isMandatory?: boolean; // If true (e.g. on first login), cannot simply dismiss with X
}

export const BrandWorkspaceModal: React.FC<BrandWorkspaceModalProps> = ({
  isOpen,
  onClose,
  isMandatory = false,
}) => {
  const {
    activeBrand,
    isConsolidatedView,
    selectBrandWorkspace,
    allClients,
    allProjects,
    hasPermission,
    authUser,
  } = useCrm();

  const [selectedBrand, setSelectedBrand] = useState<BrandName>(activeBrand);
  const [isConsolidatedSelected, setIsConsolidatedSelected] = useState<boolean>(isConsolidatedView);
  const [rememberDefault, setRememberDefault] = useState<boolean>(true);

  if (!isOpen) return null;

  const brands: BrandName[] = ['Device Doctor India', 'Codestro', 'FX Launch Pad'];

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

  const handleSelectBrandCard = (brand: BrandName) => {
    setSelectedBrand(brand);
    setIsConsolidatedSelected(false);
  };

  const handleSelectConsolidated = () => {
    setIsConsolidatedSelected(true);
  };

  const handleConfirm = () => {
    selectBrandWorkspace(selectedBrand, isConsolidatedSelected, rememberDefault);
    if (onClose) {
      onClose();
    }
  };

  const canViewConsolidated = hasPermission(['Super Admin', 'Accountant', 'Viewer']);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6">
        {/* Top Decorative Header */}
        <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-b from-slate-50/70 to-transparent dark:from-slate-800/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shadow-lg shrink-0">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/80 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Workspace Enforcement & Data Isolation</span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {isMandatory ? 'Select Active Brand Workspace' : 'Switch Brand Workspace'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Clients, proposals, and project contracts will be strictly partitioned to your selected workspace.
                </p>
              </div>
            </div>

            {!isMandatory && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Modal Body: Workspace Cards */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="grid grid-cols-1 gap-3.5">
            {brands.map((brand) => {
              const meta = BRAND_CONFIG[brand];
              const isSelected = !isConsolidatedSelected && selectedBrand === brand;
              const clientCount = allClients.filter((c) => c.brand === brand).length;
              const projectCount = allProjects.filter((p) => p.brand === brand).length;

              return (
                <div
                  key={brand}
                  onClick={() => handleSelectBrandCard(brand)}
                  className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? `border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30 shadow-md ring-2 ring-cyan-500/20`
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${meta.avatarBg} flex items-center justify-center text-white shadow-md shrink-0`}
                    >
                      {getBrandIcon(brand, 'w-6 h-6')}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                          {brand}
                        </span>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                          {meta.prefix}
                        </span>
                        {authUser?.brand === brand && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                            Your Assigned Brand
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {meta.tagline}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                        <span className="flex items-center gap-1">
                          <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                            {clientCount}
                          </span>{' '}
                          Clients
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="flex items-center gap-1">
                          <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                            {projectCount}
                          </span>{' '}
                          Projects
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-mono">
                          ID: {meta.prefix}-***
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-3">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-cyan-600 bg-cyan-600 text-white'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Consolidated View Card (Super Admin / Execs only) */}
            {canViewConsolidated && (
              <div
                onClick={handleSelectConsolidated}
                className={`group relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                  isConsolidatedSelected
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-md ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shrink-0">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                        All Brands (Consolidated Enterprise View)
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        Multi-Brand Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Unified dashboard and consolidated revenue across DDI, Codestro & FX Launch Pad
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      <span>Total: <strong className="font-mono">{allClients.length}</strong> Clients</span>
                      <span>·</span>
                      <span>Total: <strong className="font-mono">{allProjects.length}</strong> Projects</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pl-3">
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isConsolidatedSelected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {isConsolidatedSelected && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Remember as default workspace checkbox */}
          <div className="pt-2 flex items-center gap-2.5">
            <input
              type="checkbox"
              id="rememberWorkspaceCheckbox"
              checked={rememberDefault}
              onChange={(e) => setRememberDefault(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
            />
            <label
              htmlFor="rememberWorkspaceCheckbox"
              className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none"
            >
              Remember as my default active workspace on this device
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 sm:px-8 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Target Workspace:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {isConsolidatedSelected ? 'All Brands (Consolidated)' : selectedBrand}
            </strong>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md hover:shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <span>
              Enter {isConsolidatedSelected ? 'Consolidated' : BRAND_CONFIG[selectedBrand]?.shortName || selectedBrand} Workspace
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
