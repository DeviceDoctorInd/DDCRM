import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { formatINR, formatDate, isPastDate } from '../../utils/formatters';
import { BrandName, BRAND_CONFIG, Project, Client, Payment } from '../../types/crm';
import {
  Users,
  CheckCircle,
  Briefcase,
  Clock,
  AlertTriangle,
  IndianRupee,
  BadgeDollarSign,
  TrendingUp,
  AlertOctagon,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
  Layers,
  Building2,
  ExternalLink,
} from 'lucide-react';

export const DashboardModule: React.FC = () => {
  const {
    clients,
    projects,
    payments,
    allProjects,
    allPayments,
    allClients,
    getClientById,
    getServiceById,
    setActiveModule,
    activeBrand,
    setActiveBrand,
    brandPrefix,
    brandMeta,
    isConsolidatedView,
    setIsConsolidatedView,
  } = useCrm();

  // --- Compute 10 Core KPIs dynamically ---
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === 'Active').length;

  const totalProjects = projects.length;
  const inProgressProjects = projects.filter((p) => p.status === 'In Progress').length;
  // A project is delayed if status is not Completed/Cancelled and committedEndDate is in the past
  const delayedProjectsList = projects.filter(
    (p) =>
      p.status !== 'Completed' &&
      p.status !== 'Cancelled' &&
      isPastDate(p.committedEndDate)
  );
  const delayedProjectsCount = delayedProjectsList.length;

  const totalContractValue = projects.reduce((acc, p) => acc + (p.contractValue || 0), 0);
  const totalProfit = Math.round(totalContractValue * 0.42);

  const totalReceived = payments
    .filter((pay) => pay.paymentStatus === 'Received')
    .reduce((acc, pay) => acc + (pay.amountINR || pay.receivedAmount || pay.amount || 0), 0);
  const totalOutstanding = projects.reduce(
    (acc, p) =>
      acc +
      (p.balance !== undefined
        ? p.balance
        : Math.max(0, (p.contractValue || 0) - (p.totalReceived || 0))),
    0
  );

  // Overdue payments: pending payments where daysOverdue > 0 or past due
  const overduePaymentsList = payments.filter((pay) => {
    const overdueDays =
      pay.daysOverdue ?? (isPastDate(pay.dueDate) ? 1 : 0);
    return pay.paymentStatus === 'Pending' && overdueDays > 0;
  });
  const overduePaymentsCount = overduePaymentsList.length;

  // Largest Outstanding Payments (Pending payments sorted by balance desc)
  const largestOutstandingList = [...payments]
    .filter((pay) => pay.paymentStatus === 'Pending' && (pay.amountINR || pay.outstandingAmount || 0) > 0)
    .sort(
      (a, b) =>
        (b.amountINR || b.outstandingAmount || 0) -
        (a.amountINR || a.outstandingAmount || 0)
    )
    .slice(0, 5);

  // Brand consolidated metrics summary
  const brandMetrics: {
    brand: BrandName;
    prefix: string;
    clientsCount: number;
    projectsCount: number;
    receivedINR: number;
  }[] = (['Device Doctor India', 'Codestro', 'FX Launch Pad'] as BrandName[]).map((b) => {
    const bProjects = (allProjects || []).filter((p: Project) => (p.brand || 'Device Doctor India') === b);
    const bClients = (allClients || []).filter((c: Client) => (c.brand || 'Device Doctor India') === b);
    const bPayments = (allPayments || []).filter(
      (pay: Payment) => (pay.brand || 'Device Doctor India') === b && pay.paymentStatus === 'Received'
    );
    const bReceived = bPayments.reduce(
      (sum: number, pay: Payment) => sum + (pay.amountINR || pay.receivedAmount || pay.amount || 0),
      0
    );
    return {
      brand: b,
      prefix: BRAND_CONFIG[b].prefix,
      clientsCount: bClients.length,
      projectsCount: bProjects.length,
      receivedINR: bReceived,
    };
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Title & Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {isConsolidatedView ? 'Consolidated Group Executive Dashboard' : `${activeBrand} — Executive Dashboard`}
            </h1>
            {!isConsolidatedView && (
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${brandMeta.badgeBg} ${brandMeta.badgeBorder} ${brandMeta.badgeText} border`}>
                {brandPrefix} Workspace
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isConsolidatedView
              ? 'Aggregated real-time telemetry across all 3 brands: Device Doctor India, Codestro, and FX Launch Pad.'
              : `Real-time operations telemetry for ${activeBrand} (${brandMeta.tagline}).`}
          </p>
        </div>

        {/* Consolidated View Toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsConsolidatedView(!isConsolidatedView)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-xs cursor-pointer ${
              isConsolidatedView
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>{isConsolidatedView ? 'Consolidated Group View: ON' : 'Consolidated Group View'}</span>
          </button>
        </div>
      </div>

      {/* Brand Group Comparison Cards (Shown when Consolidated View is active) */}
      {isConsolidatedView && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border border-slate-700 shadow-md">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Group Revenue & Brand Distribution (Consolidated)
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              3 Active Brands
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {brandMetrics.map((b) => {
              const meta = BRAND_CONFIG[b.brand];
              return (
                <div
                  key={b.brand}
                  className="p-3.5 rounded-lg bg-slate-800/90 border border-slate-700/80 hover:border-slate-500 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">{b.brand}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-700 text-cyan-300 border border-slate-600 font-semibold">
                        {b.prefix}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBrand(b.brand);
                        setIsConsolidatedView(false);
                      }}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-0.5 hover:underline cursor-pointer"
                    >
                      <span>Focus</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="text-[11px] text-slate-400">Collected Revenue (INR)</div>
                    <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                      {formatINR(b.receivedINR)}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{b.projectsCount} projects</span>
                    <span>{b.clientsCount} accounts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 10 Summary Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isConsolidatedView ? 'Consolidated Group KPIs (10 Metrics)' : `${brandMeta.shortName} Key Performance Indicators (10 Metrics)`}
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {/* Card 1: Total Clients */}
          <div
            onClick={() => setActiveModule('clients')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Clients
              </span>
              <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                {totalClients}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>{activeClients} Active</span>
                <span>·</span>
                <span>{totalClients - activeClients} Other</span>
              </div>
            </div>
          </div>

          {/* Card 2: Active Clients */}
          <div
            onClick={() => setActiveModule('clients')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Active Clients
              </span>
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {activeClients}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {totalClients > 0
                  ? `${Math.round((activeClients / totalClients) * 100)}% active retention`
                  : 'No clients'}
              </div>
            </div>
          </div>

          {/* Card 3: Total Projects */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Projects
              </span>
              <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                {totalProjects}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                All contract engagements
              </div>
            </div>
          </div>

          {/* Card 4: In Progress Projects */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                In Progress
              </span>
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tracking-tight text-indigo-600 dark:text-indigo-400">
                {inProgressProjects}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Active sprints & milestones
              </div>
            </div>
          </div>

          {/* Card 5: Delayed Projects */}
          <div
            onClick={() => setActiveModule('projects')}
            className={`p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-xs cursor-pointer transition-all flex flex-col justify-between ${
              delayedProjectsCount > 0
                ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/20 dark:bg-rose-950/20 hover:border-rose-500'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Delayed Projects
              </span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  delayedProjectsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}
              />
            </div>
            <div className="mt-3">
              <div
                className={`text-2xl font-bold font-mono tracking-tight ${
                  delayedProjectsCount > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {delayedProjectsCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {delayedProjectsCount > 0 ? 'Exceeded deadline date' : 'All delivery schedules on track'}
              </div>
            </div>
          </div>

          {/* Card 6: Total Contract Value */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Contract Value (INR)
              </span>
              <IndianRupee className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="mt-3">
              <div className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                {formatINR(totalContractValue)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Committed client order book
              </div>
            </div>
          </div>

          {/* Card 7: Total Received */}
          <div
            onClick={() => setActiveModule('payments')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Received (INR)
              </span>
              <BadgeDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3">
              <div className="text-xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatINR(totalReceived)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {totalContractValue > 0
                  ? `${Math.round((totalReceived / totalContractValue) * 100)}% realization rate`
                  : '0% realized'}
              </div>
            </div>
          </div>

          {/* Card 8: Total Outstanding */}
          <div
            onClick={() => setActiveModule('payments')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Outstanding (INR)
              </span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-3">
              <div className="text-xl font-bold font-mono tracking-tight text-amber-600 dark:text-amber-400">
                {formatINR(totalOutstanding)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Remaining contract balance
              </div>
            </div>
          </div>

          {/* Card 9: Total Profit */}
          <div
            onClick={() => setActiveModule('reports')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-teal-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Gross Margin (INR)
              </span>
              <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="mt-3">
              <div className="text-xl font-bold font-mono tracking-tight text-teal-600 dark:text-teal-400">
                {formatINR(totalProfit)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                ~42% benchmark agency margin
              </div>
            </div>
          </div>

          {/* Card 10: Overdue Invoices */}
          <div
            onClick={() => setActiveModule('payments')}
            className={`p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-xs cursor-pointer transition-all flex flex-col justify-between ${
              overduePaymentsCount > 0
                ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/20 dark:bg-rose-950/20 hover:border-rose-500'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Overdue Invoices
              </span>
              <ShieldAlert
                className={`w-4 h-4 ${
                  overduePaymentsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}
              />
            </div>
            <div className="mt-3">
              <div
                className={`text-2xl font-bold font-mono tracking-tight ${
                  overduePaymentsCount > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {overduePaymentsCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {overduePaymentsCount > 0 ? 'Requires accounts follow-up' : 'All invoices within payment terms'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Detailed Split Panes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List 1: Delayed Projects Attention Feed */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Critical Delivery Schedule Attention
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Projects exceeding agreed committed SLA target dates
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveModule('projects')}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 flex-1">
            {delayedProjectsList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                All client contracts and milestones are currently on schedule.
              </div>
            ) : (
              delayedProjectsList.slice(0, 5).map((project) => {
                const client = getClientById(project.clientId);
                const service = getServiceById(project.serviceId);

                return (
                  <div key={project.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                            {project.clientName || client?.name}
                          </span>
                          {isConsolidatedView && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {project.brand || 'Device Doctor India'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {service?.name || 'Custom Enterprise Solution'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-1">
                          {project.id}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatINR(project.contractValue || 0)}
                        </div>
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">
                          Target: {formatDate(project.committedEndDate)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Status: {project.status}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* List 2: Largest Outstanding Payments */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <AlertOctagon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Largest Outstanding Payments
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Top uncollected receivables ranked by outstanding Indian Rupee balance
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveModule('payments')}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>View Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 flex-1">
            {largestOutstandingList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                All client invoices settled in full. Outstanding balance is zero.
              </div>
            ) : (
              largestOutstandingList.map((pay) => {
                const client = getClientById(pay.clientId);
                const isOverdue =
                  pay.paymentStatus === 'Pending' &&
                  ((pay.daysOverdue ?? 0) > 0 || isPastDate(pay.dueDate));

                return (
                  <div key={pay.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                            {client?.name || `Client #${pay.clientId}`}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {pay.id}
                          </span>
                          {isConsolidatedView && (
                            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {pay.brand || 'Device Doctor India'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2">
                          <span>Amount: {formatINR(pay.amountINR || pay.amount || 0)}</span>
                          {pay.referenceUtr && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                Ref: {pay.referenceUtr}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Due: <span className={isOverdue ? 'text-rose-500 font-semibold' : ''}>{formatDate(pay.dueDate)}</span>
                          {isOverdue && ' (Past Due)'}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-400 font-medium">Pending Balance</div>
                        <div className="font-mono text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">
                          {formatINR(pay.amountINR || pay.outstandingAmount || pay.amount || 0)}
                        </div>
                        <span
                          className={`inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                            isOverdue
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {isOverdue ? 'Overdue' : pay.paymentStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
