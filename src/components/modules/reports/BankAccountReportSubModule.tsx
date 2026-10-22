import React, { useState, useMemo } from 'react';
import { useCrm } from '../../../context/CrmContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import { exportToCsv } from '../../../utils/csvExport';
import { BrandName, Payment } from '../../../types/crm';
import {
  Landmark,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  CreditCard,
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
  Clock,
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
  MONOCHROME_CHART_PALETTE,
} from './ChartTheme';

type DatePreset = 'this-month' | 'last-3-months' | 'last-6-months' | 'this-fy' | 'all-time' | 'august-2026';

const BRAND_OPTIONS: (BrandName | 'All')[] = [
  'All',
  'Device Doctor India',
  'Codestro',
  'FX Launch Pad',
  'DUNS',
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

const CHART_COLORS = ['#000000', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db'];

export const BankAccountReportSubModule: React.FC = () => {
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

  // Selected Bank Account ID Filter ('ALL' or specific bankAccountId)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');

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
      // Compute last day of month
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

  // Filter bank accounts by the selected brand
  const availableBankAccounts = useMemo(() => {
    if (selectedBrand === 'All') {
      return bankAccounts;
    }
    return bankAccounts.filter((b) => b.brand === selectedBrand);
  }, [bankAccounts, selectedBrand]);

  // Selected Bank Account object (if single account selected)
  const currentSelectedAccount = useMemo(() => {
    if (selectedAccountId === 'ALL') return null;
    return bankAccounts.find((b) => b.id === selectedAccountId) || null;
  }, [bankAccounts, selectedAccountId]);

  // Core Filtering of payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // Brand filter
      if (selectedBrand !== 'All' && p.brand !== selectedBrand) {
        return false;
      }

      // Bank account filter
      if (selectedAccountId !== 'ALL') {
        if (selectedAccountId === 'UNTAGGED') {
          if (p.bankAccountId) return false;
        } else {
          if (p.bankAccountId !== selectedAccountId) return false;
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
  }, [payments, selectedBrand, selectedAccountId, statusFilter, fromDate, toDate, searchTerm]);

  // Aggregate Metrics
  const totalRevenueCreditedINR = useMemo(() => {
    return filteredPayments
      .filter((p) => p.paymentStatus === 'Received')
      .reduce((sum, p) => sum + (p.amountINR || p.amount || 0), 0);
  }, [filteredPayments]);

  const totalTransactionsCount = filteredPayments.length;
  const receivedCount = filteredPayments.filter((p) => p.paymentStatus === 'Received').length;
  const pendingCount = filteredPayments.filter((p) => p.paymentStatus === 'Pending').length;

  const averageSettlementINR = receivedCount > 0 ? Math.round(totalRevenueCreditedINR / receivedCount) : 0;

  // Breakdown by Bank Account for Chart & Statistics
  const accountBreakdownData = useMemo(() => {
    const map: Record<string, { name: string; bankName: string; totalINR: number; count: number; brand: string }> = {};

    filteredPayments.forEach((p) => {
      const accId = p.bankAccountId || 'UNTAGGED';
      const accObj = bankAccounts.find((b) => b.id === accId);
      const accName = accObj
        ? `${accObj.bankName} - ${accObj.accountNumber.slice(-4)}`
        : p.bankAccountName || (accId === 'UNTAGGED' ? 'Direct / Cash' : accId);

      if (!map[accId]) {
        map[accId] = {
          name: accName,
          bankName: accObj?.bankName || 'Direct',
          totalINR: 0,
          count: 0,
          brand: p.brand || 'Device Doctor India',
        };
      }

      if (p.paymentStatus === 'Received') {
        map[accId].totalINR += p.amountINR || p.amount || 0;
      }
      map[accId].count += 1;
    });

    return Object.values(map).sort((a, b) => b.totalINR - a.totalINR);
  }, [filteredPayments, bankAccounts]);

  // Monthly Revenue Inflow Trend
  const monthlyInflowTrend = useMemo(() => {
    const map: Record<string, { month: string; totalINR: number; count: number }> = {};

    filteredPayments
      .filter((p) => p.paymentStatus === 'Received')
      .forEach((p) => {
        const d = p.paymentDate || p.createdAt?.slice(0, 10) || '2026-08-01';
        const key = d.slice(0, 7); // YYYY-MM
        const monthLabel = new Date(key + '-01').toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        });

        if (!map[key]) {
          map[key] = { month: monthLabel, totalINR: 0, count: 0 };
        }
        map[key].totalINR += p.amountINR || p.amount || 0;
        map[key].count += 1;
      });

    return Object.keys(map)
      .sort()
      .map((k) => map[k]);
  }, [filteredPayments]);

  // Export to CSV
  const handleExportCsv = () => {
    const accountLabel = currentSelectedAccount
      ? `${currentSelectedAccount.bankName}_${currentSelectedAccount.accountNumber}`
      : selectedAccountId;
    const filename = `Bank_Account_Revenue_${selectedBrand}_${accountLabel}_${fromDate}_to_${toDate}.csv`;

    const columns = [
      { key: 'id', header: 'Payment ID' },
      { key: 'brand', header: 'Brand' },
      { key: 'paymentDate', header: 'Payment Date' },
      { key: 'clientName', header: 'Client Name' },
      { key: 'clientId', header: 'Client ID' },
      { key: 'projectId', header: 'Project ID' },
      { key: 'bankAccountId', header: 'Bank Account ID', format: (r: Payment) => r.bankAccountId || 'Direct / Cash' },
      { key: 'bankAccountName', header: 'Bank Account Name', format: (r: Payment) => r.bankAccountName || 'Direct / Cash' },
      { key: 'paymentMode', header: 'Payment Mode' },
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
    <div className="space-y-6 font-sans">
      {/* Module Sub-Header & Controls */}
      <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#e2e8f0] dark:border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-black dark:text-white">
                  Bank Account-Wise Revenue Reports
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-black text-white dark:bg-white dark:text-black">
                  Multi-Account Audit
                </span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                Audit and reconcile gross collections credited to specific corporate bank accounts and digital wallets across brands.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold bg-black hover:bg-neutral-800 text-white shadow-xs transition-colors cursor-pointer"
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
              <span>Print Audit</span>
            </button>
          </div>
        </div>

        {/* Filter Bar: Brand, Bank Account, Quick Month, Year & Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Brand Filter */}
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
              onChange={(e) => {
                setSelectedBrand(e.target.value as BrandName | 'All');
                setSelectedAccountId('ALL'); // Reset account selection when brand changes
              }}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {BRAND_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b === 'All' ? 'All Brands (Consolidated Group)' : b}
                </option>
              ))}
            </select>
          </div>

          {/* Bank Account Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Bank Account</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {availableBankAccounts.length} available
              </span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value="ALL">All Bank Accounts ({selectedBrand})</option>
              {availableBankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.bankName} — {acc.accountNumber} ({acc.accountName}) [{acc.brand}]
                </option>
              ))}
              <option value="UNTAGGED">Direct Cash / Untagged Collections</option>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
        <div className="p-4 rounded bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Total Revenue Credited</span>
            <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-black dark:text-white">
            {formatINR(totalRevenueCreditedINR)}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 truncate">
            {currentSelectedAccount
              ? `In ${currentSelectedAccount.bankName} (${currentSelectedAccount.accountNumber.slice(-4)})`
              : `Across ${accountBreakdownData.length} operating accounts`}
          </div>
        </div>

        <div className="p-4 rounded bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Settled Transactions</span>
            <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-black dark:text-white">
            {receivedCount} <span className="text-xs font-normal text-neutral-500">/ {totalTransactionsCount} total</span>
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
            {pendingCount > 0 ? `${pendingCount} invoices pending settlement` : '100% payments settled'}
          </div>
        </div>

        <div className="p-4 rounded bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Average Settlement</span>
            <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-black dark:text-white">
            {formatINR(averageSettlementINR)}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
            Per cleared client invoice transaction
          </div>
        </div>

        <div className="p-4 rounded bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-semibold">Selected Scope</span>
            <div className="p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-black dark:text-white truncate">
            {currentSelectedAccount ? currentSelectedAccount.bankName : (selectedAccountId === 'ALL' ? 'All Accounts' : 'Direct Cash')}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 truncate">
            {selectedBrand} · {selectedMonth !== 'all' ? `Month: ${selectedMonth}/${selectedYear}` : `${fromDate} to ${toDate}`}
          </div>
        </div>
      </div>

      {/* Visual Distribution Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        {/* Chart 1: Revenue Credited by Bank Account */}
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-black dark:text-white" />
                <span>Revenue Credited by Bank Account (INR)</span>
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                Comparison of settlement inflow volumes across registered banking channels
              </p>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700">
              {accountBreakdownData.length} Accounts Active
            </span>
          </div>

          <div className="h-64 w-full">
            {accountBreakdownData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-500">
                No payment transactions recorded for selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={accountBreakdownData} margin={{ top: 10, right: 10, left: 10, bottom: 35 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis
                    {...chartXAxisProps}
                    dataKey="name"
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    {...chartYAxisProps}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(val: any) => [formatINR(Number(val) || 0), 'Credited Revenue']}
                  />
                  <Bar dataKey="totalINR" fill="#000000" radius={[2, 2, 0, 0]}>
                    {accountBreakdownData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
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

        {/* Chart 2: Account Revenue Share Pie Chart */}
        <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded p-5 shadow-xs flex flex-col font-sans">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-black dark:text-white" />
              <span>Share of Total Inflow</span>
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Percentage distribution across banking channels
            </p>
          </div>

          <div className="flex-1 min-h-[220px]">
            {totalRevenueCreditedINR === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-500">
                No cleared revenue in period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={accountBreakdownData}
                    dataKey="totalINR"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    {...PIE_SLICE_BORDER}
                  >
                    {accountBreakdownData.map((_, index) => (
                      <Cell
                        key={`slice-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
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

          {/* Legend Items with High Contrast Helvetica */}
          <div className="space-y-1.5 mt-2 max-h-28 overflow-y-auto pr-1">
            {accountBreakdownData.map((item, index) => {
              const pct = totalRevenueCreditedINR > 0 ? ((item.totalINR / totalRevenueCreditedINR) * 100).toFixed(1) : '0';
              return (
                <div key={item.name} className="flex items-center justify-between text-xs font-sans">
                  <div className="flex items-center gap-2 truncate mr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0 border border-neutral-300 dark:border-neutral-700"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <span className="text-black dark:text-neutral-200 font-medium truncate">{item.name}</span>
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
      <div className="bg-white dark:bg-neutral-900 border border-[#e2e8f0] dark:border-neutral-800 rounded shadow-xs overflow-hidden font-sans">
        {/* Table Filter / Search Header */}
        <div className="p-4 border-b border-[#e2e8f0] dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-800/30">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-black dark:text-white" />
              <span>Bank Account Transaction Ledger</span>
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white border border-[#e2e8f0] dark:border-neutral-700">
              {filteredPayments.length} Records
            </span>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by UTR, Client, Project..."
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
                <th className="py-3 px-4">Client & Project</th>
                <th className="py-3 px-4">Credited Bank Account</th>
                <th className="py-3 px-4">Payment Mode & UTR</th>
                <th className="py-3 px-4 text-right">Received Amount</th>
                <th className="py-3 px-4 text-right">Amount (INR)</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Landmark className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No matching client payment transactions found.</p>
                    <p className="text-xs mt-1">
                      Try selecting another month (e.g. August), account, or expanding the date filter.
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
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                              {p.bankAccountName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">
                            Direct Cash / Untagged
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-300 dark:border-slate-700 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          {p.paymentMode}
                        </span>
                        {p.referenceUtr && (
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1 truncate max-w-[160px]">
                            Ref: {p.referenceUtr}
                          </div>
                        )}
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
                              <CheckCircle2 className="w-3 h-3 text-white" />
                              <span>Settled</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Pending</span>
                            </>
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
                  <td colSpan={6} className="py-3 px-4 text-right text-xs">
                    Total Cleared Revenue Credited:
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {formatINR(totalRevenueCreditedINR)}
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
