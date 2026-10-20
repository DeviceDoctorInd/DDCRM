import React, { useState, useMemo } from 'react';
import { useCrm } from '../../../context/CrmContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import { exportToCsv } from '../../../utils/csvExport';
import {
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
  HelpCircle,
  ArrowUpRight,
  Filter,
  BarChart2,
  PieChart as PieChartIcon,
  Layers,
  Sparkles,
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

type DatePreset = 'this-month' | 'last-3-months' | 'last-6-months' | 'this-fy' | 'all-time';

const COLORS = {
  received: '#0f172a', // slate-900 / dark charcoal
  outstanding: '#64748b', // slate-500
  employeeCost: '#334155', // slate-700
  expenses: '#94a3b8', // slate-400
  profitPositive: '#000000', // black
  profitNegative: '#475569', // slate-600
  pieProfit: '#0f172a',
  pieEmployee: '#475569',
  pieExpense: '#94a3b8',
};

export const BusinessReportSubModule: React.FC = () => {
  const { projects, payments, employeePayments, assignments, expenses, activeBrand, brandPrefix, isConsolidatedView } = useCrm();

  const reportTitle = isConsolidatedView
    ? 'CONSOLIDATED GROUP — BUSINESS DASHBOARD'
    : `${activeBrand.toUpperCase()} — BUSINESS DASHBOARD`;

  // Date Range state — Default: Last 6 months (May 2026 to Oct 2026) to capture representative data
  const [fromDate, setFromDate] = useState('2026-05-01');
  const [toDate, setToDate] = useState('2026-10-31');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last-6-months');

  // Handle Preset Clicks
  const handlePresetSelect = (preset: DatePreset) => {
    setActivePreset(preset);
    const now = new Date('2026-10-16'); // local applet baseline

    switch (preset) {
      case 'this-month':
        setFromDate('2026-10-01');
        setToDate('2026-10-31');
        break;
      case 'last-3-months':
        setFromDate('2026-07-01');
        setToDate('2026-10-31');
        break;
      case 'last-6-months':
        setFromDate('2026-05-01');
        setToDate('2026-10-31');
        break;
      case 'this-fy':
        // Indian FY: April 1, 2026 to March 31, 2027
        setFromDate('2026-04-01');
        setToDate('2027-03-31');
        break;
      case 'all-time':
        setFromDate('2025-01-01');
        setToDate('2027-12-31');
        break;
    }
  };

  const handleCustomDateChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    setActivePreset('custom');
  };

  // --- Dynamic Live Calculations within [fromDate, toDate] ---

  // 1. Filtered Projects (contracted or started in range)
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const pDate = p.contractDate || p.startDate || p.proposalDate || p.createdAt?.slice(0, 10);
      if (!pDate) return false;
      return pDate >= fromDate && pDate <= toDate;
    });
  }, [projects, fromDate, toDate]);

  // 2. Filtered Payments (Received within fromDate – toDate)
  const filteredReceivedPayments = useMemo(() => {
    return payments.filter((p) => {
      const payDate = p.paymentDate || p.createdAt?.slice(0, 10);
      return (
        payDate >= fromDate &&
        payDate <= toDate &&
        (p.paymentStatus === 'Received' || Number(p.amountReceived || 0) > 0)
      );
    });
  }, [payments, fromDate, toDate]);

  // 3. Financial Metrics
  const totalProjectsCount = filteredProjects.length;

  const totalReceivedINR = useMemo(() => {
    return filteredReceivedPayments.reduce((sum, p) => {
      const amt = Number(p.amountINR ?? p.amountReceived ?? p.amount ?? 0);
      return sum + amt;
    }, 0);
  }, [filteredReceivedPayments]);

  // Outstanding (INR): Sum of remaining unpaid balance for projects in this period
  const totalOutstandingINR = useMemo(() => {
    return filteredProjects.reduce((sum, p) => {
      // Calculate total payments received for this project
      const projPayments = payments.filter(
        (pay) => pay.projectId === p.id && pay.paymentStatus === 'Received'
      );
      const projReceived = projPayments.reduce(
        (acc, pay) => acc + (Number(pay.amountINR ?? pay.amountReceived ?? pay.amount ?? 0)),
        0
      );
      const contractVal = Number(p.contractValue ?? p.contract ?? 0);
      const balance = Math.max(0, contractVal - projReceived);
      return sum + balance;
    }, 0);
  }, [filteredProjects, payments]);

  // 4. Employee Cost: Sum of Amount Paid from Employee Payments or Assignments in period
  const totalEmployeeCost = useMemo(() => {
    const epDirect = employeePayments
      .filter((ep) => {
        const epDate = ep.paymentDate || ep.createdAt?.slice(0, 10);
        return epDate >= fromDate && epDate <= toDate;
      })
      .reduce((sum, ep) => sum + (Number(ep.amountPaid) || 0), 0);

    // If direct employee payment slips exist, prioritize that; else check assignment payouts
    if (epDirect > 0) return epDirect;

    const assignmentPayouts = assignments
      .filter((a) => {
        const aDate = a.assignedDate || a.createdAt?.slice(0, 10);
        return aDate >= fromDate && aDate <= toDate;
      })
      .reduce((sum, a) => sum + (Number(a.amountPaid) || 0), 0);

    return assignmentPayouts;
  }, [employeePayments, assignments, fromDate, toDate]);

  // 5. Expenses: Sum of Amount (INR) from Other Expenses module in period
  const totalExpensesINR = useMemo(() => {
    return expenses
      .filter((e) => {
        const expDate = e.expenseDate || e.createdAt?.slice(0, 10);
        return expDate >= fromDate && expDate <= toDate;
      })
      .reduce((sum, e) => sum + (Number(e.amountINR ?? e.amount ?? 0)), 0);
  }, [expenses, fromDate, toDate]);

  // 6. Net Profit and Profit Margin %
  const totalOutflow = totalEmployeeCost + totalExpensesINR;
  const netProfitINR = totalReceivedINR - totalOutflow;
  const profitMarginPercent = totalReceivedINR > 0 ? (netProfitINR / totalReceivedINR) * 100 : 0;
  const isProfitable = netProfitINR >= 0;

  // --- Monthly Time-Series Aggregations for Charts ---
  const monthlyData = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        month: string;
        monthLabel: string;
        received: number;
        employeeCost: number;
        expenses: number;
        outflow: number;
        profit: number;
      }
    >();

    // Helper to format YYYY-MM into MMM YYYY
    const formatMonthKey = (dateStr: string) => {
      const [year, month] = dateStr.slice(0, 7).split('-');
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    };

    // Populate months from payments
    filteredReceivedPayments.forEach((p) => {
      const key = (p.paymentDate || p.createdAt?.slice(0, 10) || '').slice(0, 7);
      if (!key) return;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          month: key,
          monthLabel: formatMonthKey(key),
          received: 0,
          employeeCost: 0,
          expenses: 0,
          outflow: 0,
          profit: 0,
        });
      }
      const item = monthMap.get(key)!;
      item.received += Number(p.amountINR ?? p.amountReceived ?? p.amount ?? 0);
    });

    // Populate employee payments
    employeePayments.forEach((ep) => {
      const key = (ep.paymentDate || ep.createdAt?.slice(0, 10) || '').slice(0, 7);
      if (!key || key < fromDate.slice(0, 7) || key > toDate.slice(0, 7)) return;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          month: key,
          monthLabel: formatMonthKey(key),
          received: 0,
          employeeCost: 0,
          expenses: 0,
          outflow: 0,
          profit: 0,
        });
      }
      const item = monthMap.get(key)!;
      item.employeeCost += Number(ep.amountPaid || 0);
    });

    // Populate expenses
    expenses.forEach((e) => {
      const key = (e.expenseDate || e.createdAt?.slice(0, 10) || '').slice(0, 7);
      if (!key || key < fromDate.slice(0, 7) || key > toDate.slice(0, 7)) return;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          month: key,
          monthLabel: formatMonthKey(key),
          received: 0,
          employeeCost: 0,
          expenses: 0,
          outflow: 0,
          profit: 0,
        });
      }
      const item = monthMap.get(key)!;
      item.expenses += Number(e.amountINR ?? e.amount ?? 0);
    });

    // Sort by chronological order
    const sorted = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Calculate totals
    return sorted.map((m) => {
      const outflow = m.employeeCost + m.expenses;
      return {
        ...m,
        outflow,
        profit: m.received - outflow,
      };
    });
  }, [filteredReceivedPayments, employeePayments, expenses, fromDate, toDate]);

  // --- Project Value Distribution Brackets (Histogram) ---
  const projectBracketsData = useMemo(() => {
    const brackets = [
      { name: '< ₹50k', min: 0, max: 50000, count: 0, totalValue: 0 },
      { name: '₹50k – ₹1L', min: 50000, max: 100000, count: 0, totalValue: 0 },
      { name: '₹1L – ₹3L', min: 100000, max: 300000, count: 0, totalValue: 0 },
      { name: '₹3L – ₹5L', min: 300000, max: 500000, count: 0, totalValue: 0 },
      { name: '₹5L+', min: 500000, max: Infinity, count: 0, totalValue: 0 },
    ];

    filteredProjects.forEach((p) => {
      const val = Number(p.contractValue ?? p.contract ?? 0);
      for (const b of brackets) {
        if (val >= b.min && (val < b.max || (b.max === Infinity && val >= b.min))) {
          b.count += 1;
          b.totalValue += val;
          break;
        }
      }
    });

    return brackets;
  }, [filteredProjects]);

  // --- Financial Breakdown Bar Chart Data ---
  const financialBarData = useMemo(() => {
    return [
      { name: 'Received', amount: totalReceivedINR, fill: COLORS.received },
      { name: 'Outstanding', amount: totalOutstandingINR, fill: COLORS.outstanding },
      { name: 'Employee Cost', amount: totalEmployeeCost, fill: COLORS.employeeCost },
      { name: 'Expenses', amount: totalExpensesINR, fill: COLORS.expenses },
      {
        name: 'Net Profit',
        amount: netProfitINR,
        fill: isProfitable ? COLORS.profitPositive : COLORS.profitNegative,
      },
    ];
  }, [totalReceivedINR, totalOutstandingINR, totalEmployeeCost, totalExpensesINR, netProfitINR, isProfitable]);

  // --- Donut / Pie Chart (Cost vs Profit Distribution) ---
  const pieDistributionData = useMemo(() => {
    const list: { name: string; value: number; color: string }[] = [];
    if (netProfitINR > 0) {
      list.push({ name: 'Net Profit', value: netProfitINR, color: COLORS.pieProfit });
    }
    if (totalEmployeeCost > 0) {
      list.push({ name: 'Employee Cost', value: totalEmployeeCost, color: COLORS.pieEmployee });
    }
    if (totalExpensesINR > 0) {
      list.push({ name: 'Other Expenses', value: totalExpensesINR, color: COLORS.pieExpense });
    }
    return list;
  }, [netProfitINR, totalEmployeeCost, totalExpensesINR]);

  // --- CSV Export Handler ---
  const handleExportCsv = () => {
    const rows = [
      { metric: 'Report Scope', value: `From ${fromDate} to ${toDate}`, notes: `Preset: ${activePreset}` },
      { metric: 'Projects', value: totalProjectsCount, notes: 'Total count of projects contracted or started in period' },
      { metric: 'Received (INR)', value: totalReceivedINR, notes: 'Gross payments cleared and received in bank' },
      { metric: 'Outstanding (INR)', value: totalOutstandingINR, notes: 'Remaining unpaid contract balances for period projects' },
      { metric: 'Employee Cost (INR)', value: totalEmployeeCost, notes: 'Disbursed employee payments and task compensation' },
      { metric: 'Other Expenses (INR)', value: totalExpensesINR, notes: 'General operational, cloud, and infrastructure expenses' },
      { metric: 'Total Outflow (INR)', value: totalOutflow, notes: 'Employee Cost + Other Expenses' },
      { metric: 'Net Profit (INR)', value: netProfitINR, notes: 'Received - Employee Cost - Expenses' },
      { metric: 'Profit Margin (%)', value: `${profitMarginPercent.toFixed(2)}%`, notes: '(Net Profit / Received) * 100' },
    ];

    exportToCsv(
      rows,
      [
        { key: 'metric', header: 'Metric' },
        {
          key: 'value',
          header: 'Value',
          format: (r) => (typeof r.value === 'number' ? formatINR(r.value) : r.value),
        },
        { key: 'notes', header: 'Notes & Calculation Formula' },
      ],
      `${brandPrefix}_Business_Dashboard_${fromDate}_to_${toDate}`
    );
  };

  // --- Print Handler ---
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* 1. Date Range Filter Bar (Top Control Panel) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Date Pickers */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Period Window:
              </span>
            </div>

            <div className="flex items-center gap-2">
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

          {/* Quick-select Presets & Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
              {(
                [
                  { id: 'this-month', label: 'This Month' },
                  { id: 'last-3-months', label: 'Last 3M' },
                  { id: 'last-6-months', label: 'Last 6M' },
                  { id: 'this-fy', label: 'This FY' },
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

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block mx-1" />

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
              title="Export Business Dashboard to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
              title="Print Business Report"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Date Window Summary Notice */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div>
            Showing live metrics filtered from <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatDate(fromDate)}</strong> to{' '}
            <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatDate(toDate)}</strong>.
          </div>
          <div className="flex items-center gap-2">
            <span>Currency: <strong className="text-slate-700 dark:text-slate-300">INR (₹)</strong></span>
            <span>·</span>
            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
              <CheckCircle2 className="w-3 h-3 text-slate-500" /> Auto-calculated
            </span>
          </div>
        </div>
      </div>

      {/* 2. Top KPI Cards Banner */}
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
            Contracted in date window
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
          <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">
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
            Unbilled contract balances
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
            Salaries & milestone payouts
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Net Profit (INR)</span>
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              {isProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-white">
            {formatINR(netProfitINR)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="text-slate-900 dark:text-slate-100 font-bold">
              {profitMarginPercent.toFixed(1)}% margin
            </span>
            <span className="text-slate-500 font-normal">
              · {isProfitable ? 'Net Surplus' : 'Operating Deficit'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Executive Spreadsheet Specification Table: "DEVICE DOCTOR — BUSINESS DASHBOARD" */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{reportTitle}</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-black text-white dark:bg-white dark:text-black">
                AUDITED P&L LEDGER
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exact financial summary table conforming to agency accounting and partner distribution standards
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
                <th className="py-3 px-4 font-bold text-right">% of Revenue / Proportion</th>
                <th className="py-3 px-4 font-bold">Accounting Formula & Source Module</th>
                <th className="py-3 px-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {/* Row 1: Projects */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Projects</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-slate-100 text-sm">
                  {totalProjectsCount}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalProjectsCount > 0 ? `${(totalReceivedINR / (totalProjectsCount || 1) / 1000).toFixed(0)}k avg/proj` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Total projects contracted or active in Projects module within selected dates
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Active Base
                  </span>
                </td>
              </tr>

              {/* Row 2: Received (INR) */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-slate-50/60 dark:bg-slate-800/30">
                <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-900 dark:bg-white" />
                  <span>Received (INR)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-base">
                  {formatINR(totalReceivedINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                  100.0%
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> from Payments where Status == "Received"
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-bold text-white bg-black px-2 py-0.5 rounded">
                    Revenue Cleared
                  </span>
                </td>
              </tr>

              {/* Row 3: Outstanding (INR) */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>Outstanding (INR)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-sm">
                  {formatINR(totalOutstandingINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalReceivedINR > 0 ? `${((totalOutstandingINR / totalReceivedINR) * 100).toFixed(1)}% of coll.` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of remaining unpaid balance (<code className="font-mono text-[11px]">Contract Value - Received</code>) for period projects
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Receivable
                  </span>
                </td>
              </tr>

              {/* Row 4: Employee Cost */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600" />
                  <span>Employee Cost</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-sm">
                  {formatINR(totalEmployeeCost)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300 font-medium">
                  {totalReceivedINR > 0 ? `${((totalEmployeeCost / totalReceivedINR) * 100).toFixed(1)}%` : '0.0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount Paid</code> from Employee Payments & Assignments module
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Payroll Outflow
                  </span>
                </td>
              </tr>

              {/* Row 5: Expenses */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Expenses</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-white text-sm">
                  {formatINR(totalExpensesINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300 font-medium">
                  {totalReceivedINR > 0 ? `${((totalExpensesINR / totalReceivedINR) * 100).toFixed(1)}%` : '0.0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> from Other Expenses module (tools, licenses, cloud infra)
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Operating Cost
                  </span>
                </td>
              </tr>

              {/* Row 6: Total Outflow */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-slate-50/50 dark:bg-slate-800/30">
                <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 pl-8">
                  ↳ Total Cost Outflow
                </td>
                <td className="py-3 px-4 font-mono font-semibold text-right text-slate-700 dark:text-slate-300 text-sm">
                  {formatINR(totalOutflow)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalReceivedINR > 0 ? `${((totalOutflow / totalReceivedINR) * 100).toFixed(1)}%` : '0.0%'}
                </td>
                <td className="py-3 px-4 text-slate-500 text-[11px]">
                  Employee Cost + Other Expenses
                </td>
                <td className="py-3 px-4 text-center text-slate-400 text-[11px]">
                  Total Outflow
                </td>
              </tr>

              {/* Row 7: Net Profit (INR) */}
              <tr className="font-bold transition-colors bg-slate-100 dark:bg-slate-800 border-t-2 border-black dark:border-white text-slate-900 dark:text-white">
                <td className="py-4 px-4 text-sm flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-black dark:bg-white" />
                  <span>Profit (Net Surplus)</span>
                </td>
                <td className="py-4 px-4 font-mono text-right text-lg">
                  {formatINR(netProfitINR)}
                </td>
                <td className="py-4 px-4 text-right font-mono text-sm">
                  {profitMarginPercent.toFixed(2)}%
                </td>
                <td className="py-4 px-4 text-xs font-normal">
                  Auto-calculated formula: <strong className="font-mono">Received (INR) - Employee Cost - Expenses</strong>
                </td>
                <td className="py-4 px-4 text-center">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-black text-white dark:bg-white dark:text-black">
                    {isProfitable ? 'Profitable' : 'Deficit'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Visual Interactive Analytics Grid (Powered by Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Financial Breakdown Side-by-Side Bar Graph */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                <span>Financial Breakdown (Bar Graph)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comparison of Inflow, Outstanding, Outflows & Net Profit
              </p>
            </div>
            <span className="text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              P&L Overview
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialBarData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  interval={0}
                />
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
                  itemStyle={{ color: '#ffffff' }}
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

        {/* Chart 2: Monthly Revenue vs Cost vs Profit Histogram / Grouped Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                <span>Monthly Inflow vs Outflow vs Profit</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Time-series distribution across months in the date window
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              Trend Line
            </span>
          </div>

          <div className="h-64 w-full">
            {monthlyData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Calendar className="w-6 h-6 mb-1 text-slate-300" />
                <span>No monthly transactions in this date range</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
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
                      name === 'received' ? 'Inflow (Received)' : name === 'outflow' ? 'Outflow (Cost)' : 'Net Profit',
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
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                    formatter={(val) =>
                      val === 'received' ? 'Inflow' : val === 'outflow' ? 'Outflow' : 'Profit Line'
                    }
                  />
                  <Bar dataKey="received" name="received" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" name="outflow" fill="#64748b" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="profit"
                    stroke="#000000"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#000000' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Project Value Distribution Histogram */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                <span>Project Value Distribution (Deal Size Histogram)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Frequency count of projects grouped by contract size brackets
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {filteredProjects.length} Projects
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectBracketsData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  width={30}
                  label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                />
                <Tooltip
                  formatter={(val, name, props) => {
                    if (name === 'count') {
                      return [
                        `${val} Projects (${formatINR(props.payload.totalValue)} Total)`,
                        'Deal Bracket',
                      ];
                    }
                    return [val, name];
                  }}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="count" fill="#334155" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Revenue vs Cost Split Donut / Pie Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-slate-800 dark:text-slate-200" />
                <span>Revenue Allocation (Profit vs Costs Split)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Proportion of Net Profit, Employee Cost & Expenses from Total Inflow
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold border border-slate-200 dark:border-slate-700">
              {profitMarginPercent.toFixed(1)}% Profit
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {pieDistributionData.length === 0 ? (
              <div className="text-slate-400 text-xs">No revenue data in range to compute allocation</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
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
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  />
                  <Pie
                    data={pieDistributionData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
