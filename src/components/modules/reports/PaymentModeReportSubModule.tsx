import React, { useState, useMemo } from 'react';
import { useCrm } from '../../../context/CrmContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import { exportToCsv } from '../../../utils/csvExport';
import { BrandName, PaymentMode, Payment } from '../../../types/crm';
import {
  CreditCard,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  Wallet,
  Building2,
  CheckCircle2,
  Search,
  Filter,
  BarChart2,
  PieChart as PieChartIcon,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  FileSpreadsheet,
  Coins,
  Receipt,
  Landmark,
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

type DatePreset = 'this-month' | 'last-3-months' | 'last-6-months' | 'this-fy' | 'all-time' | 'august-2026';

const BRAND_OPTIONS: (BrandName | 'All')[] = [
  'All',
  'Device Doctor India',
  'Codestro',
  'FX Launch Pad',
  'DUNS',
];

// All payment modes including granular methods
const ALL_PAYMENT_MODES = [
  { label: 'All Payment Modes', value: 'ALL' },
  { label: 'GST Invoice', value: 'GST Invoice' },
  { label: 'Non GST Online', value: 'Non GST Online' },
  { label: 'Cash', value: 'Cash' },
  { label: 'Crypto', value: 'Crypto' },
  { label: 'Bank Transfer / NEFT', value: 'Bank Transfer' },
  { label: 'UPI / Immediate', value: 'UPI' },
];

const MONTH_NAMES = [
  { label: 'All Months', value: 'all' },
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const MODE_COLORS: Record<string, string> = {
  'GST Invoice': '#000000',
  'Non GST Online': '#1f2937',
  Cash: '#374151',
  Crypto: '#4b5563',
  'Bank Transfer': '#6b7280',
  UPI: '#9ca3af',
  Other: '#d1d5db',
};

export const PaymentModeReportSubModule: React.FC = () => {
  const {
    payments,
    bankAccounts,
    activeBrand,
    brandPrefix,
    isConsolidatedView,
    setIsConsolidatedView,
  } = useCrm();

  // Selected Brand Filter (Defaults to activeBrand or 'All' if in consolidated mode)
  const [selectedBrand, setSelectedBrand] = useState<BrandName | 'All'>(
    isConsolidatedView ? 'All' : activeBrand
  );

  // Selected Payment Mode Filter
  const [selectedMode, setSelectedMode] = useState<string>('ALL');

  // Month & Year Filter
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('2026');

  // Date Range state
  const [fromDate, setFromDate] = useState('2026-01-01');
  const [toDate, setToDate] = useState('2026-12-31');
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('all-time');

  // Payment Status filter
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Received' | 'Pending'>('Received');

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Handle Preset Clicks
  const handlePresetSelect = (preset: DatePreset) => {
    setActivePreset(preset);
    setSelectedMonth('all');

    switch (preset) {
      case 'august-2026':
        setFromDate('2026-08-01');
        setToDate('2026-08-31');
        setSelectedMonth('08');
        setSelectedYear('2026');
        break;
      case 'this-month':
        setFromDate('2026-10-01');
        setToDate('2026-10-31');
        setSelectedMonth('10');
        setSelectedYear('2026');
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
        setFromDate('2026-04-01');
        setToDate('2027-03-31');
        break;
      case 'all-time':
        setFromDate('2025-01-01');
        setToDate('2027-12-31');
        break;
    }
  };

  // Handle Quick Month Filter
  const handleMonthSelect = (monthVal: string) => {
    setSelectedMonth(monthVal);
    if (monthVal === 'all') {
      setFromDate(`${selectedYear}-01-01`);
      setToDate(`${selectedYear}-12-31`);
      setActivePreset('all-time');
    } else {
      const year = selectedYear || '2026';
      const lastDay = new Date(parseInt(year), parseInt(monthVal), 0).getDate();
      setFromDate(`${year}-${monthVal}-01`);
      setToDate(`${year}-${monthVal}-${lastDay}`);
      setActivePreset('custom');
    }
  };

  // Handle Year Change
  const handleYearSelect = (yearVal: string) => {
    setSelectedYear(yearVal);
    if (selectedMonth !== 'all') {
      const lastDay = new Date(parseInt(yearVal), parseInt(selectedMonth), 0).getDate();
      setFromDate(`${yearVal}-${selectedMonth}-01`);
      setToDate(`${yearVal}-${selectedMonth}-${lastDay}`);
    } else {
      setFromDate(`${yearVal}-01-01`);
      setToDate(`${yearVal}-12-31`);
    }
  };

  // Core Filtering of payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // Brand filter
      if (selectedBrand !== 'All' && p.brand !== selectedBrand) {
        return false;
      }

      // Payment mode filter
      if (selectedMode !== 'ALL') {
        if (selectedMode === 'Bank Transfer') {
          // Matches if paymentMode is Bank Transfer, or if reference indicates NEFT/RTGS/IMPS/Wire
          const isTransfer =
            (p.paymentMode as string) === 'Bank Transfer' ||
            p.paymentMode === 'Non GST Online' ||
            p.referenceUtr?.toLowerCase().includes('neft') ||
            p.referenceUtr?.toLowerCase().includes('wire') ||
            p.referenceUtr?.toLowerCase().includes('imps');
          if (!isTransfer) return false;
        } else if (selectedMode === 'UPI') {
          const isUpi =
            (p.paymentMode as string) === 'UPI' ||
            p.referenceUtr?.toLowerCase().includes('upi') ||
            p.bankAccountName?.toLowerCase().includes('upi') ||
            p.bankAccountName?.toLowerCase().includes('razorpay');
          if (!isUpi) return false;
        } else {
          if (p.paymentMode !== selectedMode) return false;
        }
      }

      // Status filter
      if (statusFilter !== 'ALL' && p.paymentStatus !== statusFilter) {
        return false;
      }

      // Date range filter
      const payDate = p.paymentDate || p.createdAt?.slice(0, 10);
      if (payDate) {
        if (payDate < fromDate || payDate > toDate) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          p.id.toLowerCase().includes(q) ||
          p.clientName?.toLowerCase().includes(q) ||
          p.projectId.toLowerCase().includes(q) ||
          p.referenceUtr?.toLowerCase().includes(q) ||
          p.bankAccountName?.toLowerCase().includes(q) ||
          p.paymentMode?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [payments, selectedBrand, selectedMode, statusFilter, fromDate, toDate, searchTerm]);

  // Overall Brand Collections in this period (to compute % share of selected mode)
  const totalBrandPeriodRevenueINR = useMemo(() => {
    return payments
      .filter((p) => {
        if (selectedBrand !== 'All' && p.brand !== selectedBrand) return false;
        if (p.paymentStatus !== 'Received') return false;
        const payDate = p.paymentDate || p.createdAt?.slice(0, 10);
        if (payDate && (payDate < fromDate || payDate > toDate)) return false;
        return true;
      })
      .reduce((sum, p) => sum + (p.amountINR || p.amount || 0), 0);
  }, [payments, selectedBrand, fromDate, toDate]);

  // Aggregate Metrics for Filtered Set
  const totalModeRevenueINR = useMemo(() => {
    return filteredPayments
      .filter((p) => p.paymentStatus === 'Received')
      .reduce((sum, p) => sum + (p.amountINR || p.amount || 0), 0);
  }, [filteredPayments]);

  const totalTransactionsCount = filteredPayments.length;
  const receivedCount = filteredPayments.filter((p) => p.paymentStatus === 'Received').length;
  const pendingCount = filteredPayments.filter((p) => p.paymentStatus === 'Pending').length;

  const modeSharePercent =
    totalBrandPeriodRevenueINR > 0
      ? ((totalModeRevenueINR / totalBrandPeriodRevenueINR) * 100).toFixed(1)
      : '0';

  const averageTransactionINR = receivedCount > 0 ? Math.round(totalModeRevenueINR / receivedCount) : 0;

  // Breakdown by Payment Mode for Chart & Stats
  const modeBreakdownData = useMemo(() => {
    const map: Record<string, { mode: string; totalINR: number; count: number }> = {};

    filteredPayments.forEach((p) => {
      const mode = p.paymentMode || 'Non GST Online';
      if (!map[mode]) {
        map[mode] = { mode, totalINR: 0, count: 0 };
      }
      if (p.paymentStatus === 'Received') {
        map[mode].totalINR += p.amountINR || p.amount || 0;
      }
      map[mode].count += 1;
    });

    return Object.values(map).sort((a, b) => b.totalINR - a.totalINR);
  }, [filteredPayments]);

  // Export to CSV
  const handleExportCsv = () => {
    const filename = `Payment_Mode_Revenue_${selectedBrand}_${selectedMode}_${fromDate}_to_${toDate}.csv`;

    const columns = [
      { key: 'id', header: 'Payment ID' },
      { key: 'brand', header: 'Brand' },
      { key: 'paymentDate', header: 'Payment Date' },
      { key: 'paymentMode', header: 'Payment Mode' },
      { key: 'clientName', header: 'Client Name' },
      { key: 'clientId', header: 'Client ID' },
      { key: 'projectId', header: 'Project ID' },
      { key: 'bankAccountName', header: 'Receiving Bank / Wallet', format: (r: Payment) => r.bankAccountName || 'Direct / Cash' },
      { key: 'referenceUtr', header: 'Reference / UTR' },
      { key: 'currency', header: 'Currency' },
      { key: 'amountReceived', header: 'Amount Received' },
      { key: 'exchangeRate', header: 'Exchange Rate' },
      { key: 'amountINR', header: 'Amount (INR)' },
      { key: 'paymentStatus', header: 'Payment Status' },
      { key: 'notes', header: 'Notes' },
    ];

    exportToCsv(filteredPayments, columns, filename);
  };

  return (
    <div className="space-y-6">
      {/* Module Sub-Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Payment Mode-Wise Revenue Reports
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-black text-white dark:bg-white dark:text-black">
                  Method Audit
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track revenue, volumes, and audit settlement trails across Cash, Crypto, GST Invoice, UPI, and Online Banking modes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-black hover:bg-neutral-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* Filter Bar: Brand, Payment Mode, Quick Month, Year & Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Brand Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Brand Selection</span>
              </span>
              {selectedBrand === 'All' && (
                <span className="text-[10px] text-slate-700 font-normal">Consolidated</span>
              )}
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value as BrandName | 'All')}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {BRAND_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b === 'All' ? 'All Brands (Consolidated Group)' : b}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Mode Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Payment Mode</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                Cash, Crypto, UPI etc.
              </span>
            </label>
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-semibold text-slate-900 dark:text-white"
            >
              {ALL_PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Month Quick Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              <span>Specific Month / Range</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthSelect(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {MONTH_NAMES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => handleYearSelect(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
              >
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
          </div>

          {/* Payment Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Payment Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="Received">Settled Receipts Only (Cleared)</option>
              <option value="Pending">Pending / Invoiced</option>
              <option value="ALL">All Payments (Settled & Pending)</option>
            </select>
          </div>
        </div>

        {/* Quick Presets & Custom Date Pickers */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-semibold mr-1">Quick Presets:</span>
            <button
              type="button"
              onClick={() => handlePresetSelect('august-2026')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                activePreset === 'august-2026'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              August 2026
            </button>
            <button
              type="button"
              onClick={() => handlePresetSelect('this-month')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                activePreset === 'this-month'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Current Month
            </button>
            <button
              type="button"
              onClick={() => handlePresetSelect('last-3-months')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                activePreset === 'last-3-months'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Last 3 Months
            </button>
            <button
              type="button"
              onClick={() => handlePresetSelect('this-fy')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                activePreset === 'this-fy'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              FY 2026-27
            </button>
            <button
              type="button"
              onClick={() => handlePresetSelect('all-time')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                activePreset === 'all-time'
                  ? 'bg-black text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Time
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-slate-400">Date Range:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset('custom');
              }}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset('custom');
              }}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Revenue ({selectedMode})</span>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatINR(totalModeRevenueINR)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Settled via {selectedMode === 'ALL' ? 'all modes' : selectedMode}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Share of Brand Revenue</span>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <PieChartIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {modeSharePercent}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Of total {formatINR(totalBrandPeriodRevenueINR)} collections
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Transaction Volume</span>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {receivedCount} <span className="text-xs font-normal text-slate-400">/ {totalTransactionsCount} total</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Avg: {formatINR(averageTransactionINR)} / transaction
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold">Active Filter Scope</span>
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {selectedMode === 'ALL' ? 'All Payment Modes' : selectedMode}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {selectedBrand} · {selectedMonth !== 'all' ? `Month: ${selectedMonth}/${selectedYear}` : `${fromDate} to ${toDate}`}
          </div>
        </div>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        {/* Chart 1: Revenue by Payment Mode */}
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-black dark:text-white" />
                <span>Revenue by Payment Mode (INR)</span>
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Gross collections comparison across client settlement methods
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            {modeBreakdownData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-500 font-sans">
                No payment transactions recorded for selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modeBreakdownData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="mode" {...chartXAxisProps} />
                  <YAxis
                    {...chartYAxisProps}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(val: any) => [formatINR(Number(val) || 0), 'Revenue']}
                  />
                  <Bar dataKey="totalINR" radius={[2, 2, 0, 0]}>
                    {modeBreakdownData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={MODE_COLORS[entry.mode] || '#000000'}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Mode Share Donut */}
        <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs flex flex-col">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-black dark:text-white" />
              <span>Settlement Method Share</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Portfolio distribution by payment instrument
            </p>
          </div>

          <div className="flex-1 min-h-[220px]">
            {totalModeRevenueINR === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-500 font-sans">
                No cleared revenue in period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modeBreakdownData}
                    dataKey="totalINR"
                    nameKey="mode"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    {...PIE_SLICE_BORDER}
                  >
                    {modeBreakdownData.map((entry) => (
                      <Cell
                        key={entry.mode}
                        fill={MODE_COLORS[entry.mode] || '#000000'}
                        {...PIE_SLICE_BORDER}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(val: any) => [formatINR(Number(val) || 0), 'Share']}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend Items */}
          <div className="space-y-1.5 mt-2 max-h-28 overflow-y-auto pr-1">
            {modeBreakdownData.map((item) => {
              const pct = totalModeRevenueINR > 0 ? ((item.totalINR / totalModeRevenueINR) * 100).toFixed(1) : '0';
              return (
                <div key={item.mode} className="flex items-center justify-between text-xs" style={{ fontFamily: HELVETICA_FONT }}>
                  <div className="flex items-center gap-2 truncate mr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-neutral-300"
                      style={{ backgroundColor: MODE_COLORS[item.mode] || '#000000' }}
                    />
                    <span className="text-neutral-900 dark:text-neutral-100 font-medium truncate">{item.mode}</span>
                  </div>
                  <span className="font-mono font-bold text-black dark:text-white shrink-0">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transaction Register Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Filter / Search Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <span>Payment Mode Transaction Register</span>
            </h3>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {filteredPayments.length} Records
            </span>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by UTR, Client, Mode..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">Client & Project</th>
                <th className="py-3 px-4">Receiving Account / Wallet</th>
                <th className="py-3 px-4">Reference / UTR</th>
                <th className="py-3 px-4 text-right">Received Amount</th>
                <th className="py-3 px-4 text-right">Amount (INR)</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No transactions found for the selected payment mode and period.</p>
                    <p className="text-xs mt-1">
                      Try selecting another month (e.g. August for Cash/Crypto) or expanding the mode filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const isReceived = p.paymentStatus === 'Received';
                  const accountObj = bankAccounts.find((b) => b.id === p.bankAccountId);

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {p.id}
                        {p.brand && selectedBrand === 'All' && (
                          <div className="text-[10px] text-slate-400 font-sans mt-0.5 font-normal">
                            {p.brand}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                        {formatDate(p.paymentDate || p.createdAt?.slice(0, 10))}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {p.paymentMode}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-[240px]">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {p.clientName || '—'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5" title={p.projectId}>
                          {p.projectId}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {accountObj ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                              <Landmark className="w-3 h-3 text-slate-700 dark:text-slate-300 shrink-0" />
                              <span>{accountObj.bankName}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 mt-0.5">
                              {accountObj.accountNumber} ({accountObj.accountType})
                            </span>
                          </div>
                        ) : p.bankAccountName ? (
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px] block">
                            {p.bankAccountName}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">
                            Direct Cash Handover
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300 select-all">
                        {p.referenceUtr || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-800 dark:text-slate-200">
                        {p.currency} {Number(p.amountReceived || p.amount || 0).toLocaleString()}
                        {p.currency !== 'INR' && p.exchangeRate && (
                          <div className="text-[10px] text-slate-400">@ ₹{p.exchangeRate}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(p.amountINR || p.amount || 0)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isReceived
                              ? 'bg-black text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {isReceived ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-slate-700" />
                              <span>Settled</span>
                            </>
                          ) : (
                            <span>{p.paymentStatus}</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredPayments.length > 0 && (
              <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 font-semibold text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={7} className="py-3 px-4 text-right text-xs">
                    Total Cleared Revenue in Selected Mode:
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {formatINR(totalModeRevenueINR)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
