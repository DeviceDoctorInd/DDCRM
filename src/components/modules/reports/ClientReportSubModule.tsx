import React, { useState, useMemo, useEffect } from 'react';
import { useCrm } from '../../../context/CrmContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import { exportToCsv } from '../../../utils/csvExport';
import {
  Users,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Briefcase,
  IndianRupee,
  Wallet,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Building,
  BarChart2,
  PieChart as PieChartIcon,
  Layers,
  ArrowUpRight,
  Filter,
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
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type DatePreset = 'last-6-months' | 'this-year' | 'all-time' | 'custom';

const PALETTE = {
  received: '#06b6d4', // cyan-500
  outstanding: '#f59e0b', // amber-500
  contract: '#3b82f6', // blue-500
  employeeCost: '#6366f1', // indigo-500
  expenses: '#ec4899', // pink-500
  profit: '#10b981', // emerald-500
  cashProfit: '#14b8a6', // teal-500
};

const DONUT_COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'];

export const ClientReportSubModule: React.FC = () => {
  const { clients, projects, payments, employeePayments, assignments, expenses, services } = useCrm();

  // Find default client: Prefer "MUKUNDRA ROARING TIGERS" or first active client
  const defaultClientId = useMemo(() => {
    if (!clients || clients.length === 0) return 'ALL';
    const mukundra = clients.find((c) => c.name.toUpperCase().includes('MUKUNDRA'));
    if (mukundra) return mukundra.id;
    return clients[0].id;
  }, [clients]);

  // Client Selection State
  const [selectedClientId, setSelectedClientId] = useState<string>('ALL');

  // Set default client once clients are loaded if still on initial state
  useEffect(() => {
    if (defaultClientId && defaultClientId !== 'ALL' && selectedClientId === 'ALL') {
      setSelectedClientId(defaultClientId);
    }
  }, [defaultClientId]);

  // Date Range state — Default: 2024-09-01 to 2026-10-31 as requested in prompt
  const [fromDate, setFromDate] = useState('2024-09-01');
  const [toDate, setToDate] = useState('2026-10-31');
  const [activePreset, setActivePreset] = useState<DatePreset>('all-time');

  // Date Presets Handler
  const handlePresetSelect = (preset: 'last-6-months' | 'this-year' | 'all-time') => {
    setActivePreset(preset);
    switch (preset) {
      case 'last-6-months':
        setFromDate('2026-05-01');
        setToDate('2026-10-31');
        break;
      case 'this-year':
        setFromDate('2026-01-01');
        setToDate('2026-10-31');
        break;
      case 'all-time':
        setFromDate('2024-09-01');
        setToDate('2026-10-31');
        break;
    }
  };

  const handleCustomDateChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    setActivePreset('custom');
  };

  // Get Selected Client Object
  const selectedClient = useMemo(() => {
    if (selectedClientId === 'ALL') return null;
    return clients.find((c) => c.id === selectedClientId) || null;
  }, [clients, selectedClientId]);

  const clientDisplayName = selectedClient ? `${selectedClient.name} (${selectedClient.id})` : 'All Clients (Consolidated)';

  // --- Dynamic Live Calculations for Selected Client & Date Range ---

  // 1. Projects for Selected Client in Date Range
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesClient = selectedClientId === 'ALL' || p.clientId === selectedClientId;
      if (!matchesClient) return false;

      const pDate = p.contractDate || p.startDate || p.proposalDate || p.createdAt?.slice(0, 10);
      if (!pDate) return true; // Include if date missing but client matches
      return pDate >= fromDate && pDate <= toDate;
    });
  }, [projects, selectedClientId, fromDate, toDate]);

  const clientProjectIds = useMemo(() => new Set(filteredProjects.map((p) => p.id)), [filteredProjects]);

  // 2. Payments (Received) for Selected Client in Date Range
  const filteredReceivedPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesClient = selectedClientId === 'ALL' || p.clientId === selectedClientId;
      if (!matchesClient) return false;

      const payDate = p.paymentDate || p.createdAt?.slice(0, 10) || '';
      const inDate = payDate >= fromDate && payDate <= toDate;
      const isReceived = p.paymentStatus === 'Received' || Number(p.amountReceived || 0) > 0;
      return inDate && isReceived;
    });
  }, [payments, selectedClientId, fromDate, toDate]);

  // 3. Financial KPI Calculations
  const totalProjectsCount = filteredProjects.length;

  const totalReceivedINR = useMemo(() => {
    return filteredReceivedPayments.reduce((sum, p) => {
      return sum + Number(p.amountINR ?? p.amountReceived ?? p.amount ?? 0);
    }, 0);
  }, [filteredReceivedPayments]);

  const totalContractValueINR = useMemo(() => {
    return filteredProjects.reduce((sum, p) => {
      return sum + Number(p.contractValue ?? p.contract ?? 0);
    }, 0);
  }, [filteredProjects]);

  // Outstanding (INR): Sum of remaining unpaid balance for the client's projects
  const totalOutstandingINR = useMemo(() => {
    return filteredProjects.reduce((sum, p) => {
      const projPayments = payments.filter(
        (pay) => pay.projectId === p.id && (pay.paymentStatus === 'Received' || Number(pay.amountReceived || 0) > 0)
      );
      const projReceived = projPayments.reduce(
        (acc, pay) => acc + Number(pay.amountINR ?? pay.amountReceived ?? pay.amount ?? 0),
        0
      );
      const contractVal = Number(p.contractValue ?? p.contract ?? 0);
      const balance = Math.max(0, contractVal - projReceived);
      return sum + balance;
    }, 0);
  }, [filteredProjects, payments]);

  // 4. Employee Cost for Selected Client in Date Range
  const totalEmployeeCost = useMemo(() => {
    // Check direct employee payments linked to client projects
    const epCost = employeePayments
      .filter((ep) => {
        const inProject = clientProjectIds.has(ep.projectId);
        const epDate = ep.paymentDate || ep.createdAt?.slice(0, 10) || '';
        const inDate = epDate >= fromDate && epDate <= toDate;
        return inProject && inDate;
      })
      .reduce((sum, ep) => sum + Number(ep.amountPaid || 0), 0);

    if (epCost > 0) return epCost;

    // Fallback to assignments payouts linked to client projects
    const assignCost = assignments
      .filter((a) => {
        const matchesClient = selectedClientId === 'ALL' || a.clientId === selectedClientId || clientProjectIds.has(a.projectId);
        const aDate = a.assignedDate || a.createdAt?.slice(0, 10) || '';
        const inDate = aDate >= fromDate && aDate <= toDate;
        return matchesClient && inDate;
      })
      .reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);

    return assignCost;
  }, [employeePayments, assignments, clientProjectIds, selectedClientId, fromDate, toDate]);

  // 5. Expenses for Selected Client in Date Range
  const totalExpensesINR = useMemo(() => {
    return expenses
      .filter((e) => {
        const matchesClient = selectedClientId === 'ALL' || e.clientId === selectedClientId || clientProjectIds.has(e.projectId);
        const expDate = e.expenseDate || e.createdAt?.slice(0, 10) || '';
        const inDate = expDate >= fromDate && expDate <= toDate;
        return matchesClient && inDate;
      })
      .reduce((sum, e) => sum + Number(e.amountINR ?? e.amount ?? 0), 0);
  }, [expenses, selectedClientId, clientProjectIds, fromDate, toDate]);

  // 6. Profit Calculations
  // Total Contract Profit = (Received + Outstanding) - Employee Cost - Expenses
  const totalClientProfitINR = totalReceivedINR + totalOutstandingINR - totalEmployeeCost - totalExpensesINR;

  // Realized Cash Profit = Received - Employee Cost - Expenses
  const realizedCashProfitINR = totalReceivedINR - totalEmployeeCost - totalExpensesINR;

  const profitMarginPercent =
    totalReceivedINR + totalOutstandingINR > 0
      ? (totalClientProfitINR / (totalReceivedINR + totalOutstandingINR)) * 100
      : 0;

  const isProfitable = totalClientProfitINR >= 0;

  // --- Graph 1 Data: Client Financial Summary Bar Chart ---
  const financialBarData = useMemo(() => {
    return [
      { name: 'Received', amount: totalReceivedINR, fill: PALETTE.received },
      { name: 'Outstanding', amount: totalOutstandingINR, fill: PALETTE.outstanding },
      { name: 'Employee Cost', amount: totalEmployeeCost, fill: PALETTE.employeeCost },
      { name: 'Expenses', amount: totalExpensesINR, fill: PALETTE.expenses },
      {
        name: 'Total Profit',
        amount: totalClientProfitINR,
        fill: isProfitable ? PALETTE.profit : '#ef4444',
      },
    ];
  }, [totalReceivedINR, totalOutstandingINR, totalEmployeeCost, totalExpensesINR, totalClientProfitINR, isProfitable]);

  // --- Graph 2 Data: Project-Wise Revenue & Balance Breakdown ---
  const projectBreakdownData = useMemo(() => {
    return filteredProjects.map((p) => {
      // Find payments received for this project
      const projPayments = payments.filter(
        (pay) => pay.projectId === p.id && (pay.paymentStatus === 'Received' || Number(pay.amountReceived || 0) > 0)
      );
      const received = projPayments.reduce(
        (sum, pay) => sum + Number(pay.amountINR ?? pay.amountReceived ?? pay.amount ?? 0),
        0
      );
      const contract = Number(p.contractValue ?? p.contract ?? 0);
      const outstanding = Math.max(0, contract - received);

      // Expenses linked to project
      const projExpenses = expenses
        .filter((e) => e.projectId === p.id)
        .reduce((sum, e) => sum + Number(e.amountINR ?? e.amount ?? 0), 0);

      // Employee cost linked to project
      const projEpCost = employeePayments
        .filter((ep) => ep.projectId === p.id)
        .reduce((sum, ep) => sum + Number(ep.amountPaid || 0), 0);

      const projProfit = contract - projEpCost - projExpenses;

      // Extract short name for chart display
      const parts = p.id.split(' - ');
      const shortName = parts.length >= 3 ? parts[parts.length - 2] : p.id.slice(0, 18);

      return {
        id: p.id,
        shortName: shortName.length > 20 ? `${shortName.slice(0, 18)}…` : shortName,
        contract,
        received,
        outstanding,
        profit: projProfit,
        status: p.status,
      };
    });
  }, [filteredProjects, payments, expenses, employeePayments]);

  // --- Graph 3 Data: Client Monthly Inflow Timeline ---
  const monthlyInflowData = useMemo(() => {
    const monthMap = new Map<string, { month: string; monthLabel: string; received: number; paymentsCount: number }>();

    filteredReceivedPayments.forEach((p) => {
      const payDate = p.paymentDate || p.createdAt?.slice(0, 10) || '';
      const key = payDate.slice(0, 7);
      if (!key) return;

      if (!monthMap.has(key)) {
        const [year, month] = key.split('-');
        const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

        monthMap.set(key, {
          month: key,
          monthLabel: label,
          received: 0,
          paymentsCount: 0,
        });
      }

      const item = monthMap.get(key)!;
      item.received += Number(p.amountINR ?? p.amountReceived ?? p.amount ?? 0);
      item.paymentsCount += 1;
    });

    return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredReceivedPayments]);

  // --- Graph 4 Data: Service Mix & Revenue Share Donut Chart ---
  const serviceMixData = useMemo(() => {
    const map = new Map<string, number>();

    filteredProjects.forEach((p) => {
      const service = services.find((s) => s.id === p.serviceId);
      const name = service?.name || 'Custom Tech Solution';
      const val = Number(p.contractValue ?? p.contract ?? 0);
      map.set(name, (map.get(name) || 0) + val);
    });

    return Array.from(map.entries()).map(([name, value], idx) => ({
      name,
      value,
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
    }));
  }, [filteredProjects, services]);

  // --- CSV Export Handler ---
  const handleExportCsv = () => {
    const summaryRows = [
      { metric: 'Report Module', value: 'DEVICE DOCTOR — CLIENT DASHBOARD', notes: `Client: ${clientDisplayName}` },
      { metric: 'Date Window', value: `From ${fromDate} to ${toDate}`, notes: `Preset: ${activePreset}` },
      { metric: 'Projects', value: totalProjectsCount, notes: 'Count of projects belonging to client within period' },
      { metric: 'Total Contract Value (INR)', value: totalContractValueINR, notes: 'Sum of all project contract values' },
      { metric: 'Received (INR)', value: totalReceivedINR, notes: 'Cleared payments received from client' },
      { metric: 'Outstanding (INR)', value: totalOutstandingINR, notes: 'Contract Value - Received' },
      { metric: 'Employee Cost (INR)', value: totalEmployeeCost, notes: 'Payroll & assignments linked to client projects' },
      { metric: 'Expenses (INR)', value: totalExpensesINR, notes: 'Direct operational expenses for client' },
      {
        metric: 'Total Profit (INR)',
        value: totalClientProfitINR,
        notes: '(Received + Outstanding) - Employee Cost - Expenses',
      },
      {
        metric: 'Realized Cash Profit (INR)',
        value: realizedCashProfitINR,
        notes: 'Received - Employee Cost - Expenses',
      },
      {
        metric: 'Profit Margin (%)',
        value: `${profitMarginPercent.toFixed(2)}%`,
        notes: '(Total Profit / Total Contract Value) * 100',
      },
    ];

    exportToCsv(
      summaryRows,
      [
        { key: 'metric', header: 'Metric' },
        {
          key: 'value',
          header: 'Value',
          format: (r) => (typeof r.value === 'number' ? formatINR(r.value) : r.value),
        },
        { key: 'notes', header: 'Formula & Detail' },
      ],
      `DeviceDoctorIndia_Client_Dashboard_${selectedClient ? selectedClient.id : 'ALL'}_${fromDate}_to_${toDate}`
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Filter Controls (Client Dropdown + Date Range) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Client Selector & Date Range */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Client Dropdown */}
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <label htmlFor="client-select" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Client:
              </label>
              <select
                id="client-select"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500 max-w-[280px] truncate cursor-pointer"
              >
                <option value="ALL">All Clients (Consolidated)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block mx-1" />

            {/* Date Pickers */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => handleCustomDateChange(e.target.value, toDate)}
                  className="bg-transparent text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                />
              </div>

              <span className="text-slate-400 text-xs font-semibold">→</span>

              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => handleCustomDateChange(fromDate, e.target.value)}
                  className="bg-transparent text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Quick-select Presets & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
              {(
                [
                  { id: 'last-6-months', label: 'Last 6 Months' },
                  { id: 'this-year', label: 'This Year' },
                  { id: 'all-time', label: 'All Time' },
                ] as const
              ).map((preset) => {
                const isSelected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 shadow-xs font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block mx-1" />

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
              title="Export Client Report to CSV"
            >
              <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
              title="Print Client Report"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Selected Context Banner */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Target Client: <strong className="text-cyan-700 dark:text-cyan-400 font-semibold">{clientDisplayName}</strong>
            </span>
            {selectedClient?.city && (
              <>
                <span>·</span>
                <span>Location: {selectedClient.city}, {selectedClient.country}</span>
              </>
            )}
            {selectedClient?.gstNumber && (
              <>
                <span>·</span>
                <span>GST: <code className="font-mono">{selectedClient.gstNumber}</code></span>
              </>
            )}
          </div>
          <div>
            Period: <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{formatDate(fromDate)}</span> to <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{formatDate(toDate)}</span>
          </div>
        </div>
      </div>

      {/* 2. Top Summary Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Projects */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Projects</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {totalProjectsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {formatINR(totalContractValueINR)} contracted
          </div>
        </div>

        {/* Received */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Received (INR)</span>
            <div className="p-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
            {formatINR(totalReceivedINR)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {filteredReceivedPayments.length} payments cleared
          </div>
        </div>

        {/* Outstanding */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Outstanding (INR)</span>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatINR(totalOutstandingINR)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Pending milestone billing
          </div>
        </div>

        {/* Employee Cost */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Employee Cost</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {formatINR(totalEmployeeCost)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Engineering hours & payouts
          </div>
        </div>

        {/* Client Profit */}
        <div
          className={`p-4 rounded-xl border shadow-xs ${
            isProfitable
              ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
              : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className={isProfitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
              Total Profit (INR)
            </span>
            <div
              className={`p-1.5 rounded-lg ${
                isProfitable
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300'
              }`}
            >
              {isProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div
            className={`mt-2 text-xl font-bold font-mono ${
              isProfitable ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatINR(totalClientProfitINR)}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Cash Profit: <strong className="font-mono text-slate-700 dark:text-slate-300">{formatINR(realizedCashProfitINR)}</strong>
          </div>
        </div>
      </div>

      {/* 2. Structured "DEVICE DOCTOR — CLIENT DASHBOARD" Executive Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>DEVICE DOCTOR — CLIENT DASHBOARD</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                AUDITED CLIENT P&L
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Financial performance, contract delivery margins, and collection velocity for {clientDisplayName}
            </p>
          </div>
          <div className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">
            Window: {fromDate} → {toDate}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4 font-bold">Metric</th>
                <th className="py-3 px-4 font-bold text-right">Value</th>
                <th className="py-3 px-4 font-bold text-right">% of Contract / Inflow</th>
                <th className="py-3 px-4 font-bold">Accounting Formula & Scope</th>
                <th className="py-3 px-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {/* Projects */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Projects</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-slate-100 text-sm">
                  {totalProjectsCount}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalProjectsCount > 0 ? `${(totalContractValueINR / (totalProjectsCount || 1) / 1000).toFixed(0)}k avg` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Count of projects contracted or active for {clientDisplayName} within period
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded">
                    Active Contracts
                  </span>
                </td>
              </tr>

              {/* Received (INR) */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-cyan-50/20 dark:bg-cyan-950/10">
                <td className="py-3.5 px-4 font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-500" />
                  <span>Received (INR)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-cyan-700 dark:text-cyan-300 text-base">
                  {formatINR(totalReceivedINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-cyan-700 dark:text-cyan-400">
                  {totalContractValueINR > 0 ? `${((totalReceivedINR / totalContractValueINR) * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> from Payments where Status == "Received"
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950 px-2 py-0.5 rounded">
                    Collected Cash
                  </span>
                </td>
              </tr>

              {/* Outstanding (INR) */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Outstanding (INR)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-amber-600 dark:text-amber-400 text-sm">
                  {formatINR(totalOutstandingINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalContractValueINR > 0 ? `${((totalOutstandingINR / totalContractValueINR) * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of remaining unpaid balance (<code className="font-mono text-[11px]">Contract Value - Received</code>)
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded">
                    Receivable
                  </span>
                </td>
              </tr>

              {/* Employee Cost */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>Employee Cost</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-indigo-600 dark:text-indigo-400 text-sm">
                  {formatINR(totalEmployeeCost)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300 font-medium">
                  {totalReceivedINR > 0 ? `${((totalEmployeeCost / totalReceivedINR) * 100).toFixed(1)}% of recv.` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount Paid</code> from Employee Payments linked to this client
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">
                    Workforce Cost
                  </span>
                </td>
              </tr>

              {/* Expenses */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-pink-500" />
                  <span>Expenses</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-pink-600 dark:text-pink-400 text-sm">
                  {formatINR(totalExpensesINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300 font-medium">
                  {totalReceivedINR > 0 ? `${((totalExpensesINR / totalReceivedINR) * 100).toFixed(1)}% of recv.` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> from Other Expenses linked to client projects
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/50 px-2 py-0.5 rounded">
                    Direct OPEX
                  </span>
                </td>
              </tr>

              {/* Profit Row */}
              <tr
                className={`font-bold transition-colors ${
                  isProfitable
                    ? 'bg-emerald-500/10 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-500/10 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                }`}
              >
                <td className="py-4 px-4 text-sm flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isProfitable ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div>
                    <span>Total Client Profit</span>
                    <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                      Realized Cash Profit: <strong className="font-mono">{formatINR(realizedCashProfitINR)}</strong>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4 font-mono text-right text-lg">
                  {formatINR(totalClientProfitINR)}
                </td>
                <td className="py-4 px-4 text-right font-mono text-sm">
                  {profitMarginPercent.toFixed(2)}% margin
                </td>
                <td className="py-4 px-4 text-xs font-normal">
                  Exact specification: <strong className="font-mono">(Received + Outstanding) - Employee Cost - Expenses</strong>
                </td>
                <td className="py-4 px-4 text-center">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      isProfitable
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-200'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/80 dark:text-rose-200'
                    }`}
                  >
                    {isProfitable ? 'High Margin' : 'Negative'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Interactive Graphs & Visual Analytics Grid for Selected Client (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Client Financial Summary Bar Graph */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Client Financial Summary (Bar Chart)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comparison of Inflow, Outstanding, Outflows & Profit for {clientDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-cyan-600 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded font-semibold">
              P&L Split
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialBarData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} interval={0} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                  width={55}
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
                  itemStyle={{ color: '#38bdf8' }}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {financialBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 2: Project-Wise Revenue & Balance Breakdown Grouped Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Project-Wise Revenue & Balance Breakdown</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Contract Value vs Received vs Outstanding vs Profit per project
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {filteredProjects.length} Projects
            </span>
          </div>

          <div className="h-64 w-full">
            {projectBreakdownData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Briefcase className="w-6 h-6 mb-1 text-slate-300" />
                <span>No projects recorded for this client in selected dates</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectBreakdownData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="shortName" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      formatINR(Number(val || 0)),
                      name === 'contract'
                        ? 'Contract Value'
                        : name === 'received'
                        ? 'Received'
                        : name === 'outstanding'
                        ? 'Outstanding'
                        : 'Project Profit',
                    ]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ fontSize: '10px', paddingBottom: '8px' }}
                    formatter={(val) =>
                      val === 'contract'
                        ? 'Contract'
                        : val === 'received'
                        ? 'Received'
                        : val === 'outstanding'
                        ? 'Outstanding'
                        : 'Profit'
                    }
                  />
                  <Bar dataKey="contract" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="received" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 3: Client Payment Timeline / Monthly Inflow Histogram */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Payment Timeline & Monthly Inflows</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Month-by-month payment clearance velocity for {clientDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-cyan-600 bg-cyan-50 dark:bg-cyan-950/60 px-2 py-0.5 rounded font-semibold">
              {formatINR(totalReceivedINR)} Total
            </span>
          </div>

          <div className="h-64 w-full">
            {monthlyInflowData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Calendar className="w-6 h-6 mb-1 text-slate-300" />
                <span>No payments logged for this client in the selected date window</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyInflowData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      formatINR(Number(val || 0)),
                      name === 'received' ? 'Received Cash' : name,
                    ]}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Bar dataKey="received" name="received" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="received" stroke="#0e7490" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 4: Service Mix & Revenue Share Donut Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Service Mix & Revenue Share</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Breakdown of services contracted by {clientDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-purple-600 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded font-semibold">
              {serviceMixData.length} Service Lines
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {serviceMixData.length === 0 ? (
              <div className="text-slate-400 text-xs">No service data available for selected client</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(val) => [formatINR(Number(val || 0)), 'Contract Value']}
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
                    data={serviceMixData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {serviceMixData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 4. Client Projects & Payments Drill-Down Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Client Project Ledger & Contract Fulfillment Audit</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Itemized project-by-project delivery breakdown with contract value, collections, outstanding, costs, and profit
            </p>
          </div>
          <div className="text-xs font-mono font-medium text-slate-500">
            Total {filteredProjects.length} Projects Listed
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Project ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Service / Domain</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Contract Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Status</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right">Contract Value</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-cyan-700 dark:text-cyan-400">Received</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-amber-700 dark:text-amber-400">Outstanding</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-indigo-700 dark:text-indigo-400">Employee Cost</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-pink-700 dark:text-pink-400">Expenses</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-emerald-700 dark:text-emerald-400">Project Profit</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-center">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No projects found for {clientDisplayName} in this date window.</p>
                    <p className="text-xs mt-1">Select "All Time" or pick another client from the dropdown above.</p>
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p) => {
                  const service = services.find((s) => s.id === p.serviceId);
                  const projPayments = payments.filter(
                    (pay) => pay.projectId === p.id && (pay.paymentStatus === 'Received' || Number(pay.amountReceived || 0) > 0)
                  );
                  const received = projPayments.reduce(
                    (sum, pay) => sum + Number(pay.amountINR ?? pay.amountReceived ?? pay.amount ?? 0),
                    0
                  );
                  const contract = Number(p.contractValue ?? p.contract ?? 0);
                  const outstanding = Math.max(0, contract - received);

                  const projEpCost = employeePayments
                    .filter((ep) => ep.projectId === p.id)
                    .reduce((sum, ep) => sum + Number(ep.amountPaid || 0), 0);

                  const projExpenses = expenses
                    .filter((e) => e.projectId === p.id)
                    .reduce((sum, e) => sum + Number(e.amountINR ?? e.amount ?? 0), 0);

                  const profit = contract - projEpCost - projExpenses;
                  const margin = contract > 0 ? (profit / contract) * 100 : 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3.5 font-mono font-semibold text-cyan-600 dark:text-cyan-400 whitespace-nowrap max-w-[200px] truncate" title={p.id}>
                        {p.id}
                      </td>
                      <td className="py-3 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                        {service?.name || 'Custom Tech Solution'}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                        {formatDate(p.contractDate || p.startDate)}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : p.status === 'In Progress'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : p.status === 'On Hold'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono font-bold text-right text-slate-900 dark:text-white whitespace-nowrap">
                        {formatINR(contract)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-right text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                        {formatINR(received)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        {formatINR(outstanding)}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-right text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {formatINR(projEpCost)}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-right text-pink-600 dark:text-pink-400 whitespace-nowrap">
                        {formatINR(projExpenses)}
                      </td>
                      <td
                        className={`py-3 px-3.5 font-mono font-bold text-right whitespace-nowrap ${
                          profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatINR(profit)}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            margin >= 30
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : margin >= 0
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {margin.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
