import React from 'react';
import { Search, Download, Plus, Filter } from 'lucide-react';

export interface KpiCardItem {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface CommonModuleToolbarProps {
  moduleTitle: string;
  moduleSubtitle?: string;
  kpis: KpiCardItem[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: { label: string; value: string }[];
  onAddNew: () => void;
  onExportCsv: () => void;
  addNewLabel?: string;
  childrenSecondaryFilters?: React.ReactNode;
  totalFilteredCount?: number;
}

export const CommonModuleToolbar: React.FC<CommonModuleToolbarProps> = ({
  moduleTitle,
  moduleSubtitle,
  kpis,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  onAddNew,
  onExportCsv,
  addNewLabel = 'Add New',
  childrenSecondaryFilters,
  totalFilteredCount,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Summary KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => (
          <div
            key={index}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {kpi.label}
              </span>
              {kpi.icon && (
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {kpi.icon}
                </div>
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 tracking-tight">
                {kpi.value}
              </div>
              {kpi.badge && (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {kpi.badge}
                </span>
              )}
            </div>
            {kpi.subtext && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 truncate">
                {kpi.subtext}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 2. Header and Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Module Title & Count */}
        <div className="shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {moduleTitle}
            </h2>
            {totalFilteredCount !== undefined && (
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                ({totalFilteredCount} records)
              </span>
            )}
          </div>
          {moduleSubtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {moduleSubtitle}
            </p>
          )}
        </div>

        {/* Search Bar + Filters + Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Search ${moduleTitle}...`}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:focus:ring-cyan-400"
            />
          </div>

          {/* Status Filter Dropdown */}
          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer appearance-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Secondary Filters (e.g. Category Filter for Services) */}
          {childrenSecondaryFilters}

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={onExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0"
            title="Download CSV of currently filtered records"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          {/* Add New Record Button */}
          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{addNewLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
