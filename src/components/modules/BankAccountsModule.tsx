import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { BankAccount, BankAccountType, BankAccountStatus, BrandName } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate } from '../../utils/formatters';
import {
  Landmark,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  X,
  CreditCard,
  Copy,
  Check,
  Building,
  Wallet,
  ShieldAlert,
  ArrowDownLeft,
  ExternalLink,
} from 'lucide-react';

const ACCOUNT_TYPES: BankAccountType[] = ['Current', 'Savings', 'Crypto Wallet', 'Escrow', 'Other'];
const ACCOUNT_STATUSES: BankAccountStatus[] = ['Active', 'Inactive'];

export const BankAccountsModule: React.FC = () => {
  const {
    bankAccounts,
    payments,
    saveBankAccount,
    deleteBankAccount,
    confirmDelete,
    activeBrand,
    brandPrefix,
    isConsolidatedView,
    hasPermission,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<BankAccount>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Compute revenue credited to each bank account from payments
  const accountCollectionsMap = useMemo(() => {
    const map: Record<string, { totalINR: number; count: number }> = {};
    payments.forEach((p) => {
      if (p.bankAccountId && p.paymentStatus === 'Received') {
        if (!map[p.bankAccountId]) {
          map[p.bankAccountId] = { totalINR: 0, count: 0 };
        }
        map[p.bankAccountId].totalINR += Number(p.amountINR) || 0;
        map[p.bankAccountId].count += 1;
      }
    });
    return map;
  }, [payments]);

  // Overall KPIs (Monochrome ERPNext Desk UI)
  const totalAccounts = bankAccounts.length;
  const activeCount = bankAccounts.filter((b) => b.status === 'Active').length;
  const totalInflowAllINR = Object.values(accountCollectionsMap).reduce((acc, curr) => acc + curr.totalINR, 0);
  const totalCryptoCount = bankAccounts.filter((b) => b.accountType === 'Crypto Wallet').length;

  const kpis: KpiCardItem[] = [
    {
      label: 'Registered Bank Accounts',
      value: totalAccounts,
      subtext: `${activeCount} active for ${isConsolidatedView ? 'all brands' : activeBrand}`,
      icon: <Landmark className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Total Revenue Credited',
      value: formatINR(totalInflowAllINR),
      subtext: 'Reconciled settlements across accounts',
      icon: <ArrowDownLeft className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Active Operating Accounts',
      value: `${activeCount} / ${totalAccounts}`,
      subtext: 'Enabled for payment receiving & invoice tagging',
      icon: <CheckCircle className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Crypto & Digital Wallets',
      value: totalCryptoCount,
      subtext: 'USDT TRC20 / Web3 corporate clearing',
      icon: <Wallet className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
  ];

  // Filtering
  const filteredBankAccounts = useMemo(() => {
    return bankAccounts.filter((b) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        b.accountName.toLowerCase().includes(q) ||
        b.bankName.toLowerCase().includes(q) ||
        b.accountNumber.toLowerCase().includes(q) ||
        (b.ifscCode && b.ifscCode.toLowerCase().includes(q)) ||
        (b.upiId && b.upiId.toLowerCase().includes(q)) ||
        (b.branchName && b.branchName.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || b.accountType === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [bankAccounts, searchTerm, statusFilter, typeFilter]);

  // Modal handlers
  const handleOpenAddModal = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      brand: activeBrand,
      accountName: '',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branchName: '',
      upiId: '',
      accountType: 'Current',
      status: 'Active',
      notes: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc: BankAccount) => {
    setIsEditing(true);
    setFormData({ ...acc });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.accountName?.trim()) {
      setFormError('Account Name / Label is required.');
      return;
    }
    if (!formData.bankName?.trim()) {
      setFormError('Bank or Institution Name is required.');
      return;
    }
    if (!formData.accountNumber?.trim()) {
      setFormError('Account Number or Wallet Address is required.');
      return;
    }

    const payload: BankAccount = {
      id: formData.id || '',
      brand: (formData.brand as BrandName) || activeBrand,
      accountName: formData.accountName.trim(),
      bankName: formData.bankName.trim(),
      accountNumber: formData.accountNumber.trim(),
      ifscCode: formData.ifscCode?.trim() || '',
      branchName: formData.branchName?.trim() || '',
      upiId: formData.upiId?.trim() || '',
      accountType: (formData.accountType as BankAccountType) || 'Current',
      status: (formData.status as BankAccountStatus) || 'Active',
      notes: formData.notes?.trim() || '',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await saveBankAccount(payload);
    if (res.success) {
      setIsModalOpen(false);
    } else {
      setFormError(res.error || 'Failed to save bank account.');
    }
  };

  const handleDeleteClick = (acc: BankAccount) => {
    confirmDelete({
      moduleName: 'Bank Account',
      recordTitle: `${acc.accountName} (${acc.bankName})`,
      recordId: acc.id,
      details: (
        <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 mt-1">
          Account: {acc.accountNumber} · {acc.brand}
        </div>
      ),
      warningNote: 'Deleting this bank account will verify referential integrity against tagged client payment records in Azure SQL.',
      onConfirm: async () => {
        await deleteBankAccount(acc.id);
      },
    });
  };

  // CSV Export
  const handleExportCsv = () => {
    const columns = [
      { key: 'id', header: 'Account ID' },
      { key: 'brand', header: 'Brand' },
      { key: 'accountName', header: 'Account Label' },
      { key: 'bankName', header: 'Bank / Institution' },
      { key: 'accountNumber', header: 'Account / Wallet Number' },
      { key: 'ifscCode', header: 'IFSC / SWIFT' },
      { key: 'branchName', header: 'Branch / Network' },
      { key: 'upiId', header: 'UPI ID' },
      { key: 'accountType', header: 'Account Type' },
      { key: 'status', header: 'Status' },
      {
        key: 'id',
        header: 'Total Inflow (INR)',
        format: (row: BankAccount) => accountCollectionsMap[row.id]?.totalINR || 0,
      },
      {
        key: 'id',
        header: 'Transactions Count',
        format: (row: BankAccount) => accountCollectionsMap[row.id]?.count || 0,
      },
      { key: 'notes', header: 'Notes' },
    ];
    exportToCsv(
      filteredBankAccounts,
      columns,
      `${brandPrefix}_bank_accounts_register_${new Date().toISOString().slice(0, 10)}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Module Toolbar */}
      <CommonModuleToolbar
        moduleTitle="Bank & Treasury Accounts"
        moduleSubtitle="Manage institutional corporate bank accounts, settlement gateways, and crypto wallets associated with each brand"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { label: 'All Statuses', value: 'ALL' },
          { label: 'Active', value: 'Active' },
          { label: 'Inactive', value: 'Inactive' },
        ]}
        onAddNew={handleOpenAddModal}
        onExportCsv={handleExportCsv}
        addNewLabel="Add Bank Account"
        totalFilteredCount={filteredBankAccounts.length}
        childrenSecondaryFilters={
          <div className="relative flex items-center">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
            >
              <option value="ALL">All Account Types</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Accounts High-Density Table Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Account ID & Label</th>
                <th className="py-3 px-4">Bank / Provider</th>
                <th className="py-3 px-4">Account / Wallet Number</th>
                <th className="py-3 px-4">IFSC / Routing / UPI</th>
                <th className="py-3 px-4">Brand</th>
                <th className="py-3 px-4">Account Type</th>
                <th className="py-3 px-4 text-right">Inward Settled</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredBankAccounts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Landmark className="w-8 h-8 opacity-40 text-slate-400" />
                      <p className="font-medium text-sm">No bank accounts found</p>
                      <p className="text-xs">Click "Add Bank Account" to configure an institutional receiving account.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBankAccounts.map((account) => {
                  const inflow = accountCollectionsMap[account.id] || { totalINR: 0, count: 0 };
                  const isCopied = copiedId === account.id;

                  return (
                    <tr
                      key={account.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. ID & Label */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{account.accountName}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mt-0.5">
                          {account.id}
                        </div>
                      </td>

                      {/* 2. Bank / Provider & Branch */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{account.bankName}</span>
                        </div>
                        {account.branchName && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {account.branchName}
                          </div>
                        )}
                      </td>

                      {/* 3. Account / Wallet Number */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 font-medium">
                          <span>{account.accountNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(account.accountNumber, account.id)}
                            className="p-1 rounded text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Copy Account Number / Address"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {account.notes && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-xs mt-0.5" title={account.notes}>
                            {account.notes}
                          </div>
                        )}
                      </td>

                      {/* 4. IFSC / SWIFT / UPI */}
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {account.ifscCode && (
                          <div className="text-slate-700 dark:text-slate-300">
                            <span className="text-[10px] text-slate-400 font-sans mr-1">IFSC:</span>
                            {account.ifscCode}
                          </div>
                        )}
                        {account.upiId && (
                          <div className="text-slate-900 dark:text-slate-100 font-medium mt-0.5">
                            <span className="text-[10px] text-slate-400 font-sans mr-1">UPI:</span>
                            {account.upiId}
                          </div>
                        )}
                        {!account.ifscCode && !account.upiId && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 5. Brand */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                          {account.brand}
                        </span>
                      </td>

                      {/* 6. Account Type (Monochrome) */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                          {account.accountType}
                        </span>
                      </td>

                      {/* 7. Inward Settled */}
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatINR(inflow.totalINR)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {inflow.count} payment{inflow.count === 1 ? '' : 's'}
                        </div>
                      </td>

                      {/* 8. Status (Monochrome ERPNext Style) */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            account.status === 'Active'
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {account.status === 'Active' ? (
                            <CheckCircle className="w-3 h-3 text-white dark:text-slate-900" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-400" />
                          )}
                          <span>{account.status}</span>
                        </span>
                      </td>

                      {/* 9. Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(account)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Bank Account"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(account)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Bank Account"
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

      {/* Add / Edit Bank Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isEditing ? 'Edit Bank Account' : 'Add New Bank Account'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Associated Brand: <span className="font-semibold text-slate-900 dark:text-slate-100">{formData.brand || activeBrand}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Banner */}
            {formError && (
              <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-slate-800 dark:text-slate-200" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Account Name / Label */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Label / Name <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.accountName || ''}
                    onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                    placeholder="e.g. Primary Operating Account"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  />
                </div>

                {/* Bank or Provider Name */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bank / Institution Name <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.bankName || ''}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    placeholder="e.g. HDFC Bank, ICICI Bank, Tether TRC20"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  />
                </div>

                {/* Account / Wallet Number */}
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Number / Wallet Address <span className="text-slate-800 dark:text-slate-200">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.accountNumber || ''}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    placeholder="e.g. 50200012345678 or TR7NHqjeKQxGTCi8q8ZY..."
                    className="w-full px-3 py-2 font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  />
                </div>

                {/* IFSC / SWIFT Code (Optional) */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    IFSC / SWIFT / Routing Code <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.ifscCode || ''}
                    onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                    placeholder="e.g. HDFC0001234"
                    className="w-full px-3 py-2 font-mono uppercase rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  />
                </div>

                {/* UPI ID (Optional) */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    UPI ID / VPA <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.upiId || ''}
                    onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                    placeholder="e.g. devicedoctor@hdfcbank"
                    className="w-full px-3 py-2 font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  />
                </div>

                {/* Branch / Network (Optional) */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Branch Name / Network <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.branchName || ''}
                    onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                    placeholder="e.g. Connaught Place, New Delhi or TRC20"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Type
                  </label>
                  <select
                    value={formData.accountType || 'Current'}
                    onChange={(e) => setFormData({ ...formData, accountType: e.target.value as BankAccountType })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Brand Association */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Brand Association
                  </label>
                  <select
                    value={formData.brand || activeBrand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value as BrandName })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  >
                    <option value="Device Doctor India">Device Doctor India</option>
                    <option value="Codestro">Codestro</option>
                    <option value="FX Launch Pad">FX Launch Pad</option>
                    <option value="DUNS">DUNS</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status || 'Active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as BankAccountStatus })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
                  >
                    {ACCOUNT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes (Optional) */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Internal Notes / Usage Guidelines <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Primary INR client collections account for GST invoices"
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-semibold shadow-xs transition-colors"
                >
                  {isEditing ? 'Update Account' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
