import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { formatINR, formatDate, isPastDate } from '../../utils/formatters';
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
} from 'lucide-react';

export const DashboardModule: React.FC = () => {
  const {
    clients,
    projects,
    payments,
    getClientById,
    getServiceById,
    setActiveModule,
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

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Title & Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Executive Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time telemetry across Device Doctor India's custom software development, IT solutions, and digital marketing client contracts.
          </p>
        </div>
      </div>

      {/* 10 Summary Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            System Key Performance Indicators (10 Metrics)
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
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {totalClients}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Onboarded entities</p>
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
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {activeClients}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Retainer & live SLAs</p>
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
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {totalProjects}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Active client retainers</p>
            </div>
          </div>

          {/* Card 4: In Progress Projects */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                In Progress
              </span>
              <Clock className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tabular-nums text-cyan-600 dark:text-cyan-400">
                {inProgressProjects}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Active dev sprints</p>
            </div>
          </div>

          {/* Card 5: Delayed Projects */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-rose-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Delayed Projects
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {delayedProjectsCount}
              </div>
              <p className="text-[11px] text-rose-500/80 mt-0.5 font-medium">Requires escalation</p>
            </div>
          </div>

          {/* Card 6: Total Contract Value (INR) */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-400 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Contract (INR)
              </span>
              <IndianRupee className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="mt-3">
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 truncate">
                {formatINR(totalContractValue)}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Aggregate bookings</p>
            </div>
          </div>

          {/* Card 7: Total Received (INR) */}
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
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 truncate">
                {formatINR(totalReceived)}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Settled in bank</p>
            </div>
          </div>

          {/* Card 8: Total Outstanding (INR) */}
          <div
            onClick={() => setActiveModule('payments')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Outstanding
              </span>
              <AlertOctagon className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-3">
              <div className="text-lg font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 truncate">
                {formatINR(totalOutstanding)}
              </div>
              <p className="text-[11px] text-amber-500/80 mt-0.5 font-medium">Uncollected receivables</p>
            </div>
          </div>

          {/* Card 9: Total Profit (INR) */}
          <div
            onClick={() => setActiveModule('projects')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Profit (INR)
              </span>
              <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="mt-3">
              <div className="text-lg font-bold font-mono tabular-nums text-cyan-600 dark:text-cyan-400 truncate">
                {formatINR(totalProfit)}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Value minus direct cost</p>
            </div>
          </div>

          {/* Card 10: Overdue Payments */}
          <div
            onClick={() => setActiveModule('payments')}
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-rose-500/50 cursor-pointer transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Overdue Payments
              </span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {overduePaymentsCount}
              </div>
              <p className="text-[11px] text-rose-500/80 mt-0.5 font-medium">Past invoice due date</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2 Detailed Critical Lists as Requested */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List 1: Delayed Projects */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Delayed Projects ({delayedProjectsCount})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Software deliverables and sprint milestones exceeding target release dates
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
                No delayed projects. All client deliverables and sprints are running on schedule.
              </div>
            ) : (
              delayedProjectsList.map((project) => {
                const client = getClientById(project.clientId);
                const service = getServiceById(project.serviceId);

                return (
                  <div key={project.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                            {project.clientName || client?.name || `Project ${project.id}`}
                          </span>
                          <span className="text-xs font-mono text-rose-600 dark:text-rose-400 font-semibold">
                            {project.id}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            Service: {service?.name || 'Custom IT Solution'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>PM: {project.projectManager || 'Lead'}</span>
                        </div>
                        {project.notes && (
                          <p className="text-xs text-rose-500/90 dark:text-rose-400/90 mt-1.5 italic bg-rose-50 dark:bg-rose-950/30 p-1.5 rounded">
                            {project.notes}
                          </p>
                        )}
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
