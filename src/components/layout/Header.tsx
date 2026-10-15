import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { Menu, Sun, Moon, RotateCcw, Shield, Plus } from 'lucide-react';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileSidebar }) => {
  const {
    activeModule,
    theme,
    toggleTheme,
    resetData,
    authUser,
    openAddProjectModal,
  } = useCrm();

  const moduleNames: Record<string, string> = {
    dashboard: 'Executive Dashboard',
    clients: 'Client Onboarding & Accounts',
    categories: 'Service Categories',
    services: 'Agency Services Catalog',
    projects: 'Projects & Client Engagements',
    payments: 'Payment Ledger & Invoices',
    roles: 'Employee Roles & Job Hierarchy',
    employees: 'Employees Directory',
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left zone: Mobile toggle + Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Device Doctor India
          </span>
          <span className="text-slate-400">/</span>
          <span className="text-cyan-600 dark:text-cyan-400 font-medium">
            {moduleNames[activeModule] || activeModule}
          </span>
        </div>
      </div>

      {/* Right zone: Add Project, Currency, Theme toggle, Reset Data, Admin Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Top Header Quick-Action Button: Add Project */}
        <button
          onClick={openAddProjectModal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-sm transition-colors cursor-pointer"
          title="Add New Client Project"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Project</span>
        </button>

        {/* Currency Marker */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300">
          <span>₹ INR Standard</span>
        </div>

        {/* Reset Demo Data button */}
        <button
          onClick={() => {
            if (window.confirm('Reset all CRM data to initial sample dataset for Device Doctor India?')) {
              resetData();
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Reset database to initial realistic sample data"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset Data</span>
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
          <div className="w-8 h-8 rounded-full bg-cyan-600/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs">
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
