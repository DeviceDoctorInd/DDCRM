import React, { useState, useMemo, useEffect } from 'react';
import { useCrm } from '../../../context/CrmContext';
import { formatINR, formatDate } from '../../../utils/formatters';
import { exportToCsv } from '../../../utils/csvExport';
import {
  UserCheck,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  Briefcase,
  IndianRupee,
  Wallet,
  AlertCircle,
  Building,
  BarChart2,
  PieChart as PieChartIcon,
  Layers,
  Clock,
  CheckCircle2,
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

type DatePreset = 'this-month' | 'last-6-months' | 'this-year' | 'all-time' | 'custom';

const PALETTE = {
  assigned: '#3b82f6', // blue-500
  paid: '#10b981', // emerald-500
  pending: '#f59e0b', // amber-500
  epayments: '#8b5cf6', // purple-500
  cyan: '#06b6d4',
  pink: '#ec4899',
};

const DONUT_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#64748b'];

export const EmployeeReportSubModule: React.FC = () => {
  const { employees, roles, assignments, employeePayments, projects, activeBrand, brandPrefix, isConsolidatedView } = useCrm();

  const reportTitle = isConsolidatedView
    ? 'CONSOLIDATED GROUP — EMPLOYEE DASHBOARD'
    : `${activeBrand.toUpperCase()} — EMPLOYEE DASHBOARD`;

  // Find default employee: Prefer "SAUMYA KHADELWAL" / "SAUMYA KHANDELWAL" or first active employee
  const defaultEmployeeId = useMemo(() => {
    if (!employees || employees.length === 0) return 'ALL';
    const saumya = employees.find((e) => e.name.toUpperCase().includes('SAUMYA'));
    if (saumya) return saumya.id;
    return employees[0].id;
  }, [employees]);

  // Selected Employee State (defaults to Saumya if available)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL');

  useEffect(() => {
    if (defaultEmployeeId && defaultEmployeeId !== 'ALL' && selectedEmployeeId === 'ALL') {
      setSelectedEmployeeId(defaultEmployeeId);
    }
  }, [defaultEmployeeId]);

  // Date Range state — Default: 01-Sep-2024 to 27-Sep-2026 / 31-Oct-2026 as per prompt
  const [fromDate, setFromDate] = useState('2024-09-01');
  const [toDate, setToDate] = useState('2026-10-31');
  const [activePreset, setActivePreset] = useState<DatePreset>('all-time');

  // Date Preset Handler
  const handlePresetSelect = (preset: 'this-month' | 'last-6-months' | 'this-year' | 'all-time') => {
    setActivePreset(preset);
    switch (preset) {
      case 'this-month':
        setFromDate('2026-10-01');
        setToDate('2026-10-31');
        break;
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

  // Selected Employee Entity
  const selectedEmployee = useMemo(() => {
    if (selectedEmployeeId === 'ALL') return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const employeeRole = useMemo(() => {
    if (!selectedEmployee) return null;
    return roles.find((r) => r.id === selectedEmployee.roleId) || null;
  }, [selectedEmployee, roles]);

  const employeeDisplayName = selectedEmployee
    ? `${selectedEmployee.name} (${selectedEmployee.id})`
    : 'All Employees (Consolidated)';

  // --- Dynamic Calculations for Selected Employee within [fromDate, toDate] ---

  // 1. Filtered Assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const matchesEmp = selectedEmployeeId === 'ALL' || a.employeeId === selectedEmployeeId;
      if (!matchesEmp) return false;

      const aDate = a.assignedDate || a.createdAt?.slice(0, 10) || '';
      if (!aDate) return true;
      return aDate >= fromDate && aDate <= toDate;
    });
  }, [assignments, selectedEmployeeId, fromDate, toDate]);

  // 2. Filtered Employee Payments
  const filteredEmployeePayments = useMemo(() => {
    return employeePayments.filter((ep) => {
      const matchesEmp = selectedEmployeeId === 'ALL' || ep.employeeId === selectedEmployeeId;
      if (!matchesEmp) return false;

      const epDate = ep.paymentDate || ep.createdAt?.slice(0, 10) || '';
      return epDate >= fromDate && epDate <= toDate;
    });
  }, [employeePayments, selectedEmployeeId, fromDate, toDate]);

  // 3. Exact 5 Metrics from Prompt Specification:
  // - Assignments: Total count of assignments allocated
  const totalAssignmentsCount = filteredAssignments.length;

  // - Assigned Amount: Sum of Amount (INR) from Assignments module
  const totalAssignedAmountINR = useMemo(() => {
    return filteredAssignments.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  }, [filteredAssignments]);

  // - Paid Amount: Sum of Amount Paid (INR) recorded on those Assignments
  const totalPaidAmountINR = useMemo(() => {
    return filteredAssignments.reduce((sum, a) => sum + Number(a.amountPaid || 0), 0);
  }, [filteredAssignments]);

  // - Pending Assignment Amount: Auto-calculated as Assigned Amount - Paid Amount
  const pendingAssignmentAmountINR = Math.max(0, totalAssignedAmountINR - totalPaidAmountINR);

  // - Employee Payments: Sum of Amount Paid (INR) from the Employee Payments ledger module
  const totalEmployeePaymentsINR = useMemo(() => {
    return filteredEmployeePayments.reduce((sum, ep) => sum + Number(ep.amountPaid || 0), 0);
  }, [filteredEmployeePayments]);

  const payoutRatePercent = totalAssignedAmountINR > 0 ? (totalPaidAmountINR / totalAssignedAmountINR) * 100 : 0;

  // --- Graph 1 Data: Employee Payout Summary Bar Graph ---
  const payoutSummaryBarData = useMemo(() => {
    return [
      { name: 'Assigned Amount', amount: totalAssignedAmountINR, fill: PALETTE.assigned },
      { name: 'Paid Amount', amount: totalPaidAmountINR, fill: PALETTE.paid },
      { name: 'Pending Balance', amount: pendingAssignmentAmountINR, fill: PALETTE.pending },
      { name: 'Employee Payments', amount: totalEmployeePaymentsINR, fill: PALETTE.epayments },
    ];
  }, [totalAssignedAmountINR, totalPaidAmountINR, pendingAssignmentAmountINR, totalEmployeePaymentsINR]);

  // --- Graph 2 Data: Assignment-Wise & Client-Wise Breakdown Grouped Bar Chart ---
  const assignmentBreakdownData = useMemo(() => {
    return filteredAssignments.map((a) => {
      const assigned = Number(a.amount || 0);
      const paid = Number(a.amountPaid || 0);
      const pending = Math.max(0, assigned - paid);

      const clientLabel = a.clientName ? a.clientName.split(' ')[0] : 'Client';
      const shortWork = a.workAssigned ? a.workAssigned.slice(0, 16) : a.id;
      const label = `${clientLabel}: ${shortWork}`;

      return {
        id: a.id,
        label: label.length > 20 ? `${label.slice(0, 18)}…` : label,
        assigned,
        paid,
        pending,
        clientName: a.clientName || 'General',
        workAssigned: a.workAssigned,
      };
    });
  }, [filteredAssignments]);

  // --- Graph 3 Data: Monthly Employee Earnings / Payout Histogram ---
  const monthlyEarningsData = useMemo(() => {
    const monthMap = new Map<string, { month: string; monthLabel: string; earnings: number; vouchersCount: number }>();

    filteredEmployeePayments.forEach((ep) => {
      const epDate = ep.paymentDate || ep.createdAt?.slice(0, 10) || '';
      const key = epDate.slice(0, 7);
      if (!key) return;

      if (!monthMap.has(key)) {
        const [year, month] = key.split('-');
        const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

        monthMap.set(key, {
          month: key,
          monthLabel: label,
          earnings: 0,
          vouchersCount: 0,
        });
      }

      const item = monthMap.get(key)!;
      item.earnings += Number(ep.amountPaid || 0);
      item.vouchersCount += 1;
    });

    return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredEmployeePayments]);

  // --- Graph 4 Data: Client / Project Workload Share Donut Chart ---
  const workloadShareData = useMemo(() => {
    const clientMap = new Map<string, number>();

    filteredAssignments.forEach((a) => {
      const client = a.clientName || 'Direct Agency';
      const amt = Number(a.amount || 0);
      clientMap.set(client, (clientMap.get(client) || 0) + amt);
    });

    return Array.from(clientMap.entries()).map(([name, value], idx) => ({
      name,
      value,
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
    }));
  }, [filteredAssignments]);

  // --- CSV Export Handler ---
  const handleExportCsv = () => {
    const summaryRows = [
      { metric: 'Report Module', value: reportTitle, notes: `Employee: ${employeeDisplayName}` },
      { metric: 'Date Window', value: `From ${fromDate} to ${toDate}`, notes: `Preset: ${activePreset}` },
      { metric: 'Assignments', value: totalAssignmentsCount, notes: 'Total count of assignments allocated within period' },
      { metric: 'Assigned Amount', value: totalAssignedAmountINR, notes: 'Sum of Amount from Assignments module' },
      { metric: 'Paid Amount', value: totalPaidAmountINR, notes: 'Sum of Amount Paid recorded on Assignments' },
      { metric: 'Pending Assignment Amount', value: pendingAssignmentAmountINR, notes: 'Assigned Amount - Paid Amount' },
      { metric: 'Employee Payments', value: totalEmployeePaymentsINR, notes: 'Sum of Amount Paid from Employee Payments module' },
      { metric: 'Disbursement Clearance Rate', value: `${payoutRatePercent.toFixed(1)}%`, notes: '(Paid Amount / Assigned Amount) * 100' },
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
        { key: 'notes', header: 'Accounting Specification & Formula' },
      ],
      `${brandPrefix}_Employee_Dashboard_${selectedEmployee ? selectedEmployee.id : 'ALL'}_${fromDate}_to_${toDate}`
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Filter Controls (Employee Dropdown + Date Range) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Employee Selector & Date Range */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Employee Dropdown */}
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <label htmlFor="employee-select" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Employee:
              </label>
              <select
                id="employee-select"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 max-w-[280px] truncate cursor-pointer"
              >
                <option value="ALL">All Employees (Consolidated)</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.id})
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
                  { id: 'this-month', label: 'This Month' },
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
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
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
              title="Export Employee Dashboard to CSV"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-xs"
              title="Print Employee Report"
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
              Target Employee: <strong className="text-indigo-700 dark:text-indigo-400 font-semibold">{employeeDisplayName}</strong>
            </span>
            {employeeRole && (
              <>
                <span>·</span>
                <span>Role: <strong>{employeeRole.roleName}</strong> ({employeeRole.department})</span>
              </>
            )}
            {selectedEmployee?.employeeType && (
              <>
                <span>·</span>
                <span>Type: {selectedEmployee.employeeType}</span>
              </>
            )}
          </div>
          <div>
            Period: <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{formatDate(fromDate)}</span> to <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{formatDate(toDate)}</span>
          </div>
        </div>
      </div>

      {/* 2. Top Summary Metric KPI Cards (Exact 5 metrics matching specification) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Metric 1: Assignments */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Assignments</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {totalAssignmentsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Work modules allocated
          </div>
        </div>

        {/* Metric 2: Assigned Amount */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Assigned Amount</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {formatINR(totalAssignedAmountINR)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            From Assignments module
          </div>
        </div>

        {/* Metric 3: Paid Amount */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Paid Amount</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatINR(totalPaidAmountINR)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {payoutRatePercent.toFixed(0)}% cleared on tasks
          </div>
        </div>

        {/* Metric 4: Pending Assignment Amount */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Pending Amount</span>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatINR(pendingAssignmentAmountINR)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Assigned minus Paid
          </div>
        </div>

        {/* Metric 5: Employee Payments */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Employee Payments</span>
            <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
            {formatINR(totalEmployeePaymentsINR)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {filteredEmployeePayments.length} payment slips cleared
          </div>
        </div>
      </div>

      {/* 2. Structured "DEVICE DOCTOR — EMPLOYEE DASHBOARD" Executive Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{reportTitle}</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                AUDITED PAYROLL LEDGER
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exact assignment value allocation, task payouts, pending balances, and disbursement slips for {employeeDisplayName}
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
                <th className="py-3 px-4 font-bold text-right">% of Allocation / Share</th>
                <th className="py-3 px-4 font-bold">Accounting Formula & Module Scope</th>
                <th className="py-3 px-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {/* Row 1: Assignments */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Assignments</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-slate-900 dark:text-slate-100 text-sm">
                  {totalAssignmentsCount}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalAssignmentsCount > 0 ? `${(totalAssignedAmountINR / (totalAssignmentsCount || 1) / 1000).toFixed(0)}k avg/task` : '—'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Total count of task modules assigned to {employeeDisplayName} in Assignments module
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded">
                    Active Tasks
                  </span>
                </td>
              </tr>

              {/* Row 2: Assigned Amount */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-indigo-50/20 dark:bg-indigo-950/10">
                <td className="py-3.5 px-4 font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>Assigned Amount</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-indigo-700 dark:text-indigo-300 text-base">
                  {formatINR(totalAssignedAmountINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-indigo-700 dark:text-indigo-400">
                  100.0%
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount (INR)</code> allocated in Assignments module
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 rounded">
                    Total Contracted
                  </span>
                </td>
              </tr>

              {/* Row 3: Paid Amount */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Paid Amount</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-emerald-600 dark:text-emerald-400 text-sm">
                  {formatINR(totalPaidAmountINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {payoutRatePercent.toFixed(1)}%
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount Paid (INR)</code> recorded on Assignments
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">
                    Task Cleared
                  </span>
                </td>
              </tr>

              {/* Row 4: Pending Assignment Amount */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Pending Assignment Amount</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-right text-amber-600 dark:text-amber-400 text-sm">
                  {formatINR(pendingAssignmentAmountINR)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                  {totalAssignedAmountINR > 0 ? `${((pendingAssignmentAmountINR / totalAssignedAmountINR) * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                  Auto-calculated formula: <strong className="font-mono">Assigned Amount - Paid Amount</strong>
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                      pendingAssignmentAmountINR === 0
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50'
                        : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50'
                    }`}
                  >
                    {pendingAssignmentAmountINR === 0 ? 'Fully Settled' : 'Payable'}
                  </span>
                </td>
              </tr>

              {/* Row 5: Employee Payments */}
              <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors bg-purple-50/20 dark:bg-purple-950/10 font-bold">
                <td className="py-4 px-4 text-sm text-purple-900 dark:text-purple-300 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <div>
                    <span>Employee Payments</span>
                    <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                      Disbursement slips cleared through bank transfer, UPI, or cash
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4 font-mono text-right text-lg text-purple-700 dark:text-purple-300">
                  {formatINR(totalEmployeePaymentsINR)}
                </td>
                <td className="py-4 px-4 text-right font-mono text-sm text-purple-700 dark:text-purple-300">
                  {totalAssignedAmountINR > 0 ? `${((totalEmployeePaymentsINR / totalAssignedAmountINR) * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="py-4 px-4 text-xs font-normal text-slate-600 dark:text-slate-400">
                  Sum of <code className="font-mono text-[11px]">Amount Paid (INR)</code> from Employee Payments ledger
                </td>
                <td className="py-4 px-4 text-center">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/80 dark:text-purple-200">
                    Disbursed Ledger
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Interactive Graphs & Visual Analytics Grid (Powered by Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Employee Payout Summary Bar Graph */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Employee Payout Summary (Bar Chart)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comparison of Assigned, Paid, Pending & Disbursed Payments for {employeeDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded font-semibold">
              Payout Audit
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payoutSummaryBarData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} interval={0} />
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
                  itemStyle={{ color: '#a78bfa' }}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {payoutSummaryBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 2: Assignment-Wise & Client-Wise Breakdown Grouped Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Assignment-Wise & Client-Wise Breakdown</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Assigned vs Paid vs Pending for each task assigned to {employeeDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {filteredAssignments.length} Assignments
            </span>
          </div>

          <div className="h-64 w-full">
            {assignmentBreakdownData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Briefcase className="w-6 h-6 mb-1 text-slate-300" />
                <span>No assignments recorded in this date range</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assignmentBreakdownData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      formatINR(Number(val || 0)),
                      name === 'assigned'
                        ? 'Assigned'
                        : name === 'paid'
                        ? 'Paid'
                        : 'Pending Balance',
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
                      val === 'assigned' ? 'Assigned' : val === 'paid' ? 'Paid' : 'Pending'
                    }
                  />
                  <Bar dataKey="assigned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 3: Monthly Employee Earnings / Payout Histogram */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Monthly Earnings & Disbursement Timeline</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Month-by-month payout clearance history for {employeeDisplayName}
              </p>
            </div>
            <span className="text-[11px] font-mono text-purple-600 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded font-semibold">
              {formatINR(totalEmployeePaymentsINR)} Cleared
            </span>
          </div>

          <div className="h-64 w-full">
            {monthlyEarningsData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <Calendar className="w-6 h-6 mb-1 text-slate-300" />
                <span>No payout records found in this date window</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyEarningsData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(val) => [formatINR(Number(val || 0)), 'Monthly Payout']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Bar dataKey="earnings" name="earnings" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="earnings" stroke="#6d28d9" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Graph 4: Client / Project Workload Share Donut Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Client & Project Workload Share</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Distribution of assigned work value across client accounts
              </p>
            </div>
            <span className="text-[11px] font-mono text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded font-semibold">
              {workloadShareData.length} Accounts
            </span>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {workloadShareData.length === 0 ? (
              <div className="text-slate-400 text-xs">No client assignment data in this date range</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(val) => [formatINR(Number(val || 0)), 'Work Allocated']}
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
                    data={workloadShareData}
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {workloadShareData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 4. Employee Assignments & Payouts Drill-Down Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Employee Assignment & Payment Ledger</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Task allocations, client accounts, milestone compensation, and payment status for {employeeDisplayName}
            </p>
          </div>
          <div className="text-xs font-mono font-medium text-slate-500">
            Total {filteredAssignments.length} Assignments Allocated
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Assignment ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Client Name</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Project ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Work / Module Assigned</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Assigned Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-indigo-700 dark:text-indigo-400">Assigned Amount</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-emerald-700 dark:text-emerald-400">Paid Amount</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-right text-amber-700 dark:text-amber-400">Pending Amount</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No assignments found for {employeeDisplayName} in this date window.</p>
                    <p className="text-xs mt-1">Select "All Time" or pick another employee from the dropdown above.</p>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((a) => {
                  const assigned = Number(a.amount || 0);
                  const paid = Number(a.amountPaid || 0);
                  const pending = Math.max(0, assigned - paid);

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3.5 font-mono font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {a.id}
                      </td>
                      <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {a.clientName || 'General'}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-500 max-w-[180px] truncate" title={a.projectId}>
                        {a.projectId}
                      </td>
                      <td className="py-3 px-3.5 font-medium text-slate-800 dark:text-slate-200 max-w-[220px] truncate" title={a.workAssigned}>
                        {a.workAssigned || 'Development & Delivery'}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                        {formatDate(a.assignedDate)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-bold text-right text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                        {formatINR(assigned)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-bold text-right text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {formatINR(paid)}
                      </td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        {formatINR(pending)}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            a.paymentStatus === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : a.paymentStatus === 'Partially Paid'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : a.paymentStatus === 'On Hold'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {a.paymentStatus}
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
