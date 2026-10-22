import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { Expense, ExpensePaymentStatus, CurrencyCode } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate } from '../../utils/formatters';
import {
  Receipt,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Edit2,
  Trash2,
  X,
  FileText,
  Building,
  Briefcase,
  IndianRupee,
  Layers,
  Calendar,
  DollarSign,
  Info,
} from 'lucide-react';

const EXPENSE_STATUS_OPTIONS: ExpensePaymentStatus[] = ['Paid', 'Pending', 'Failed', 'Cancelled'];

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

export const ExpensesModule: React.FC = () => {
  const {
    expenses,
    expenseCategories,
    projects,
    clients,
    saveExpense,
    deleteExpense,
    confirmDelete,
    getProjectById,
    getExpenseCategoryById,
    getClientById,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Expense>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Top Summary KPIs
  // 1. Total Expenses in INR
  const totalExpensesINR = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  }, [expenses]);

  // 2. Project-Linked Expenses in INR
  const projectLinkedExpensesINR = useMemo(() => {
    return expenses
      .filter((e) => e.projectId && e.projectId !== 'NA')
      .reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  }, [expenses]);

  // 3. General/NA Office Expenses in INR
  const generalOfficeExpensesINR = useMemo(() => {
    return expenses
      .filter((e) => !e.projectId || e.projectId === 'NA')
      .reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  }, [expenses]);

  // 4. Pending Expense Payments
  const pendingExpensesCount = useMemo(() => {
    return expenses.filter((e) => e.paymentStatus === 'Pending').length;
  }, [expenses]);

  const pendingExpensesTotalINR = useMemo(() => {
    return expenses
      .filter((e) => e.paymentStatus === 'Pending')
      .reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  }, [expenses]);

  const kpis: KpiCardItem[] = [
    {
      label: 'Total Expenses (INR)',
      value: formatINR(totalExpensesINR),
      subtext: `${expenses.length} operational disbursements`,
      icon: <Receipt className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Project-Linked Expenses',
      value: formatINR(projectLinkedExpensesINR),
      subtext: 'Direct project delivery & cloud costs',
      icon: <Briefcase className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'General / Office Expenses',
      value: formatINR(generalOfficeExpensesINR),
      subtext: 'Non-project corporate expenditures',
      icon: <Building className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Pending Expense Payments',
      value: `${pendingExpensesCount} (${formatINR(pendingExpensesTotalINR)})`,
      subtext: 'Awaiting financial clearance',
      icon: <Clock className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
  ];

  // Category filter options
  const categoryFilterOptions = useMemo(() => {
    return [
      { label: 'All Categories', value: 'ALL' },
      ...expenseCategories.map((c) => ({
        label: c.name,
        value: c.id,
      })),
    ];
  }, [expenseCategories]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const term = (searchTerm || '').toLowerCase().trim();
      const cat = getExpenseCategoryById(e.expenseCategoryId);
      const catName = e.expenseCategoryName || cat?.name || '';

      const matchesSearch =
        !term ||
        (e.id || '').toLowerCase().includes(term) ||
        (e.vendor && e.vendor.toLowerCase().includes(term)) ||
        (e.description && e.description.toLowerCase().includes(term)) ||
        (e.projectId && e.projectId.toLowerCase().includes(term)) ||
        (e.clientName && e.clientName.toLowerCase().includes(term)) ||
        (catName && catName.toLowerCase().includes(term)) ||
        (e.notes && e.notes.toLowerCase().includes(term));

      const matchesStatus = statusFilter === 'ALL' || e.paymentStatus === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || e.expenseCategoryId === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [expenses, searchTerm, statusFilter, categoryFilter, getExpenseCategoryById]);

  // Export CSV
  const handleExportCsv = () => {
    exportToCsv(
      filteredExpenses,
      [
        { key: 'id', header: 'Expense ID' },
        { key: 'projectId', header: 'Project ID' },
        { key: 'clientId', header: 'Client ID' },
        { key: 'clientName', header: 'Client Name' },
        { key: 'expenseCategoryId', header: 'Expense Category ID' },
        {
          key: 'expenseCategoryName',
          header: 'Expense Category Name',
          format: (r) => r.expenseCategoryName || getExpenseCategoryById(r.expenseCategoryId)?.name || r.expenseCategoryId,
        },
        { key: 'vendor', header: 'Vendor' },
        { key: 'description', header: 'Description' },
        { key: 'amount', header: 'Amount' },
        { key: 'currency', header: 'Currency' },
        { key: 'exchangeRate', header: 'Exchange Rate' },
        { key: 'amountINR', header: 'Amount (INR)' },
        { key: 'expenseDate', header: 'Expense Date' },
        { key: 'paymentStatus', header: 'Payment Status' },
        { key: 'notes', header: 'Notes', format: (r) => r.notes || '' },
        { key: 'createdAt', header: 'Created At' },
      ],
      `${brandPrefix}_expenses_${new Date().toISOString().slice(0, 10)}`
    );
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormError(null);
    const newId = storageService.generateId('EXP', activeBrand);
    const today = new Date().toISOString().slice(0, 10);
    const activeCats = expenseCategories.filter((c) => c.status === 'Active');
    const defaultCatId = activeCats.length > 0 ? activeCats[0].id : '';

    setFormData({
      id: newId,
      brand: activeBrand,
      projectId: 'NA',
      clientId: 'NA',
      clientName: 'NA',
      expenseCategoryId: defaultCatId,
      vendor: '',
      description: '',
      amount: 0,
      currency: 'INR',
      exchangeRate: 1,
      amountINR: 0,
      expenseDate: today,
      paymentStatus: 'Paid',
      notes: '',
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (expense: Expense) => {
    setIsEditing(true);
    setFormError(null);
    setFormData({ ...expense });
    setIsModalOpen(true);
  };

  // Relational Auto-Fill Handler on Project ID Selection
  const handleProjectChange = (selectedProjectId: string) => {
    if (selectedProjectId === 'NA' || !selectedProjectId) {
      setFormData((prev) => {
        const amt = 0;
        const rate = 1;
        return {
          ...prev,
          projectId: 'NA',
          clientId: 'NA',
          clientName: 'NA',
          amount: amt,
          currency: 'INR',
          exchangeRate: rate,
          amountINR: Math.round(amt * rate),
        };
      });
      return;
    }

    const project = projects.find((p) => p.id === selectedProjectId);
    if (project) {
      const client = getClientById(project.clientId);
      const clientName = project.clientName || client?.name || project.clientId;
      const projectCurr = project.currency || 'INR';
      const projectRate = Number(project.exchangeRate) || (projectCurr === 'INR' ? 1 : DEFAULT_EXCHANGE_RATES[projectCurr] || 1);
      const projectContractAmt = Number(project.contract) || 0;

      setFormData((prev) => ({
        ...prev,
        projectId: project.id,
        clientId: project.clientId,
        clientName: clientName,
        amount: projectContractAmt,
        currency: projectCurr,
        exchangeRate: projectRate,
        amountINR: Math.round(projectContractAmt * projectRate),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        projectId: selectedProjectId,
      }));
    }
  };

  // Currency selection handler
  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    const rate = newCurrency === 'INR' ? 1 : (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const amount = Number(formData.amount) || 0;
    setFormData((prev) => ({
      ...prev,
      currency: newCurrency,
      exchangeRate: rate,
      amountINR: Math.round(amount * rate),
    }));
  };

  // Amount or Exchange Rate change handler
  const handleAmountChange = (newAmount: number) => {
    const rate = Number(formData.exchangeRate) || 1;
    setFormData((prev) => ({
      ...prev,
      amount: newAmount,
      amountINR: Math.round(newAmount * rate),
    }));
  };

  const handleRateChange = (newRate: number) => {
    const amount = Number(formData.amount) || 0;
    setFormData((prev) => ({
      ...prev,
      exchangeRate: newRate,
      amountINR: Math.round(amount * newRate),
    }));
  };

  // Form Submit Handler
  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.vendor || !formData.vendor.trim()) {
      setFormError('Vendor name is required.');
      return;
    }

    if (!formData.expenseCategoryId) {
      setFormError('Please select an Expense Category.');
      return;
    }

    const cat = getExpenseCategoryById(formData.expenseCategoryId);
    const categoryName = cat?.name || '';

    const amt = Number(formData.amount) || 0;
    if (amt < 0) {
      setFormError('Amount cannot be negative.');
      return;
    }

    const rate = Number(formData.exchangeRate) || 1;
    if (rate <= 0) {
      setFormError('Exchange rate must be greater than zero.');
      return;
    }

    const payload: Expense = {
      id: formData.id || storageService.generateId('EXP', activeBrand),
      brand: formData.brand || activeBrand,
      projectId: formData.projectId || 'NA',
      clientId: formData.clientId || 'NA',
      clientName: formData.clientName || 'NA',
      expenseCategoryId: formData.expenseCategoryId,
      expenseCategoryName: categoryName,
      vendor: formData.vendor.trim(),
      description: formData.description?.trim() || '',
      amount: amt,
      currency: formData.currency || 'INR',
      exchangeRate: rate,
      amountINR: Math.round(amt * rate),
      expenseDate: formData.expenseDate || new Date().toISOString().slice(0, 10),
      paymentStatus: formData.paymentStatus || 'Paid',
      notes: formData.notes?.trim() || '',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await saveExpense(payload);
    if (res.success) {
      setIsModalOpen(false);
      setFormData({});
    } else {
      setFormError(res.error || 'Failed to save expense record.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Toolbar */}
      <CommonModuleToolbar
        moduleTitle="Other Expenses"
        moduleSubtitle="Operational expenditures, cloud infrastructure, domain assets, and office overheads"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { label: 'All Statuses', value: 'ALL' },
          { label: 'Paid', value: 'Paid' },
          { label: 'Pending', value: 'Pending' },
          { label: 'Failed', value: 'Failed' },
          { label: 'Cancelled', value: 'Cancelled' },
        ]}
        onAddNew={handleOpenAdd}
        addNewLabel="+ Add Expense"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredExpenses.length}
      />

      {/* Category Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Category Filter:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
          >
            {categoryFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Showing <strong className="text-slate-900 dark:text-slate-100">{filteredExpenses.length}</strong> of{' '}
          {expenses.length} recorded expenses
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Expense ID</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Vendor & Description</th>
                <th className="py-3 px-4">Project / Scope</th>
                <th className="py-3 px-4">Currency & Rate</th>
                <th className="py-3 px-4">Amount (INR)</th>
                <th className="py-3 px-4">Expense Date</th>
                <th className="py-3 px-4 text-center">Payment Status</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No expenses found matching the selected filters.</p>
                    <p className="text-xs mt-1">Click "+ Add Expense" to record a new operational disbursement.</p>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const isProjectLinked = exp.projectId && exp.projectId !== 'NA';
                  const cat = getExpenseCategoryById(exp.expenseCategoryId);

                  let statusBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (exp.paymentStatus === 'Paid') {
                    statusBadge =
                      'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                  } else if (exp.paymentStatus === 'Pending') {
                    statusBadge =
                      'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                  } else if (exp.paymentStatus === 'Failed') {
                    statusBadge =
                      'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                  } else if (exp.paymentStatus === 'Cancelled') {
                    statusBadge =
                      'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                  }

                  return (
                    <tr
                      key={exp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Expense ID */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {exp.id}
                      </td>

                      {/* 2. Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                          {exp.expenseCategoryName || cat?.name || 'Uncategorized'}
                        </span>
                      </td>

                      {/* 3. Vendor & Description */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {exp.vendor}
                        </div>
                        {exp.description && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title={exp.description}>
                            {exp.description}
                          </div>
                        )}
                      </td>

                      {/* 4. Project / Scope */}
                      <td className="py-3 px-4 max-w-xs">
                        {isProjectLinked ? (
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate" title={exp.projectId}>
                              {exp.projectId}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-800 dark:text-slate-200 shrink-0" />
                              <span className="truncate">{exp.clientName} ({exp.clientId})</span>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            General / Non-Project (NA)
                          </span>
                        )}
                      </td>

                      {/* 5. Currency & Rate */}
                      <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        <div>
                          {exp.currency} {Number(exp.amount || 0).toLocaleString()}
                        </div>
                        {exp.currency !== 'INR' && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            @ {exp.exchangeRate}
                          </div>
                        )}
                      </td>

                      {/* 6. Amount (INR) */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {formatINR(exp.amountINR || 0)}
                      </td>

                      {/* 7. Expense Date */}
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {formatDate(exp.expenseDate)}
                      </td>

                      {/* 8. Payment Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge}`}>
                          {exp.paymentStatus}
                        </span>
                      </td>

                      {/* 9. Notes */}
                      <td className="py-3 px-4 max-w-xs text-slate-500 dark:text-slate-400 truncate" title={exp.notes || ''}>
                        {exp.notes || <span className="text-slate-300 dark:text-slate-600 italic">-</span>}
                      </td>

                      {/* 10. Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(exp)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 transition-colors"
                            title="Edit Expense"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              confirmDelete({
                                moduleName: 'Expense',
                                recordTitle: `${exp.vendor} (${formatINR(exp.amountINR || 0)})`,
                                recordId: exp.id,
                                details: (
                                  <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                                    Category: {exp.expenseCategoryName || 'N/A'} · Project: {exp.projectId || 'N/A'}
                                  </div>
                                ),
                                warningNote: 'Deleting this expense voucher will permanently remove the financial outflow record from Azure SQL.',
                                onConfirm: async () => {
                                  await deleteExpense(exp.id);
                                },
                              });
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 transition-colors"
                            title="Delete Expense"
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

      {/* ADD / EDIT EXPENSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-black text-white shadow-md">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isEditing ? 'Edit Expense Record' : '+ Add New Expense'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Record operational expenditure with relational project & client linking
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Exact 14 Fields strictly in order */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Expense ID (Auto-generated & read-only) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    1. Expense ID <span className="text-slate-800 dark:text-slate-200">(Auto-generated & read-only)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.id || ''}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-600 dark:text-slate-300 cursor-not-allowed"
                  />
                </div>

                {/* 2. Project ID (Dropdown containing "NA" as first option, followed dynamically by all Projects) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    2. Project ID <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <select
                    value={formData.projectId || 'NA'}
                    onChange={(e) => handleProjectChange(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
                  >
                    <option value="NA">NA - General / Non-Project Expense</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Client ID (Auto-filled & read-only) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    3. Client ID <span className="text-slate-800 dark:text-slate-200">(Auto-filled & read-only)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.clientId || 'NA'}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-slate-600 dark:text-slate-300 cursor-not-allowed"
                  />
                </div>

                {/* 4. Client Name (Auto-filled & read-only) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    4. Client Name <span className="text-slate-800 dark:text-slate-200">(Auto-filled & read-only)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.clientName || 'NA'}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-not-allowed"
                  />
                </div>

                {/* 5. Expense Category (Dropdown populated dynamically from active records in Expense Categories) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    5. Expense Category <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <select
                    value={formData.expenseCategoryId || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, expenseCategoryId: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
                  >
                    <option value="" disabled>-- Select Expense Category --</option>
                    {expenseCategories
                      .filter((c) => c.status === 'Active' || c.id === formData.expenseCategoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                  </select>
                </div>

                {/* 6. Vendor (Text input) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    6. Vendor <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.vendor || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vendor: e.target.value }))}
                    placeholder="e.g. Hostinger, AWS, Meta Ads, Local Vendor"
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* 7. Description (Text input / Textarea) */}
                <div className="md:col-span-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    7. Description
                  </label>
                  <input
                    type="text"
                    value={formData.description || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="e.g. Dedicated cloud server instance or annual Figma seat subscription"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* 8. Amount (Numeric input) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    8. Amount <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.amount ?? 0}
                    onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* 9. Currency (Dropdown) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    9. Currency <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <select
                    value={formData.currency || 'INR'}
                    onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
                  >
                    {CURRENCIES.map((curr) => (
                      <option key={curr} value={curr}>
                        {curr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 10. Exchange Rate (Numeric input) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    10. Exchange Rate <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.exchangeRate ?? 1}
                    onChange={(e) => handleRateChange(parseFloat(e.target.value) || 1)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* 11. Amount (INR) (Auto-calculated & read-only) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    11. Amount (INR) <span className="text-slate-800 dark:text-slate-200">(Auto-calculated: Amount * Rate)</span>
                  </label>
                  <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatINR(formData.amountINR || 0)}
                  </div>
                </div>

                {/* 12. Expense Date (Date picker) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    12. Expense Date <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.expenseDate || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, expenseDate: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* 13. Payment Status (Dropdown) */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    13. Payment Status <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <select
                    value={formData.paymentStatus || 'Paid'}
                    onChange={(e) => setFormData((prev) => ({ ...prev, paymentStatus: e.target.value as ExpensePaymentStatus }))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
                  >
                    {EXPENSE_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 14. Notes (Textarea) */}
                <div className="md:col-span-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    14. Notes
                  </label>
                  <textarea
                    rows={2}
                    value={formData.notes || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Enter audit notes, invoice serial numbers, or approval remarks..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {isEditing ? 'Save Changes' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
