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
import {
  chartTooltipProps,
  chartXAxisProps,
  chartYAxisProps,
  chartGridProps,
  renderHighContrastLegend,
  PIE_SLICE_BORDER,
  HELVETICA_FONT,
} from './ChartTheme';

type DatePreset = 'last-6-months' | 'this-year' | 'all-time' | 'custom';

const PALETTE = {
  received: '#000000',
  outstanding: '#6b7280',
  contract: '#111827',
  employeeCost: '#374151',
  expenses: '#9ca3af',
  profit: '#000000',
  cashProfit: '#1f2937',
};

const DONUT_COLORS = ['#000000', '#374151', '#6b7280', '#9ca3af', '#111827', '#4b5563', '#d1d5db'];

export const ClientReportSubModule: React.FC = () => {
  const { clients, projects, payments, employeePayments, assignments, expenses, services, activeBrand, brandPrefix, isConsolidatedView } = useCrm();

  const reportTitle = isConsolidatedView
    ? 'CONSOLIDATED GROUP — CLIENT DASHBOARD'
    : `${activeBrand.toUpperCase()} — CLIENT DASHBOARD`;

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
        fill: isProfitable ? PALETTE.profit : '#475569',
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
      { metric: 'Report Module', value: reportTitle, notes: `Client: ${clientDisplayName}` },
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
      `${brandPrefix}_Client_Dashboard_${selectedClient ? selectedClient.id : 'ALL'}_${fromDate}_to_${toDate}`
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
              <Building className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
              <label htmlFor="client-select" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Client:
              </label>
              <select
                id="client-select"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900 max-w-[280px] truncate cursor-pointer"
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
                        ? 'bg-black text-white shadow-xs font-semibold'
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
              <Download className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
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
              Target Client: <strong className="text-slate-900 dark:text-white font-semibold">{clientDisplayName}</strong>
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
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
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
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-700 dark:text-slate-300">
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
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">
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
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">
            {formatINR(totalEmployeeCost)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Engineering hours & payouts
          </div>
        </div>

        {/* Client Profit */}
        <div
          className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-900 dark:text-white">
              Total Profit (INR)
            </span>
            <div
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700"
            >
              {isProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div
            className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white"
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
              <span>{reportTitle}</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-black text-white dark:bg-white dark:text-black">
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
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
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
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Active Contracts
                  </span>
                </td>
              </tr>

              {/* Received (INR) */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-slate-50/60 dark:bg-slate-800/30">
                <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-900 dark:bg-white" />
                  <span>Received (INR)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-white text-base">
                  {formatINR(totalReceivedINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                  {totalContractValueINR > 0 ? `${((totalReceivedINR / totalContractValueINR) * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> from Payments where Status == "Received"
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-bold text-white bg-black text-white px-2 py-0.5 rounded">
                    Collected Cash
                  </span>
                </td>
              </tr>

              {/* Outstanding (INR) */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>Outstanding (INR)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-sm">
                  {formatINR(totalOutstandingINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalContractValueINR > 0 ? `${((totalOutstandingINR / totalContractValueINR) * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of remaining unpaid balance (<code className="font-mono text-[11px]">Contract Value - Received</code>)
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Receivable
                  </span>
                </td>
              </tr>

              {/* Employee Cost */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                  <span>Employee Cost</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-sm">
                  {formatINR(totalEmployeeCost)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300 font-medium">
                  {totalReceivedINR > 0 ? `${((totalEmployeeCost / totalReceivedINR) * 100).toFixed(1)}% of recv.` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount Paid</code> from Employee Payments linked to this client
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Workforce Cost
                  </span>
                </td>
              </tr>

              {/* Expenses */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Expenses</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-sm">
                  {formatINR(totalExpensesINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300 font-medium">
                  {totalReceivedINR > 0 ? `${((totalExpensesINR / totalReceivedINR) * 100).toFixed(1)}% of recv.` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> from Other Expenses linked to client projects
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Direct OPEX
                  </span>
                </td>
              </tr>

              {/* Profit Row */}
              <tr
                className="font-bold transition-colors bg-slate-100 dark:bg-slate-800 border-t-2 border-black dark:border-white text-slate-900 dark:text-white"
              >
                <td className="py-4 px-4 text-sm flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-black dark:bg-white" />
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
                    className="text-xs font-bold px-2.5 py-1 rounded-full bg-black text-white dark:bg-white dark:text-black"
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-sans">
        {/* Graph 1: Client Financial Summary Bar Graph */}
        <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-black dark:text-white flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-black dark:text-white" />
                <span>Client Financial Summary (Bar Chart)</span>
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Comparison of Inflow, Outstanding, Outflows & Profit for {clientDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-black dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-[#e2e8f0] dark:border-neutral-700 font-semibold">
              P&L Split
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialBarData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="name" {...chartXAxisProps} tickLine={false} interval={0} />
                <YAxis
                  {...chartYAxisProps}
                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                  width={55}
                />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(val) => [formatINR(Number(val || 0)), 'Amount']}
                />
                <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                  {financialBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="#ffffff" strokeWidth={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 2: Project-Wise Revenue & Balance Breakdown Grouped Bar Chart */}
        <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-black dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-black dark:text-white" />
                <span>Project-Wise Revenue & Balance Breakdown</span>
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Contract Value vs Received vs Outstanding vs Profit per project
              </p>
            </div>
            <span className="text-[11px] font-mono text-black dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-[#e2e8f0] dark:border-neutral-700">
              {filteredProjects.length} Projects
            </span>
          </div>

          <div className="h-64 w-full">
            {projectBreakdownData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-xs font-sans">
                <Briefcase className="w-6 h-6 mb-1 text-neutral-400" />
                <span>No projects recorded for this client in selected dates</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectBreakdownData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="shortName" {...chartXAxisProps} tickLine={false} />
                  <YAxis
                    {...chartYAxisProps}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    {...chartTooltipProps}
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
                  />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '8px', fontFamily: HELVETICA_FONT }}
                    formatter={(val) =>
                      renderHighContrastLegend(
                        val === 'contract'
                          ? 'Contract'
                          : val === 'received'
                          ? 'Received'
                          : val === 'outstanding'
                          ? 'Outstanding'
                          : 'Profit'
                      )
                    }
                  />
                  <Bar dataKey="contract" fill="#000000" radius={[2, 2, 0, 0]} stroke="#ffffff" strokeWidth={1} />
                  <Bar dataKey="received" fill="#1f2937" radius={[2, 2, 0, 0]} stroke="#ffffff" strokeWidth={1} />
                  <Bar dataKey="outstanding" fill="#6b7280" radius={[2, 2, 0, 0]} stroke="#ffffff" strokeWidth={1} />
                  <Bar dataKey="profit" fill="#374151" radius={[2, 2, 0, 0]} stroke="#ffffff" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 3: Client Payment Timeline / Monthly Inflow Histogram */}
        <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-black dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-black dark:text-white" />
                <span>Payment Timeline & Monthly Inflows</span>
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Month-by-month payment clearance velocity for {clientDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-black dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded font-semibold border border-[#e2e8f0] dark:border-neutral-700">
              {formatINR(totalReceivedINR)} Total
            </span>
          </div>

          <div className="h-64 w-full">
            {monthlyInflowData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-xs font-sans">
                <Calendar className="w-6 h-6 mb-1 text-neutral-400" />
                <span>No payments logged for this client in the selected date window</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyInflowData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="monthLabel" {...chartXAxisProps} tickLine={false} />
                  <YAxis
                    {...chartYAxisProps}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(val, name) => [
                      formatINR(Number(val || 0)),
                      name === 'received' ? 'Received Cash' : name,
                    ]}
                  />
                  <Bar dataKey="received" name="received" fill="#000000" radius={[2, 2, 0, 0]} stroke="#ffffff" strokeWidth={1} />
                  <Line type="monotone" dataKey="received" stroke="#111827" strokeWidth={2} dot={{ r: 4, fill: '#111827', stroke: '#ffffff', strokeWidth: 1.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 4: Service Mix & Revenue Share Donut Chart */}
        <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-black dark:text-white flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-black dark:text-white" />
                <span>Service Mix & Revenue Share</span>
              </h4>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                Breakdown of services contracted by {clientDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-black dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded font-semibold border border-[#e2e8f0] dark:border-neutral-700">
              {serviceMixData.length} Service Lines
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {serviceMixData.length === 0 ? (
              <div className="text-neutral-500 text-xs font-sans">No service data available for selected client</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(val) => [formatINR(Number(val || 0)), 'Contract Value']}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px', fontFamily: HELVETICA_FONT }}
                    formatter={renderHighContrastLegend}
                  />
                  <Pie
                    data={serviceMixData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                    {...PIE_SLICE_BORDER}
                  >
                    {serviceMixData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} {...PIE_SLICE_BORDER} />
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
              <Briefcase className="w-4 h-4 text-slate-700 dark:text-slate-300" />
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
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-slate-900 dark:text-white">Received</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-slate-700 dark:text-slate-300">Outstanding</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-slate-700 dark:text-slate-300">Employee Cost</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-slate-700 dark:text-slate-300">Expenses</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-slate-900 dark:text-white">Project Profit</th>
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
                      <td className="py-3 px-3.5 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate" title={p.id}>
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
                              ? 'bg-black text-white'
                              : p.status === 'In Progress'
                              ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                              : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono font-bold text-right text-slate-900 dark:text-white whitespace-nowrap">
                        {formatINR(contract)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatINR(received)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-right text-slate-900 dark:text-white whitespace-nowrap">
                        {formatINR(outstanding)}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-right text-slate-900 dark:text-white whitespace-nowrap">
                        {formatINR(projEpCost)}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-right text-slate-900 dark:text-white whitespace-nowrap">
                        {formatINR(projExpenses)}
                      </td>
                      <td
                        className={`py-3 px-3.5 font-mono font-bold text-right whitespace-nowrap ${
                          'text-slate-900 dark:text-white'
                        }`}
                      >
                        {formatINR(profit)}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
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
