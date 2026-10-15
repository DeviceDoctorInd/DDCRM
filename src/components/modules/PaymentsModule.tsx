import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { Payment, PaymentStatus, PaymentMode, CurrencyCode } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate, calculateDaysOverdue } from '../../utils/formatters';
import {
  CreditCard,
  CheckCircle,
  AlertOctagon,
  ShieldAlert,
  Edit2,
  Trash2,
  X,
  IndianRupee,
  Check,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';

const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ['Received', 'Pending', 'Failed', 'Cancelled'];

const PAYMENT_MODES: PaymentMode[] = [
  'GST Invoice',
  'Non GST Online',
  'Cash',
  'Crypto',
];

const CURRENCIES: CurrencyCode[] = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'AUD',
  'USDT',
  'BTC',
];

const DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  INR: 1,
  USD: 84.5,
  EUR: 92.0,
  GBP: 108.0,
  AED: 23.0,
  SGD: 64.0,
  AUD: 56.5,
  USDT: 84.5,
  BTC: 7000000,
};

export const PaymentsModule: React.FC = () => {
  const {
    payments,
    projects,
    clients,
    savePayment,
    deletePayment,
    getClientById,
    getProjectById,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Payment>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // KPIs
  const totalReceivedINR = payments
    .filter((p) => p.paymentStatus === 'Received')
    .reduce((acc, p) => acc + (p.amountINR || p.amount || 0), 0);

  const totalPendingINR = payments
    .filter((p) => p.paymentStatus === 'Pending')
    .reduce((acc, p) => acc + (p.amountINR || p.amount || 0), 0);

  const totalContractBookings = projects.reduce((acc, p) => acc + (p.contractValue || 0), 0);
  const totalOutstandingBalance = Math.max(0, totalContractBookings - totalReceivedINR);

  const overdueCount = payments.filter((p) => {
    const overdueDays = p.daysOverdue ?? calculateDaysOverdue(p.dueDate, p.paymentStatus);
    return p.paymentStatus === 'Pending' && overdueDays > 0;
  }).length;

  const kpis: KpiCardItem[] = [
    {
      label: 'Settled Receipts (INR)',
      value: formatINR(totalReceivedINR),
      subtext: 'Cleared payments',
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Pending Invoices (INR)',
      value: formatINR(totalPendingINR),
      subtext: 'Invoiced awaiting settlement',
      icon: <Clock className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'Remaining Balance (INR)',
      value: formatINR(totalOutstandingBalance),
      subtext: 'Contract balance across projects',
      icon: <AlertOctagon className="w-4 h-4 text-amber-500" />,
    },
    {
      label: 'Overdue Payments',
      value: overdueCount,
      subtext: 'Pending past due date',
      icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
    },
  ];

  // Filtered rows
  const filteredPayments = useMemo(() => {
    return payments.filter((pay) => {
      const client = getClientById(pay.clientId);
      const project = getProjectById(pay.projectId);

      const matchesSearch =
        pay.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pay.projectId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (pay.referenceUtr && pay.referenceUtr.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (client && client.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (project && project.clientName && project.clientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (pay.paymentMode && pay.paymentMode.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || pay.paymentStatus === statusFilter;
      const matchesMode = modeFilter === 'ALL' || pay.paymentMode === modeFilter;

      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [payments, searchTerm, statusFilter, modeFilter, getClientById, getProjectById]);

  // Export CSV with all 15 exact fields
  const handleExportCsv = () => {
    exportToCsv(
      filteredPayments,
      [
        { key: 'id', header: 'Payment ID' },
        { key: 'projectId', header: 'Project ID' },
        { key: 'clientId', header: 'Client ID' },
        {
          key: 'clientName',
          header: 'Client Name',
          format: (r) => r.clientName || getClientById(r.clientId)?.name || r.clientId,
        },
        { key: 'paymentMode', header: 'Payment Mode' },
        { key: 'paymentDate', header: 'Payment Date' },
        { key: 'dueDate', header: 'Due Date' },
        { key: 'amountReceived', header: 'Amount Received' },
        { key: 'currency', header: 'Currency' },
        { key: 'exchangeRate', header: 'Exchange Rate' },
        { key: 'amountINR', header: 'Amount (INR)', format: (r) => r.amountINR || r.amount || 0 },
        { key: 'referenceUtr', header: 'Reference / UTR' },
        { key: 'paymentStatus', header: 'Payment Status' },
        {
          key: 'daysOverdue',
          header: 'Days Overdue',
          format: (r) => r.daysOverdue ?? calculateDaysOverdue(r.dueDate, r.paymentStatus),
        },
        { key: 'notes', header: 'Notes', format: (r) => r.notes || '' },
      ],
      'DeviceDoctorIndia_Payments'
    );
  };

  // Open Add Payment Modal
  const handleOpenAdd = () => {
    setFormError(null);
    setIsEditing(false);
    const autoId = storageService.generateId('DDI-PAY');
    const defaultProject = projects.length > 0 ? projects[0] : undefined;
    const defaultClient = defaultProject
      ? clients.find((c) => c.id === defaultProject.clientId)
      : clients[0];

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

    const projectCurrency = defaultProject?.currency || defaultClient?.preferredCurrency || 'INR';
    const projectRate = defaultProject?.exchangeRate ?? (projectCurrency === 'INR' ? 1 : 84.5);
    const initialAmount = 100000;
    const initialAmountINR = Math.round(initialAmount * projectRate);

    setFormData({
      id: autoId,
      projectId: defaultProject?.id || '',
      clientId: defaultProject?.clientId || defaultClient?.id || '',
      clientName: defaultProject?.clientName || defaultClient?.name || '',
      paymentMode: defaultProject?.paymentMode || 'GST Invoice',
      paymentDate: today,
      dueDate,
      amountReceived: initialAmount,
      currency: projectCurrency,
      exchangeRate: projectRate,
      amountINR: initialAmountINR,
      referenceUtr: `UTR-DDI-${Date.now().toString().slice(-6)}`,
      paymentStatus: 'Received',
      daysOverdue: 0,
      notes: '',
    });
    setIsModalOpen(true);
  };

  // Open Edit Payment Modal
  const handleOpenEdit = (pay: Payment) => {
    setFormError(null);
    setIsEditing(true);
    const overdue = pay.daysOverdue ?? calculateDaysOverdue(pay.dueDate, pay.paymentStatus);
    setFormData({
      ...pay,
      amountReceived: pay.amountReceived ?? pay.amount ?? 0,
      amountINR: pay.amountINR ?? pay.amount ?? 0,
      daysOverdue: overdue,
    });
    setIsModalOpen(true);
  };

  // Handlers for Project ID selection & reactive field updates
  const handleProjectSelect = (selectedProjectId: string) => {
    const matchedProject = projects.find((p) => p.id === selectedProjectId);
    if (!matchedProject) return;

    const matchedClient = clients.find((c) => c.id === matchedProject.clientId);
    const newCurrency = matchedProject.currency || matchedClient?.preferredCurrency || 'INR';
    const newRate = matchedProject.exchangeRate ?? (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const currentAmount = Number(formData.amountReceived) || 0;
    const newAmountINR = Math.round(currentAmount * newRate);

    setFormData((prev) => ({
      ...prev,
      projectId: matchedProject.id,
      clientId: matchedProject.clientId,
      clientName: matchedProject.clientName || matchedClient?.name || '',
      paymentMode: matchedProject.paymentMode || prev.paymentMode || 'GST Invoice',
      currency: newCurrency,
      exchangeRate: newRate,
      amountINR: newAmountINR,
    }));
  };

  // Handlers for Amount / Rate changes
  const handleAmountOrRateChange = (amount: number, rate: number) => {
    const amountINR = Math.round(amount * rate);
    setFormData((prev) => ({
      ...prev,
      amountReceived: amount,
      exchangeRate: rate,
      amountINR,
    }));
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    const rate = newCurrency === 'INR' ? 1 : (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const amount = Number(formData.amountReceived) || 0;
    setFormData((prev) => ({
      ...prev,
      currency: newCurrency,
      exchangeRate: rate,
      amountINR: Math.round(amount * rate),
    }));
  };

  const handleDueDateOrStatusChange = (newDueDate: string, newStatus: PaymentStatus) => {
    const overdue = calculateDaysOverdue(newDueDate, newStatus);
    setFormData((prev) => ({
      ...prev,
      dueDate: newDueDate,
      paymentStatus: newStatus,
      daysOverdue: overdue,
    }));
  };

  // Selected Project Financial Context for Balance Check
  const selectedProject = projects.find((p) => p.id === formData.projectId);
  const otherReceivedOnSelectedProject = useMemo(() => {
    if (!formData.projectId) return 0;
    return payments
      .filter(
        (p) =>
          p.projectId === formData.projectId &&
          p.id !== formData.id &&
          p.paymentStatus === 'Received'
      )
      .reduce((acc, p) => acc + (p.amountINR || p.amount || 0), 0);
  }, [payments, formData.projectId, formData.id]);

  const selectedProjectRemainingBalance = selectedProject
    ? Math.max(0, (selectedProject.contractValue || 0) - otherReceivedOnSelectedProject)
    : 0;

  // Form submit
  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      setFormError('Please select a Project ID from the dropdown.');
      return;
    }
    if (!formData.referenceUtr || !formData.referenceUtr.trim()) {
      setFormError('Reference / UTR is required.');
      return;
    }
    const cleanUtr = formData.referenceUtr.trim();
    // Unique check
    const dup = payments.find(
      (p) => p.id !== formData.id && p.referenceUtr?.trim().toLowerCase() === cleanUtr.toLowerCase()
    );
    if (dup) {
      setFormError(
        `Reference / UTR "${cleanUtr}" is already in use by Payment ${dup.id}. Reference / UTR must be strictly unique.`
      );
      return;
    }

    const amountReceived = Number(formData.amountReceived) || 0;
    const exchangeRate = Number(formData.exchangeRate) || 1;
    const amountINR = Math.round(amountReceived * exchangeRate);

    // Validate project balance for 'Received' payments
    if (formData.paymentStatus === 'Received' && selectedProject) {
      if (amountINR > selectedProjectRemainingBalance) {
        setFormError(
          `Payment amount of ₹${amountINR.toLocaleString('en-IN')} exceeds the project's remaining balance of ₹${selectedProjectRemainingBalance.toLocaleString('en-IN')} (Contract Value: ₹${(selectedProject.contractValue || 0).toLocaleString('en-IN')}, Previously Received: ₹${otherReceivedOnSelectedProject.toLocaleString('en-IN')}).`
        );
        return;
      }
    }

    const overdueDays = calculateDaysOverdue(formData.dueDate || '', formData.paymentStatus || 'Pending');

    const payload: Payment = {
      id: formData.id || '',
      projectId: formData.projectId,
      clientId: formData.clientId || selectedProject?.clientId || '',
      clientName: formData.clientName || selectedProject?.clientName || '',
      paymentMode: formData.paymentMode || 'GST Invoice',
      paymentDate: formData.paymentDate || new Date().toISOString().slice(0, 10),
      dueDate: formData.dueDate || new Date().toISOString().slice(0, 10),
      amountReceived,
      currency: formData.currency || 'INR',
      exchangeRate,
      amountINR,
      referenceUtr: cleanUtr,
      paymentStatus: formData.paymentStatus || 'Received',
      daysOverdue: overdueDays,
      notes: formData.notes || '',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      amount: amountINR,
      receivedAmount: formData.paymentStatus === 'Received' ? amountINR : 0,
      outstandingAmount: formData.paymentStatus === 'Received' ? 0 : amountINR,
    };

    const res = savePayment(payload);
    if (res.success) {
      setIsModalOpen(false);
      setFormData({});
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save payment record.');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Payment Ledger & Invoices"
        moduleSubtitle="Corporate settlement tracking, tax invoices, and real-time project balance reconciliation"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { label: 'All Invoices', value: 'ALL' },
          { label: 'Received', value: 'Received' },
          { label: 'Pending', value: 'Pending' },
          { label: 'Failed', value: 'Failed' },
          { label: 'Cancelled', value: 'Cancelled' },
        ]}
        onAddNew={handleOpenAdd}
        addNewLabel="Add Payment"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredPayments.length}
      />

      {/* Payment Mode Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Payment Mode:
          </span>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
          >
            <option value="ALL">All Payment Modes</option>
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Showing <strong className="text-slate-900 dark:text-slate-100">{filteredPayments.length}</strong> of{' '}
          {payments.length} transactions
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Project ID & Engagement</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Amount ({'Curr'})</th>
                <th className="py-3 px-4">Amount (INR)</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">Reference / UTR</th>
                <th className="py-3 px-4">Due Date & Aging</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No payment records found.</p>
                    <p className="text-xs mt-1">Click "Add Payment" to record a new client transaction.</p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay) => {
                  const client = getClientById(pay.clientId);
                  const overdueDays =
                    pay.daysOverdue ?? calculateDaysOverdue(pay.dueDate, pay.paymentStatus);
                  const isOverdue = pay.paymentStatus === 'Pending' && overdueDays > 0;

                  let statusBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (pay.paymentStatus === 'Received') {
                    statusBadge =
                      'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60';
                  } else if (pay.paymentStatus === 'Pending') {
                    statusBadge = isOverdue
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60';
                  } else if (pay.paymentStatus === 'Failed') {
                    statusBadge =
                      'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60';
                  } else if (pay.paymentStatus === 'Cancelled') {
                    statusBadge =
                      'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                  }

                  return (
                    <tr
                      key={pay.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                        {pay.id}
                      </td>
                      <td className="py-3.5 px-4 max-w-[260px]">
                        <div
                          className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate"
                          title={pay.projectId}
                        >
                          {pay.projectId}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          Paid on: {formatDate(pay.paymentDate)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {pay.clientName || client?.name || `Client #${pay.clientId}`}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          ID: {pay.clientId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {pay.currency} {Number(pay.amountReceived || pay.amount || 0).toLocaleString()}
                        {pay.currency !== 'INR' && pay.exchangeRate && (
                          <div className="text-[10px] text-slate-400">@ {pay.exchangeRate}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatINR(pay.amountINR || pay.amount || 0)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            pay.paymentMode === 'GST Invoice'
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                              : pay.paymentMode === 'Non GST Online'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                              : pay.paymentMode === 'Cash'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                          }`}
                        >
                          {pay.paymentMode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 select-all">
                          {pay.referenceUtr || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="tabular-nums text-slate-800 dark:text-slate-200">
                          {formatDate(pay.dueDate)}
                        </div>
                        {isOverdue ? (
                          <div className="text-[10px] font-semibold text-rose-500 flex items-center gap-1 mt-0.5">
                            <span>{overdueDays}d overdue</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {pay.paymentStatus === 'Received' ? 'Settled' : 'On schedule'}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${statusBadge}`}>
                          {pay.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(pay)}
                            className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Payment Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deletePayment(pay.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Payment Record"
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

      {/* Add / Edit Payment Modal with ONLY & EXACTLY the 15 requested fields */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isEditing ? `Edit Payment (${formData.id})` : 'New Payment'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isEditing
                      ? 'Update transaction reconciliation and ledger entry'
                      : `Record client settlement · Payment ID: ${formData.id || 'DDI-PAY-Auto'}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveSubmit} className="p-6 space-y-6">
              {formError && (
                <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Project Balance Live Sync Indicator */}
              {selectedProject && (
                <div className="p-3.5 rounded-xl bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-cyan-900 dark:text-cyan-200">
                    <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <div>
                      <span className="font-semibold">Project Commercial Balance: </span>
                      <span>Contract: </span>
                      <strong className="font-mono">{formatINR(selectedProject.contractValue || 0)}</strong>
                      <span className="mx-1.5">|</span>
                      <span>Received: </span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                        {formatINR(otherReceivedOnSelectedProject)}
                      </strong>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-cyan-300 dark:border-cyan-800 font-mono font-bold text-cyan-700 dark:text-cyan-300">
                    Remaining Balance: {formatINR(selectedProjectRemainingBalance)}
                  </div>
                </div>
              )}

              {/* SECTION 1: Payment & Project Association */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  1. Payment & Project Association
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Field 1: Payment ID (Auto-generated, Read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment ID (Auto-generated)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.id || 'DDI-PAY-Auto'}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 cursor-not-allowed select-all"
                    />
                  </div>

                  {/* Field 2: Project ID (Dropdown with smart project IDs) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Project ID <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.projectId || ''}
                      onChange={(e) => handleProjectSelect(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    >
                      <option value="" disabled>-- Select Project --</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Field 3: Client ID (Auto-filled & read-only from Project) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Client ID (Auto-filled)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.clientId || '—'}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* Field 4: Client Name (Auto-filled & read-only from Project) */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Client Name (Auto-filled)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.clientName || '—'}
                      className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Dates, Mode & Status */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  2. Schedule, Mode & Aging Status
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Field 5: Payment Mode (Dropdown) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={formData.paymentMode || 'GST Invoice'}
                      onChange={(e) =>
                        setFormData({ ...formData, paymentMode: e.target.value as PaymentMode })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {PAYMENT_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Field 6: Payment Date (Date picker) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.paymentDate || ''}
                      onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Field 7: Due Date (Date picker) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Due Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.dueDate || ''}
                      onChange={(e) =>
                        handleDueDateOrStatusChange(
                          e.target.value,
                          (formData.paymentStatus as PaymentStatus) || 'Pending'
                        )
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Field 13: Payment Status (Dropdown) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={formData.paymentStatus || 'Received'}
                      onChange={(e) =>
                        handleDueDateOrStatusChange(
                          formData.dueDate || '',
                          e.target.value as PaymentStatus
                        )
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {PAYMENT_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Field 14: Days Overdue (Auto-calculated & read-only) */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Days Overdue (Auto-calculated, Read-only)
                    </label>
                    <div className="w-full px-3 py-2 text-xs font-mono font-medium rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <span className="text-slate-700 dark:text-slate-300">
                        {formData.daysOverdue !== undefined && formData.daysOverdue > 0
                          ? `${formData.daysOverdue} day(s) overdue`
                          : '0 days (Not overdue)'}
                      </span>
                      {formData.daysOverdue !== undefined && formData.daysOverdue > 0 && (
                        <span className="text-[10px] font-bold text-rose-500 uppercase px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60">
                          Past Due
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Commercials & UTR Reference */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  3. Commercials, Foreign Exchange & Reference / UTR
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                  {/* Field 9: Currency (Dropdown) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Currency
                    </label>
                    <select
                      value={formData.currency || 'INR'}
                      onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {CURRENCIES.map((curr) => (
                        <option key={curr} value={curr}>
                          {curr}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Field 8: Amount Received (Numeric input) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Amount Received <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={formData.amountReceived ?? 0}
                      onChange={(e) =>
                        handleAmountOrRateChange(
                          parseFloat(e.target.value) || 0,
                          formData.exchangeRate ?? 1
                        )
                      }
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Field 10: Exchange Rate (Numeric input) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Exchange Rate (to INR)
                    </label>
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={formData.exchangeRate ?? 1}
                      onChange={(e) =>
                        handleAmountOrRateChange(
                          formData.amountReceived ?? 0,
                          parseFloat(e.target.value) || 1
                        )
                      }
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Field 11: Amount (INR) (Auto-calculated & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Amount (INR, Auto)
                    </label>
                    <div className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 text-cyan-700 dark:text-cyan-300 truncate">
                      {formatINR(formData.amountINR || 0)}
                    </div>
                  </div>

                  {/* Field 12: Reference / UTR (Text input — Unique check enforced) */}
                  <div className="sm:col-span-2 md:col-span-4 mt-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Reference / UTR (Unique ID) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.referenceUtr || ''}
                      onChange={(e) => setFormData({ ...formData, referenceUtr: e.target.value })}
                      placeholder="e.g. UTR-HDFC-9928172601 or IMPS-20261014-998"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Must be strictly unique across all payments in the system.
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 4: Notes */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  4. Transaction Notes
                </div>
                {/* Field 15: Notes (Textarea) */}
                <textarea
                  rows={3}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Record bank clearance reference, remittance details, or client billing communication..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'Save Payment Changes' : 'Record Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
