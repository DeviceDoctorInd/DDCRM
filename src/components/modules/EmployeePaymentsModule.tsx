import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { EmployeePayment, EmployeePaymentMode } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate } from '../../utils/formatters';
import {
  Wallet,
  CheckCircle,
  CreditCard,
  Calendar,
  AlertCircle,
  Edit2,
  Trash2,
  X,
  FileText,
  User,
  Briefcase,
  Layers,
  ArrowUpRight,
  Hash,
  Clock,
  Sparkles,
} from 'lucide-react';

const PAYMENT_MODES: EmployeePaymentMode[] = [
  'GST Invoice',
  'Non GST Online',
  'Cash',
  'Crypto',
];

export const EmployeePaymentsModule: React.FC = () => {
  const {
    employeePayments,
    assignments,
    projects,
    employees,
    saveEmployeePayment,
    deleteEmployeePayment,
    getAssignmentById,
    getProjectById,
    getEmployeeById,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<EmployeePayment>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteCandidate, setDeleteCandidate] = useState<EmployeePayment | null>(null);

  // Top Summary KPIs
  // 1. Total Payouts Made in INR
  const totalPayoutsMade = useMemo(() => {
    return employeePayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
  }, [employeePayments]);

  // 2. Total Transactions
  const totalTransactions = employeePayments.length;

  // 3. This Month's Employee Payouts
  const thisMonthPayouts = useMemo(() => {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return employeePayments
      .filter((p) => (p.paymentDate || '').startsWith(currentYearMonth))
      .reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
  }, [employeePayments]);

  // 4. Remaining Unpaid Assignment Balance
  const remainingUnpaidBalance = useMemo(() => {
    return assignments
      .filter((a) => a.paymentStatus !== 'Cancelled')
      .reduce((sum, a) => {
        const balance = Math.max(0, (Number(a.amount) || 0) - (Number(a.amountPaid) || 0));
        return sum + balance;
      }, 0);
  }, [assignments]);

  const kpis: KpiCardItem[] = [
    {
      label: 'Total Payouts Made',
      value: formatINR(totalPayoutsMade),
      subtext: 'Cumulative employee disbursements',
      icon: <Wallet className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Total Transactions',
      value: totalTransactions,
      subtext: 'Recorded payment vouchers',
      icon: <CheckCircle className="w-4 h-4 text-blue-600" />,
    },
    {
      label: "This Month's Payouts",
      value: formatINR(thisMonthPayouts),
      subtext: 'Current billing period settlements',
      icon: <Calendar className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'Remaining Assignment Balance',
      value: formatINR(remainingUnpaidBalance),
      subtext: 'Unpaid employee commitments',
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    },
  ];

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return employeePayments.filter((p) => {
      const assignment = getAssignmentById(p.assignmentId);
      const employee = getEmployeeById(p.employeeId);
      const empName = employee?.name || p.employeeName || assignment?.employeeName || '';

      const term = searchTerm.toLowerCase();
      const matchesSearch =
        p.id.toLowerCase().includes(term) ||
        p.assignmentId.toLowerCase().includes(term) ||
        p.projectId.toLowerCase().includes(term) ||
        p.employeeId.toLowerCase().includes(term) ||
        empName.toLowerCase().includes(term) ||
        p.paymentMode.toLowerCase().includes(term) ||
        (p.referenceUtr && p.referenceUtr.toLowerCase().includes(term)) ||
        (p.notes && p.notes.toLowerCase().includes(term));

      const matchesMode = modeFilter === 'ALL' || p.paymentMode === modeFilter;

      return matchesSearch && matchesMode;
    });
  }, [employeePayments, searchTerm, modeFilter, getAssignmentById, getEmployeeById]);

  // Compute remaining unpaid balance for a specific assignment (taking into account the payment being edited)
  const getAssignmentRemainingBalance = (assignmentId: string, excludePaymentId?: string) => {
    const assignment = getAssignmentById(assignmentId);
    if (!assignment) return 0;

    const otherPayments = employeePayments.filter(
      (p) => p.assignmentId === assignmentId && p.id !== excludePaymentId
    );
    const otherTotal = otherPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
    return Math.max(0, (Number(assignment.amount) || 0) - otherTotal);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormError(null);

    // Pick first available assignment or first assignment
    const defaultAssignment = assignments.length > 0 ? assignments[0] : undefined;
    const today = new Date().toISOString().slice(0, 10);
    const newId = storageService.generateId('DDI-EPAY');

    let defaultAmount = 0;
    if (defaultAssignment) {
      const remaining = getAssignmentRemainingBalance(defaultAssignment.id);
      defaultAmount = remaining > 0 ? remaining : 0;
    }

    setFormData({
      id: newId,
      assignmentId: defaultAssignment?.id || '',
      projectId: defaultAssignment?.projectId || '',
      employeeId: defaultAssignment?.employeeId || '',
      employeeName: defaultAssignment?.employeeName || '',
      paymentDate: today,
      amountPaid: defaultAmount,
      paymentMode: 'GST Invoice',
      referenceUtr: '',
      notes: '',
    });

    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (payment: EmployeePayment) => {
    setIsEditing(true);
    setFormError(null);

    const assignment = getAssignmentById(payment.assignmentId);
    const employee = getEmployeeById(payment.employeeId);

    setFormData({
      ...payment,
      projectId: assignment?.projectId || payment.projectId,
      employeeId: assignment?.employeeId || payment.employeeId,
      employeeName: employee?.name || assignment?.employeeName || payment.employeeName,
    });

    setIsModalOpen(true);
  };

  // Handle Assignment Change in Modal
  const handleAssignmentChange = (assignmentId: string) => {
    const assignment = getAssignmentById(assignmentId);
    if (!assignment) return;

    const remaining = getAssignmentRemainingBalance(assignmentId, isEditing ? formData.id : undefined);

    setFormData((prev) => ({
      ...prev,
      assignmentId,
      projectId: assignment.projectId,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      // If adding new, auto-fill full remaining balance or keep reasonable amount
      amountPaid: prev.amountPaid && prev.amountPaid <= remaining ? prev.amountPaid : remaining,
    }));
  };

  // Save Employee Payment
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.assignmentId) {
      setFormError('Please select an Assignment ID.');
      return;
    }

    const assignment = getAssignmentById(formData.assignmentId);
    if (!assignment) {
      setFormError('Selected Assignment not found.');
      return;
    }

    const amountPaid = Number(formData.amountPaid) || 0;
    if (amountPaid <= 0) {
      setFormError('Amount Paid must be greater than zero.');
      return;
    }

    const remaining = getAssignmentRemainingBalance(formData.assignmentId, isEditing ? formData.id : undefined);
    if (amountPaid > remaining) {
      setFormError(
        `Amount Paid (₹${amountPaid.toLocaleString('en-IN')}) cannot exceed the remaining unpaid balance of ₹${remaining.toLocaleString('en-IN')} for assignment ${formData.assignmentId}.`
      );
      return;
    }

    // Reference / UTR Unique check
    if (formData.referenceUtr && formData.referenceUtr.trim()) {
      const trimmedRef = formData.referenceUtr.trim().toLowerCase();
      const duplicate = employeePayments.find(
        (p) => p.id !== formData.id && (p.referenceUtr || '').trim().toLowerCase() === trimmedRef
      );
      if (duplicate) {
        setFormError(
          `Reference / UTR "${formData.referenceUtr.trim()}" is already recorded on payment ${duplicate.id}. Must be unique.`
        );
        return;
      }
    }

    const payload: EmployeePayment = {
      id: formData.id || storageService.generateId('DDI-EPAY'),
      assignmentId: formData.assignmentId,
      projectId: assignment.projectId,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      paymentDate: formData.paymentDate || new Date().toISOString().slice(0, 10),
      amountPaid,
      paymentMode: formData.paymentMode || 'GST Invoice',
      referenceUtr: formData.referenceUtr?.trim() || '',
      notes: formData.notes?.trim() || '',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = saveEmployeePayment(payload);
    if (!res.success) {
      setFormError(res.error || 'Failed to record payment.');
      return;
    }

    setIsModalOpen(false);
  };

  // CSV Export
  const handleExportCsv = () => {
    const columns = [
      { key: 'id', header: 'Payment ID' },
      { key: 'assignmentId', header: 'Assignment ID' },
      { key: 'projectId', header: 'Project ID' },
      { key: 'employeeId', header: 'Employee ID' },
      {
        key: 'employeeName',
        header: 'Employee Name',
        format: (row: EmployeePayment) => {
          const emp = getEmployeeById(row.employeeId);
          return emp?.name || row.employeeName;
        },
      },
      { key: 'paymentDate', header: 'Payment Date' },
      { key: 'amountPaid', header: 'Amount Paid (INR)' },
      { key: 'paymentMode', header: 'Payment Mode' },
      { key: 'referenceUtr', header: 'Reference / UTR' },
      { key: 'notes', header: 'Notes' },
    ];

    exportToCsv(filteredPayments, columns, 'ddi_employee_payments_ledger');
  };

  // Payment Mode Badge Helper
  const renderModeBadge = (mode: EmployeePaymentMode) => {
    switch (mode) {
      case 'GST Invoice':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <CreditCard className="w-3 h-3" />
            GST Invoice
          </span>
        );
      case 'Non GST Online':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <ArrowUpRight className="w-3 h-3" />
            Non GST Online
          </span>
        );
      case 'Cash':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Wallet className="w-3 h-3" />
            Cash
          </span>
        );
      case 'Crypto':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Hash className="w-3 h-3" />
            Crypto
          </span>
        );
      default:
        return <span>{mode}</span>;
    }
  };

  // Currently selected assignment in modal for showing live remaining balance info
  const selectedModalAssignment = useMemo(() => {
    if (!formData.assignmentId) return null;
    return getAssignmentById(formData.assignmentId);
  }, [formData.assignmentId, getAssignmentById]);

  const modalRemainingBalance = useMemo(() => {
    if (!formData.assignmentId) return 0;
    return getAssignmentRemainingBalance(formData.assignmentId, isEditing ? formData.id : undefined);
  }, [formData.assignmentId, formData.id, isEditing, employeePayments]);

  return (
    <div className="space-y-6">
      {/* Module Toolbar with KPIs & Search */}
      <CommonModuleToolbar
        moduleTitle="Employee Payments"
        moduleSubtitle="Assignment payout ledger, milestone disbursements, and live two-way compensation tracking"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={modeFilter}
        onStatusFilterChange={setModeFilter}
        statusOptions={[
          { label: 'All Modes', value: 'ALL' },
          { label: 'Bank Transfer', value: 'Bank Transfer' },
          { label: 'UPI', value: 'UPI' },
          { label: 'Cash', value: 'Cash' },
          { label: 'Cheque', value: 'Cheque' },
          { label: 'Card', value: 'Card' },
          { label: 'Crypto', value: 'Crypto' },
          { label: 'Milestone-based', value: 'Milestone-based' },
        ]}
        onAddNew={handleOpenAdd}
        addNewLabel="+ Add Employee Payment"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredPayments.length}
      />

      {/* Employee Payments Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Assignment & Project</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">Reference / UTR</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Wallet className="w-8 h-8 opacity-40 text-slate-400" />
                      <p className="text-sm">No employee payments found matching your search or filter.</p>
                      <button
                        type="button"
                        onClick={handleOpenAdd}
                        className="mt-2 text-xs text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 font-semibold"
                      >
                        + Record First Employee Payment
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const assignment = getAssignmentById(p.assignmentId);
                  const project = getProjectById(p.projectId);
                  const employee = getEmployeeById(p.employeeId);
                  const employeeDisplayName = employee?.name || p.employeeName;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* 1. Payment ID */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        {p.id}
                      </td>

                      {/* 2. Assignment & Project Linkage */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col max-w-xs">
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                            {p.assignmentId}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={assignment?.workAssigned}>
                            {assignment?.workAssigned || 'Project Task'}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate" title={p.projectId}>
                            {p.projectId}
                          </span>
                        </div>
                      </td>

                      {/* 3. Employee */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {employeeDisplayName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-slate-800 dark:text-slate-200 font-semibold">
                              {employeeDisplayName}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              {p.employeeId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 4. Payment Date */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatDate(p.paymentDate)}
                      </td>

                      {/* 5. Amount Paid */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <span className="inline-block font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                          {formatINR(p.amountPaid)}
                        </span>
                      </td>

                      {/* 6. Payment Mode */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderModeBadge(p.paymentMode)}
                      </td>

                      {/* 7. Reference / UTR */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {p.referenceUtr ? (
                          <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {p.referenceUtr}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">-</span>
                        )}
                      </td>

                      {/* 8. Notes */}
                      <td className="py-3 px-4 max-w-xs">
                        {p.notes ? (
                          <span className="text-slate-600 dark:text-slate-400 line-clamp-1 text-[11px]" title={p.notes}>
                            {p.notes}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 italic">No notes</span>
                        )}
                      </td>

                      {/* 9. Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                            title="Edit Payment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(p)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title="Delete Payment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT EMPLOYEE PAYMENT MODAL FORM (ONLY AND EXACTLY THE 10 FIELDS) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isEditing ? 'Edit Employee Payment' : '+ Add Employee Payment'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Disburse milestone compensation linked directly to an assignment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Assignment ID Selection (Dropdown populated dynamically from all records in Assignments module) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-600" />
                    1. Assignment ID <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    Select to auto-fill project & employee
                  </span>
                </label>
                <select
                  value={formData.assignmentId || ''}
                  onChange={(e) => handleAssignmentChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  <option value="" disabled>
                    -- Select Assignment --
                  </option>
                  {assignments.map((asn) => {
                    const balance = getAssignmentRemainingBalance(
                      asn.id,
                      isEditing ? formData.id : undefined
                    );
                    return (
                      <option key={asn.id} value={asn.id}>
                        {asn.id} — {asn.workAssigned} ({asn.employeeName}) · Unpaid Balance: ₹{balance.toLocaleString('en-IN')}
                      </option>
                    );
                  })}
                </select>
                {selectedModalAssignment && (
                  <div className="p-2.5 rounded-lg bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200/60 dark:border-cyan-800/40 text-[11px] text-cyan-900 dark:text-cyan-200 flex items-center justify-between">
                    <div>
                      Task: <strong className="font-semibold">{selectedModalAssignment.workAssigned}</strong>
                    </div>
                    <div>
                      Allocated: <strong>{formatINR(selectedModalAssignment.amount)}</strong> | Remaining Balance:{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">{formatINR(modalRemainingBalance)}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-filled details card */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Auto-Filled Relational Fields (Read-Only)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 2. Employee Payment ID (Auto-generated & read-only) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-slate-400" />
                      2. Employee Payment ID (Auto-generated)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.id || ''}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-cyan-600 dark:text-cyan-400 cursor-not-allowed"
                    />
                  </div>

                  {/* 3. Project ID (Auto-filled & read-only) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                      3. Project ID (Auto-filled)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.projectId || ''}
                      placeholder="Select Assignment ID above"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 truncate cursor-not-allowed"
                    />
                  </div>

                  {/* 4. Employee ID (Auto-filled & read-only) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      4. Employee ID (Auto-filled)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.employeeId || ''}
                      placeholder="Auto-filled from Assignment"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* 5. Employee Name (Auto-filled & read-only) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      5. Employee Name (Auto-filled)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.employeeName || ''}
                      placeholder="Auto-filled from Assignment"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: TRANSACTION INPUTS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 6. Payment Date (Date picker, defaults to today) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-600" />
                    6. Payment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.paymentDate || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, paymentDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>

                {/* 7. Amount Paid (Numeric in INR, validate <= remaining balance) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                      7. Amount Paid (INR) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Max: {formatINR(modalRemainingBalance)}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={modalRemainingBalance > 0 ? modalRemainingBalance : undefined}
                    step="500"
                    required
                    value={formData.amountPaid ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, amountPaid: Number(e.target.value) || 0 }))
                    }
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  {Number(formData.amountPaid) > modalRemainingBalance && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                      Amount Paid exceeds remaining balance of {formatINR(modalRemainingBalance)}.
                    </p>
                  )}
                </div>

                {/* 8. Payment Mode (Dropdown) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-cyan-600" />
                    8. Payment Mode <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.paymentMode || 'GST Invoice'}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        paymentMode: e.target.value as EmployeePaymentMode,
                      }))
                    }
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    {PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 9. Reference / UTR (Text input, unique check) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-cyan-600" />
                      9. Reference / UTR
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Must be strictly unique
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.referenceUtr || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, referenceUtr: e.target.value }))}
                    placeholder="e.g. EPAY-NEFT-991823101"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
              </div>

              {/* 10. Notes (Textarea) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-600" />
                  10. Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Milestone 1 driver dispatch backend APIs payout cleared."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none"
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isEditing ? 'Save Changes' : 'Record Employee Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Delete Employee Payment
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Payment ID: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{deleteCandidate.id}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete payment voucher{' '}
              <strong className="text-slate-900 dark:text-white">{deleteCandidate.id}</strong> of{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                {formatINR(deleteCandidate.amountPaid)}
              </strong>{' '}
              to <strong className="text-slate-900 dark:text-white">{deleteCandidate.employeeName}</strong>?
              The linked assignment's amount paid and payment status will be recalculated automatically.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Keep Payment
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteEmployeePayment(deleteCandidate.id);
                  setDeleteCandidate(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
              >
                Delete Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
