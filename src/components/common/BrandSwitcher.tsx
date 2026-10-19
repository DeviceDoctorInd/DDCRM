import React, { useState, useRef, useEffect } from 'react';
import { useCrm } from '../../context/CrmContext';
import { BrandName, BRAND_CONFIG } from '../../types/crm';
import {
  ChevronDown,
  Check,
  Building2,
  Wrench,
  Code2,
  TrendingUp,
  Sparkles,
  Layers,
} from 'lucide-react';

interface BrandSwitcherProps {
  variant?: 'header' | 'sidebar';
  isCollapsed?: boolean;
}

export const BrandSwitcher: React.FC<BrandSwitcherProps> = ({
  variant = 'header',
  isCollapsed = false,
}) => {
  const {
    activeBrand,
    setActiveBrand,
    brandPrefix,
    brandMeta,
    isConsolidatedView,
    setIsConsolidatedView,
    activeModule,
    openWorkspaceModal,
  } = useCrm();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const brands: BrandName[] = ['Device Doctor India', 'Codestro', 'FX Launch Pad'];

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

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectBrand = (brand: BrandName) => {
    setActiveBrand(brand);
    // If consolidated view was on, turn it off when an explicit brand is picked
    if (isConsolidatedView) {
      setIsConsolidatedView(false);
    }
    setIsOpen(false);
  };

  const isReportsOrDashboard = activeModule === 'dashboard' || activeModule === 'reports';

  // --- SIDEBAR VARIANT ---
  if (variant === 'sidebar') {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all border text-left cursor-pointer ${
            isOpen
              ? 'bg-slate-800 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/30'
              : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600'
          }`}
          title={`Active Brand: ${activeBrand} (${brandPrefix})`}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div
              className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${brandMeta.avatarBg} flex items-center justify-center text-white shadow-sm shrink-0`}
            >
              {getBrandIcon(activeBrand, 'w-4 h-4')}
            </div>

            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-tight truncate">
                    {activeBrand}
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-700/90 text-cyan-300 border border-slate-600 shrink-0">
                    {brandPrefix}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {brandMeta.shortName} Workspace
                </div>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                isOpen ? 'rotate-180 text-cyan-400' : ''
              }`}
            />
          )}
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div
            className={`absolute z-50 mt-1.5 w-64 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150 ${
              isCollapsed ? 'left-14 top-0' : 'left-0 right-0'
            }`}
          >
            <div className="px-2 py-1.5 border-b border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Switch Brand Workspace
              </div>
              <div className="text-[11px] text-slate-500">
                Data & IDs isolated per brand
              </div>
            </div>

            <div className="space-y-0.5 py-1">
              {brands.map((brand) => {
                const isSelected = activeBrand === brand && !isConsolidatedView;
                const meta = BRAND_CONFIG[brand];
                return (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => handleSelectBrand(brand)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/80 text-white border border-cyan-700/50'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div
                        className={`w-7 h-7 rounded-md bg-gradient-to-tr ${meta.avatarBg} flex items-center justify-center text-white shrink-0`}
                      >
                        {getBrandIcon(brand, 'w-3.5 h-3.5')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-1.5">
                          <span className="truncate">{brand}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {meta.prefix}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {meta.tagline}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0 ml-1.5" />}
                  </button>
                );
              })}
            </div>

            {/* Optional Consolidated View Toggle inside Dashboard/Reports */}
            {isReportsOrDashboard && (
              <div className="pt-1.5 mt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsConsolidatedView(!isConsolidatedView);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                    isConsolidatedView
                      ? 'bg-emerald-950/70 border border-emerald-700 text-emerald-200'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <div className="font-semibold text-[11px]">
                        All Brands (Consolidated View)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Combined revenue & P&L
                      </div>
                    </div>
                  </div>
                  {isConsolidatedView && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              </div>
            )}

            {/* Brand Workspace Center / Detailed Selection */}
            <div className="pt-1.5 mt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  openWorkspaceModal(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Brand Workspace Center...</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- HEADER VARIANT ---
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-xs cursor-pointer ${
          isConsolidatedView
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : `${brandMeta.badgeBg} ${brandMeta.badgeBorder} ${brandMeta.badgeText} hover:opacity-90`
        }`}
        title="Switch Active Brand Workspace"
      >
        <div className="flex items-center gap-1.5">
          <div
            className={`w-5 h-5 rounded-md bg-gradient-to-tr ${
              isConsolidatedView ? 'from-emerald-600 to-teal-600' : brandMeta.avatarBg
            } flex items-center justify-center text-white shrink-0`}
          >
            {isConsolidatedView ? (
              <Sparkles className="w-3 h-3" />
            ) : (
              getBrandIcon(activeBrand, 'w-3 h-3')
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold tracking-tight">
              {isConsolidatedView ? 'All Brands (Consolidated)' : activeBrand}
            </span>
            {!isConsolidatedView && (
              <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 font-bold">
                {brandPrefix}
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 opacity-70 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Header Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 z-50 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Active Brand Workspace
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Switching filters all data & auto-prefixes IDs
            </div>
          </div>

          <div className="space-y-0.5 py-1">
            {brands.map((brand) => {
              const isSelected = activeBrand === brand && !isConsolidatedView;
              const meta = BRAND_CONFIG[brand];
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() => handleSelectBrand(brand)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div
                      className={`w-7 h-7 rounded-md bg-gradient-to-tr ${meta.avatarBg} flex items-center justify-center text-white shrink-0`}
                    >
                      {getBrandIcon(brand, 'w-3.5 h-3.5')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{brand}</span>
                        <span className="text-[10px] font-mono font-semibold px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {meta.prefix}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {meta.tagline}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 ml-1.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Optional Consolidated View Toggle inside Dashboard/Reports */}
          {isReportsOrDashboard && (
            <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsConsolidatedView(!isConsolidatedView);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                  isConsolidatedView
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="font-semibold text-[11px]">
                      All Brands (Consolidated View)
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Aggregated revenue & group metrics
                    </div>
                  </div>
                </div>
                {isConsolidatedView && (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
              </button>
            </div>
          )}

          {/* Detailed Workspace Switcher Button */}
          <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openWorkspaceModal(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 rounded-lg transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Brand Workspace Center...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
