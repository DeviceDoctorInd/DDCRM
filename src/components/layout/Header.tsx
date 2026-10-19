import React from 'react';
import { useCrm } from '../../context/CrmContext';
import {
  Menu,
  Sun,
  Moon,
  RefreshCw,
  Shield,
  Plus,
  Lock,
  Building2,
  Wrench,
  Code2,
  TrendingUp,
  Sparkles,
  Globe,
} from 'lucide-react';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileSidebar }) => {
  const {
    activeModule,
    theme,
    toggleTheme,
    refreshData,
    authUser,
    openAddProjectModal,
    activeBrand,
    brandMeta,
    brandPrefix,
    isConsolidatedView,
    databaseStatus,
    syncWithDatabase,
  } = useCrm();

  const getBrandIcon = (name: string, className: string = 'w-3.5 h-3.5') => {
    switch (name) {
      case 'Device Doctor India':
        return <Wrench className={className} />;
      case 'Codestro':
        return <Code2 className={className} />;
      case 'FX Launch Pad':
        return <TrendingUp className={className} />;
      case 'DUNS':
        return <Globe className={className} />;
      default:
        return <Building2 className={className} />;
    }
  };

  const moduleNames: Record<string, string> = {
    dashboard: 'Executive Dashboard',
    clients: 'Client Onboarding & Accounts',
    categories: 'Service Categories',
    services: 'Agency Services Catalog',
    projects: 'Projects & Client Engagements',
    payments: 'Payment Ledger & Invoices',
    'gst-invoices': 'GST Invoices & IRN Filing',
    roles: 'Employee Roles & Job Hierarchy',
    employees: 'Employees Directory',
    assignments: 'Project Task Assignments',
    'employee-payments': 'Employee Payouts & Compensation',
    'expense-categories': 'Expense Categories',
    expenses: 'Operational & Cloud Expenses',
    reports: 'Audited Reports & Analytics',
    users: 'Admin & User Management',
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left zone: Mobile toggle + Session-Locked Workspace + Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Session-Locked Brand Workspace Indicator (Dropdown switcher removed to prevent accidental data contamination) */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold select-none ${
            isConsolidatedView
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : `${brandMeta.badgeBg} ${brandMeta.badgeBorder} ${brandMeta.badgeText}`
          }`}
          title={`Active Brand Workspace: ${activeBrand} (Session locked to this brand). Log out to select another brand workspace.`}
        >
          <div
            className={`w-5 h-5 rounded-md bg-gradient-to-tr ${
              isConsolidatedView ? 'from-emerald-600 to-teal-600' : brandMeta.avatarBg
            } flex items-center justify-center text-white shrink-0 shadow-xs`}
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
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-semibold border border-black/5 dark:border-white/10">
              <Lock className="w-2.5 h-2.5 text-amber-500" />
              <span>Locked</span>
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs">
          <span className="text-slate-400">/</span>
          <span className={`${brandMeta.accentText} font-medium`}>
            {moduleNames[activeModule] || activeModule}
          </span>
          {isConsolidatedView && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
              Consolidated
            </span>
          )}
        </div>
      </div>

      {/* Right zone: Add Project, Currency, Theme toggle, Reset Data, Admin Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Top Header Quick-Action Button: Add Project */}
        <button
          onClick={openAddProjectModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white ${brandMeta.accentBg} ${brandMeta.accentHover} rounded-lg shadow-sm transition-colors cursor-pointer`}
          title={`Add New Client Project for ${activeBrand}`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add Project</span>
          <span className="sm:hidden">Add</span>
        </button>

        {/* Currency Marker */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300">
          <span>₹ INR Standard</span>
        </div>

        {/* Refresh Live SQL Data button */}
        <button
          onClick={() => {
            refreshData();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Refresh live CRM data from Azure SQL Database"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Refresh SQL</span>
        </button>

        {/* Light / Dark Mode Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle color theme"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${brandMeta.avatarBg} text-white flex items-center justify-center font-bold text-xs shadow-xs`}>
            <Shield className="w-4 h-4" />
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
              {authUser?.name?.split(' ')[0] || 'Admin'}
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Super Admin
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
