import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { ReportsSubTab } from '../../types/crm';
import { BusinessReportSubModule } from './reports/BusinessReportSubModule';
import { ClientReportSubModule } from './reports/ClientReportSubModule';
import { EmployeeReportSubModule } from './reports/EmployeeReportSubModule';
import { BusinessOverviewSubModule } from './reports/BusinessOverviewSubModule';
import { BankAccountReportSubModule } from './reports/BankAccountReportSubModule';
import { PaymentModeReportSubModule } from './reports/PaymentModeReportSubModule';
import {
  BarChart3,
  TrendingUp,
  Users,
  UserCheck,
  PieChart,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
  Landmark,
  CreditCard,
} from 'lucide-react';

interface SubTabConfig {
  id: ReportsSubTab;
  label: string;
  badge?: string;
  icon: React.ReactNode;
  description: string;
}

export const ReportsModule: React.FC = () => {
  const { activeReportsTab, setActiveReportsTab, activeBrand, brandPrefix, isConsolidatedView, setIsConsolidatedView } = useCrm();

  const brandUpper = isConsolidatedView ? 'CONSOLIDATED GROUP' : activeBrand.toUpperCase();

  const tabs: SubTabConfig[] = [
    {
      id: 'business',
      label: '1. Business Report',
      badge: 'Active & Audited',
      icon: <TrendingUp className="w-4 h-4" />,
      description: `${brandUpper} — Business Dashboard, dynamic P&L ledger & financial charts`,
    },
    {
      id: 'client',
      label: '2. Client Report',
      badge: 'Active & Audited',
      icon: <Users className="w-4 h-4" />,
      description: `${brandUpper} — Client Dashboard, project fulfillment audit & service mix`,
    },
    {
      id: 'employee',
      label: '3. Employee Report',
      badge: 'Active & Audited',
      icon: <UserCheck className="w-4 h-4" />,
      description: `${brandUpper} — Employee Dashboard, payroll audit, task compensation & workload share`,
    },
    {
      id: 'overview',
      label: '4. Business Overview',
      badge: 'Active & Audited',
      icon: <PieChart className="w-4 h-4" />,
      description: `${brandUpper} — Business Overview, 360° revenue, collections, project costs & profitability`,
    },
    {
      id: 'bank-accounts',
      label: '5. Bank Account Report',
      badge: 'Bank Reconciled',
      icon: <Landmark className="w-4 h-4" />,
      description: `${brandUpper} — Inflow breakdown by specific corporate bank accounts and crypto wallets`,
    },
    {
      id: 'payment-modes',
      label: '6. Payment Mode Report',
      badge: 'Mode Audit',
      icon: <CreditCard className="w-4 h-4" />,
      description: `${brandUpper} — Revenue analysis by settlement method (Cash, Crypto, GST Invoice, UPI)`,
    },
  ];

  const currentTabConfig = tabs.find((t) => t.id === activeReportsTab) || tabs[0];

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>Executive Reports & Analytics</span>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                {isConsolidatedView ? 'Consolidated All Brands' : `${brandPrefix} Workspace`}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live dynamic financial modeling, multi-period ledger audits, and visual distribution analytics for {isConsolidatedView ? 'all 3 brands' : activeBrand}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Optional Consolidated Group View Toggle */}
          <button
            type="button"
            onClick={() => setIsConsolidatedView(!isConsolidatedView)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-xs cursor-pointer ${
              isConsolidatedView
                ? 'bg-black text-white border-black hover:bg-neutral-800'
                : 'bg-white dark:bg-slate-850 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span>{isConsolidatedView ? 'Consolidated View: ON' : 'All Brands (Consolidated View)'}</span>
          </button>

          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-2.5">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
              Live Sync
            </span>
            <span>·</span>
            <span className="font-mono">FY 2026-27</span>
          </div>
        </div>
      </div>

      {/* Top Horizontal Sub-Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto pb-px scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeReportsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveReportsTab(tab.id)}
                className={`group relative flex items-center gap-2 py-3 px-3.5 sm:px-4 text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                  isActive
                    ? 'border-black text-black dark:border-white dark:text-white bg-slate-100/80 dark:bg-slate-800/80 rounded-t-lg'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <span
                  className={`${
                    isActive
                      ? 'text-black dark:text-white'
                      : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                  }`}
                >
                  {tab.icon}
                </span>

                <span>{tab.label}</span>

                {tab.badge && (
                  <span
                    className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-black text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Context Kicker */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {currentTabConfig.label}:
          </span>
          <span>{currentTabConfig.description}</span>
        </div>
      </div>

      {/* Sub-Module Content Renderer */}
      <div className="animate-fade-in">
        {activeReportsTab === 'business' && <BusinessReportSubModule />}
        {activeReportsTab === 'client' && <ClientReportSubModule />}
        {activeReportsTab === 'employee' && <EmployeeReportSubModule />}
        {activeReportsTab === 'overview' && <BusinessOverviewSubModule />}
        {activeReportsTab === 'bank-accounts' && <BankAccountReportSubModule />}
        {activeReportsTab === 'payment-modes' && <PaymentModeReportSubModule />}
      </div>
    </div>
  );
};
