import React, { useMemo } from 'react';
import { useCrm } from '../../../context/CrmContext';
import { formatINR, isPastDate } from '../../../utils/formatters';
import { exportToCsv } from '../../../utils/csvExport';
import {
  PieChart as PieChartIcon,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Users,
  IndianRupee,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building,
  BarChart2,
  Layers,
  ShieldCheck,
  Award,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export const BusinessOverviewSubModule: React.FC = () => {
  const { clients, projects, payments, employeePayments, assignments, expenses } = useCrm();

  // --- Helper to evaluate project delayed status and days ---
  const getProjectDelay = (p: (typeof projects)[0]) => {
    if (p.status === 'Completed' || p.status === 'Cancelled') return 0;
    if (!p.committedEndDate) return 0;
    const committed = new Date(p.committedEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    committed.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - committed.getTime();
    if (diffTime <= 0) return 0;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // --- Operational Metrics (Row 1 - Light Blue Banner) ---
  const totalClientsCount = clients.length;
  const totalProjectsCount = projects.length;
  const activeProjectsCount = useMemo(() => {
    return projects.filter((p) => p.status === 'In Progress' || p.status === 'Contracted').length;
  }, [projects]);
  const delayedProjectsCount = useMemo(() => {
    return projects.filter((p) => getProjectDelay(p) > 0).length;
  }, [projects]);

  // --- Financial Snapshot Metrics (Row 2 - Light Green Banner) ---
  const totalContractValueINR = useMemo(() => {
    return projects.reduce((acc, p) => acc + Number(p.contractValue ?? p.contract ?? 0), 0);
  }, [projects]);

  const totalReceivedINR = useMemo(() => {
    return payments
      .filter((p) => p.paymentStatus === 'Received' || Number(p.amountReceived || 0) > 0)
      .reduce((acc, p) => acc + Number(p.amountINR ?? p.amountReceived ?? p.amount ?? 0), 0);
  }, [payments]);

  const totalOutstandingINR = Math.max(0, totalContractValueINR - totalReceivedINR);

  // --- Cost Metrics ---
  // Project Employee Cost: Sum of Amount Paid from Assignments / Employee Payments linked to projects (projectId != "NA")
  const projectEmployeeCost = useMemo(() => {
    const directEp = employeePayments
      .filter((ep) => ep.projectId && ep.projectId !== 'NA')
      .reduce((sum, ep) => sum + Number(ep.amountPaid || 0), 0);

    if (directEp > 0) return directEp;

    // Fallback to project-linked assignments
    return assignments
      .filter((a) => a.projectId && a.projectId !== 'NA')
      .reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);
  }, [employeePayments, assignments]);

  // Project Expenses: Sum from Other Expenses where projectId != "NA"
  const projectExpenses = useMemo(() => {
    return expenses
      .filter((e) => e.projectId && e.projectId !== 'NA')
      .reduce((sum, e) => sum + Number(e.amountINR ?? e.amount ?? 0), 0);
  }, [expenses]);

  // Fixed / Non-project Expenses: Sum from Other Expenses where projectId == "NA" or undefined
  const fixedExpenses = useMemo(() => {
    return expenses
      .filter((e) => !e.projectId || e.projectId === 'NA')
      .reduce((sum, e) => sum + Number(e.amountINR ?? e.amount ?? 0), 0);
  }, [expenses]);

  // Total Business Expenses
  const totalBusinessExpenses = projectEmployeeCost + projectExpenses + fixedExpenses;

  // Project Profit = Contract Value - Project Employee Cost - Project Expenses
  const projectProfit = totalContractValueINR - projectEmployeeCost - projectExpenses;

  // Business Profit = Project Profit - Fixed / Non-project Expenses (i.e. Contract Value - Total Business Expenses)
  const businessProfit = projectProfit - fixedExpenses;

  // Ratios & Percentages
  const profitMarginPercent = totalContractValueINR > 0 ? (projectProfit / totalContractValueINR) * 100 : 0;
  const collectionRatePercent = totalContractValueINR > 0 ? (totalReceivedINR / totalContractValueINR) * 100 : 0;
  const outstandingPercent = totalContractValueINR > 0 ? (totalOutstandingINR / totalContractValueINR) * 100 : 0;

  // Project Balance Counts
  const projectBalances = useMemo(() => {
    return projects.map((p) => {
      const projPayments = payments.filter(
        (pay) => pay.projectId === p.id && (pay.paymentStatus === 'Received' || Number(pay.amountReceived || 0) > 0)
      );
      const received = projPayments.reduce(
        (sum, pay) => sum + Number(pay.amountINR ?? pay.amountReceived ?? pay.amount ?? 0),
        0
      );
      const contract = Number(p.contractValue ?? p.contract ?? 0);
      const balance = Math.max(0, contract - received);
      return {
        id: p.id,
        contract,
        received,
        balance,
        isDelayed: getProjectDelay(p) > 0,
      };
    });
  }, [projects, payments]);

  const paidProjectsCount = projectBalances.filter((pb) => pb.balance === 0 && pb.contract > 0).length;
  const outstandingProjectsCount = projectBalances.filter((pb) => pb.balance > 0).length;

  // --- Chart 1: Project Status Donut Chart Data ---
  const projectStatusData = useMemo(() => {
    const active = projects.filter((p) => p.status === 'In Progress' || p.status === 'Contracted').length;
    const completed = projects.filter((p) => p.status === 'Completed').length;
    const onHold = projects.filter((p) => p.status === 'On Hold' || p.status === 'Proposal').length;

    const items = [
      { name: 'Active / In Progress', value: active, color: '#ef4444' }, // red as specified
      { name: 'Completed', value: completed, color: '#f59e0b' }, // amber/yellow as specified
    ];
    if (onHold > 0) {
      items.push({ name: 'On Hold / Proposal', value: onHold, color: '#6366f1' });
    }
    return items;
  }, [projects]);

  // --- Chart 2: Financial Position Horizontal Bar Chart Data (8 metrics) ---
  const financialPositionData = useMemo(() => {
    return [
      { name: 'Contract Value', value: totalContractValueINR, fill: '#3b82f6' },
      { name: 'Received', value: totalReceivedINR, fill: '#06b6d4' },
      { name: 'Outstanding', value: totalOutstandingINR, fill: '#f59e0b' },
      { name: 'Employee Cost', value: projectEmployeeCost, fill: '#6366f1' },
      { name: 'Project Expenses', value: projectExpenses, fill: '#ec4899' },
      { name: 'Fixed Expenses', value: fixedExpenses, fill: '#8b5cf6' },
      { name: 'Project Profit', value: projectProfit, fill: '#10b981' },
      { name: 'Business Profit', value: businessProfit, fill: '#059669' },
    ];
  }, [
    totalContractValueINR,
    totalReceivedINR,
    totalOutstandingINR,
    projectEmployeeCost,
    projectExpenses,
    fixedExpenses,
    projectProfit,
    businessProfit,
  ]);

  // --- Chart 3: Monthly Collections Line Chart Data ---
  const monthlyCollectionsData = useMemo(() => {
    const map = new Map<string, { month: string; monthLabel: string; received: number }>();

    payments
      .filter((p) => p.paymentStatus === 'Received' || Number(p.amountReceived || 0) > 0)
      .forEach((p) => {
        const dStr = p.paymentDate || p.createdAt?.slice(0, 10) || '';
        const key = dStr.slice(0, 7);
        if (!key) return;

        if (!map.has(key)) {
          const [year, month] = key.split('-');
          const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
          const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
          map.set(key, { month: key, monthLabel: label, received: 0 });
        }

        const item = map.get(key)!;
        item.received += Number(p.amountINR ?? p.amountReceived ?? p.amount ?? 0);
      });

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [payments]);

  // --- Chart 4: Top Projects by Profit Horizontal Bar Chart Data (Top 8-10) ---
  const topProjectsByProfitData = useMemo(() => {
    const list = projects.map((p) => {
      const contract = Number(p.contractValue ?? p.contract ?? 0);

      // Project employee cost
      const epCost = employeePayments
        .filter((ep) => ep.projectId === p.id)
        .reduce((sum, ep) => sum + Number(ep.amountPaid || 0), 0);

      // Project expenses
      const pExp = expenses
        .filter((e) => e.projectId === p.id)
        .reduce((sum, e) => sum + Number(e.amountINR ?? e.amount ?? 0), 0);

      const profit = contract - epCost - pExp;

      // Extract short human-friendly identifier (e.g., DDI-CICA COACHING-SEO-1)
      const parts = p.id.split(' - ');
      let displayName = p.id;
      if (parts.length >= 3) {
        displayName = `${parts[0]}-${parts[1].slice(0, 12)}-${parts[parts.length - 1]}`;
      } else if (p.id.length > 25) {
        displayName = `${p.id.slice(0, 22)}…`;
      }

      return {
        id: p.id,
        displayName,
        profit,
        contract,
      };
    });

    // Sort by profit descending, take top 8
    return list.sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [projects, employeePayments, expenses]);

  // --- CSV Export Handler ---
  const handleExportCsv = () => {
    const summaryRows = [
      { section: 'OPERATIONAL SNAPSHOT', metric: 'Total Clients', value: totalClientsCount, notes: 'Count in Clients module' },
      { section: 'OPERATIONAL SNAPSHOT', metric: 'Total Projects', value: totalProjectsCount, notes: 'Count in Projects module' },
      { section: 'OPERATIONAL SNAPSHOT', metric: 'Active Projects', value: activeProjectsCount, notes: 'Status: In Progress / Contracted' },
      { section: 'OPERATIONAL SNAPSHOT', metric: 'Delayed Projects', value: delayedProjectsCount, notes: 'Overdue past committed end date' },
      { section: 'FINANCIAL SNAPSHOT', metric: 'Contract Value', value: totalContractValueINR, notes: 'Sum of all project contract values (INR)' },
      { section: 'FINANCIAL SNAPSHOT', metric: 'Received', value: totalReceivedINR, notes: 'Sum of all received payments (INR)' },
      { section: 'FINANCIAL SNAPSHOT', metric: 'Outstanding', value: totalOutstandingINR, notes: 'Contract Value - Received' },
      { section: 'FINANCIAL SNAPSHOT', metric: 'Project Profit', value: projectProfit, notes: 'Contract Value - Project Cost - Project Expenses' },
      { section: 'COST & PROFITABILITY', metric: 'Project Employee Cost', value: projectEmployeeCost, notes: 'Assignments/Payments linked to projects' },
      { section: 'COST & PROFITABILITY', metric: 'Project Expenses', value: projectExpenses, notes: 'Other Expenses where Project ID != "NA"' },
      { section: 'COST & PROFITABILITY', metric: 'Fixed / Non-project Expenses', value: fixedExpenses, notes: 'Other Expenses where Project ID == "NA"' },
      { section: 'COST & PROFITABILITY', metric: 'Total Business Expenses', value: totalBusinessExpenses, notes: 'Employee Cost + Project Expenses + Fixed Expenses' },
      { section: 'COST & PROFITABILITY', metric: 'Business Profit', value: businessProfit, notes: 'Project Profit - Fixed Expenses' },
      { section: 'RATIOS', metric: 'Profit Margin', value: `${profitMarginPercent.toFixed(1)}%`, notes: '(Project Profit / Contract Value) * 100' },
      { section: 'RATIOS', metric: 'Collection Rate', value: `${collectionRatePercent.toFixed(1)}%`, notes: '(Received / Contract Value) * 100' },
      { section: 'RATIOS', metric: 'Outstanding %', value: `${outstandingPercent.toFixed(1)}%`, notes: '(Outstanding / Contract Value) * 100' },
      { section: 'PROJECT COUNTS', metric: 'Paid Projects', value: paidProjectsCount, notes: 'Balance == 0' },
      { section: 'PROJECT COUNTS', metric: 'Outstanding Projects', value: outstandingProjectsCount, notes: 'Balance > 0' },
    ];

    exportToCsv(
      summaryRows,
      [
        { key: 'section', header: 'Section' },
        { key: 'metric', header: 'Metric' },
        {
          key: 'value',
          header: 'Value',
          format: (r) => {
            if (typeof r.value === 'number') {
              if (r.section.includes('FINANCIAL') || r.section.includes('COST')) {
                return formatINR(r.value);
              }
              return r.value.toLocaleString('en-IN');
            }
            return String(r.value);
          },
        },
        { key: 'notes', header: 'Formula & Source' },
      ],
      `DeviceDoctorIndia_Business_Overview_${new Date().toISOString().slice(0, 10)}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Title & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>DEVICE DOCTOR — BUSINESS OVERVIEW</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
              EXECUTIVE BRIEFING
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live business snapshot • revenue • collections • project costs • profitability
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
            title="Export Business Overview to CSV"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Export Business Overview (CSV / Print)</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
            title="Print Overview"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: TWO-TIER HERO BANNER CARDS */}
      <div className="space-y-3.5">
        {/* Row 1: Light Blue Background Banner — Operational Snapshot */}
        <div className="p-4 rounded-xl bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200/80 dark:border-cyan-800/60 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-900 dark:text-cyan-300 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Operational Snapshot</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-400">
              Agency Scale & Delivery
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. TOTAL CLIENTS */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-cyan-100 dark:border-cyan-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>TOTAL CLIENTS</span>
                <Users className="w-3.5 h-3.5 text-cyan-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {totalClientsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Corporate accounts</div>
            </div>

            {/* 2. TOTAL PROJECTS */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-cyan-100 dark:border-cyan-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>TOTAL PROJECTS</span>
                <Briefcase className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {totalProjectsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Order book count</div>
            </div>

            {/* 3. ACTIVE PROJECTS */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-cyan-100 dark:border-cyan-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>ACTIVE PROJECTS</span>
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-cyan-700 dark:text-cyan-300 mt-1">
                {activeProjectsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">In progress & sprints</div>
            </div>

            {/* 4. DELAYED PROJECTS */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-cyan-100 dark:border-cyan-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>DELAYED PROJECTS</span>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div className={`text-2xl font-bold font-mono mt-1 ${delayedProjectsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                {delayedProjectsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Delay days &gt; 0</div>
            </div>
          </div>
        </div>

        {/* Row 2: Light Green Background Banner — Financial Snapshot in INR */}
        <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Financial Snapshot (INR)</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
              Consolidated Lifetime Ledger
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. CONTRACT VALUE */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                CONTRACT VALUE
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatINR(totalContractValueINR)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Sum of all contracts</div>
            </div>

            {/* 2. RECEIVED */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                RECEIVED
              </div>
              <div className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
                {formatINR(totalReceivedINR)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Cleared collections</div>
            </div>

            {/* 3. OUTSTANDING */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                OUTSTANDING
              </div>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {formatINR(totalOutstandingINR)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Contract Value - Received</div>
            </div>

            {/* 4. PROJECT PROFIT */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
              <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                <span>PROJECT PROFIT</span>
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                {formatINR(projectProfit)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Contract - Cost - Exp.</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: "COST & PROFITABILITY SUMMARY" (3-Column Structured Grid Table) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        {/* Navy Blue Header */}
        <div className="bg-[#0f172a] text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold tracking-wider uppercase">
              COST & PROFITABILITY SUMMARY
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            3-Column Analytical Structure
          </span>
        </div>

        {/* 4 Rows x 3 Columns Table Grid */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
          {/* Row 1: Project Employee Cost | Project Expenses | Fixed / Non-project Expenses */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Col 1 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Project Employee Cost
              </div>
              <div className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {formatINR(projectEmployeeCost)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Assignments & payments linked to projects
              </div>
            </div>

            {/* Col 2 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Project Expenses
              </div>
              <div className="text-lg font-bold font-mono text-pink-600 dark:text-pink-400 mt-1">
                {formatINR(projectExpenses)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Other Expenses where Project ID != "NA"
              </div>
            </div>

            {/* Col 3 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Fixed / Non-project Expenses
              </div>
              <div className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400 mt-1">
                {formatINR(fixedExpenses)}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Operational overhead where Project ID == "NA"
              </div>
            </div>
          </div>

          {/* Row 2: Total Business Expenses | Project Profit | Business Profit */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
            {/* Col 1 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-700 dark:text-slate-300 font-bold text-[11px]">
                Total Business Expenses
              </div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatINR(totalBusinessExpenses)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Project Cost + Project Exp + Fixed Exp
              </div>
            </div>

            {/* Col 2 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                Project Profit
              </div>
              <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                {formatINR(projectProfit)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Contract Value - Employee Cost - Project Exp
              </div>
            </div>

            {/* Col 3 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-emerald-500/10 dark:bg-emerald-950/20">
              <div className="text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                Business Profit (Net)
              </div>
              <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-1">
                {formatINR(businessProfit)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Contract Value - Total Business Expenses
              </div>
            </div>
          </div>

          {/* Row 3: Profit Margin | Collection Rate | Outstanding % */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Col 1 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Profit Margin
              </div>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {profitMarginPercent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                (Project Profit / Contract Value) * 100
              </div>
            </div>

            {/* Col 2 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Collection Rate
              </div>
              <div className="text-lg font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
                {collectionRatePercent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                (Received / Contract Value) * 100
              </div>
            </div>

            {/* Col 3 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Outstanding %
              </div>
              <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {outstandingPercent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                (Outstanding / Contract Value) * 100
              </div>
            </div>
          </div>

          {/* Row 4: Paid Projects | Outstanding Projects | Delayed Projects */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Col 1 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Paid Projects
              </div>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {paidProjectsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Projects with Balance == 0 & Contract &gt; 0
              </div>
            </div>

            {/* Col 2 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Outstanding Projects
              </div>
              <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {outstandingProjectsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Projects with remaining Balance &gt; 0
              </div>
            </div>

            {/* Col 3 */}
            <div className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
              <div className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                Delayed Projects
              </div>
              <div className={`text-lg font-bold font-mono mt-1 ${delayedProjectsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                {delayedProjectsCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Projects where Delay Days &gt; 0
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: 2x2 EXECUTIVE CHARTS GRID (Powered by Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1 (Top-Left): "PROJECT STATUS" — Donut Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-rose-500" />
                <span>PROJECT STATUS</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Active / In Progress (Red) vs Completed (Amber/Yellow)
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-medium">
              {totalProjectsCount} Total
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {projectStatusData.length === 0 ? (
              <div className="text-slate-400 text-xs">No project status data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(val, name) => [`${val} Projects`, name]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Pie
                    data={projectStatusData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {projectStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2 (Top-Right): "FINANCIAL POSITION" — Horizontal Bar Chart (8 metrics) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>FINANCIAL POSITION</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Horizontal comparison of 8 core financial dimensions
              </p>
            </div>
            <span className="text-[11px] font-mono text-cyan-600 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded font-semibold">
              INR Ledger
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={financialPositionData}
                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#475569' }}
                  width={110}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val) => [formatINR(Number(val || 0)), 'Amount']}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {financialPositionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3 (Bottom-Left): "MONTHLY COLLECTIONS" — Line Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>MONTHLY COLLECTIONS</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Trend line with data points showing month-by-month Received (INR)
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded font-semibold">
              {formatINR(totalReceivedINR)} Total
            </span>
          </div>

          <div className="h-64 w-full">
            {monthlyCollectionsData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Clock className="w-6 h-6 mb-1 text-slate-300" />
                <span>No monthly collection records found</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyCollectionsData} margin={{ top: 15, right: 15, left: 15, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(val) => [formatINR(Number(val || 0)), 'Received']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="received"
                    name="Collections"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#10b981', stroke: '#064e3b', strokeWidth: 1.5 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4 (Bottom-Right): "TOP PROJECTS BY PROFIT" — Horizontal Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>TOP PROJECTS BY PROFIT</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Top individual projects ranked by net contract profit
              </p>
            </div>
            <span className="text-[11px] font-mono text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded font-semibold">
              Top 8 Ranking
            </span>
          </div>

          <div className="h-64 w-full">
            {topProjectsByProfitData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Briefcase className="w-6 h-6 mb-1 text-slate-300" />
                <span>No project profit data</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={topProjectsByProfitData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="displayName"
                    tick={{ fontSize: 10, fill: '#475569' }}
                    width={155}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val, name, props) => [
                      `${formatINR(Number(val || 0))} (Contract: ${formatINR(props.payload.contract)})`,
                      'Project Profit',
                    ]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Bar dataKey="profit" fill="#10b981" radius={[0, 4, 4, 0]}>
                    {topProjectsByProfitData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#059669' : index < 3 ? '#10b981' : '#34d399'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
