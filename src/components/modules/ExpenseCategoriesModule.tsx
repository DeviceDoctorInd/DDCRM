import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { ExpenseCategory, ExpenseCategoryStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import {
  Tags,
  CheckCircle,
  Ban,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  FileText,
  Hash,
  Activity,
  Layers,
} from 'lucide-react';

export const ExpenseCategoriesModule: React.FC = () => {
  const {
    expenseCategories,
    saveExpenseCategory,
    deleteExpenseCategory,
    setExpenseCategoryStatus,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<ExpenseCategory>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteCandidate, setDeleteCandidate] = useState<ExpenseCategory | null>(null);

  // Top Summary KPIs
  const totalCategories = expenseCategories.length;
  const activeCategories = expenseCategories.filter((c) => c.status === 'Active').length;
  const inactiveCategories = expenseCategories.filter((c) => c.status === 'Inactive').length;

  const kpis: KpiCardItem[] = [
    {
      label: 'Total Expense Categories',
      value: totalCategories,
      subtext: 'Operational expense ledger domains',
      icon: <Tags className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'Active Categories',
      value: activeCategories,
      subtext: 'Available for expense bookings',
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Inactive Categories',
      value: inactiveCategories,
      subtext: 'Archived expense categories',
      icon: <Ban className="w-4 h-4 text-slate-400" />,
    },
  ];

  // Filtered Expense Categories
  const filteredCategories = useMemo(() => {
    return expenseCategories.filter((c) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        c.id.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        (c.description && c.description.toLowerCase().includes(term));

      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [expenseCategories, searchTerm, statusFilter]);

  // Export CSV
  const handleExportCsv = () => {
    exportToCsv(
      filteredCategories,
      [
        { key: 'id', header: 'Expense Category ID' },
        { key: 'name', header: 'Category Name' },
        { key: 'description', header: 'Description' },
        { key: 'status', header: 'Status' },
        { key: 'createdAt', header: 'Created At' },
      ],
      `${brandPrefix}_expense_categories_${new Date().toISOString().slice(0, 10)}`
    );
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormError(null);
    const newId = storageService.generateId('EXPCAT', activeBrand);

    setFormData({
      id: newId,
      brand: activeBrand,
      name: '',
      description: '',
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (category: ExpenseCategory) => {
    setIsEditing(true);
    setFormError(null);
    setFormData({ ...category });
    setIsModalOpen(true);
  };

  // Form Submit Handler
  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name || !formData.name.trim()) {
      setFormError('Category Name is required.');
      return;
    }
    const trimmedName = formData.name.trim();

    // Enforce strictly UNIQUE validation (case-insensitive)
    const duplicate = expenseCategories.find(
      (c) =>
        c.id !== formData.id &&
        c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setFormError(`An expense category named "${trimmedName}" already exists. Category names must be strictly unique.`);
      return;
    }

    const payload: ExpenseCategory = {
      id: formData.id || storageService.generateId('EXPCAT', activeBrand),
      brand: formData.brand || activeBrand,
      name: trimmedName,
      description: formData.description?.trim() || '',
      status: formData.status || 'Active',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await saveExpenseCategory(payload);
    if (res.success) {
      setIsModalOpen(false);
      setFormData({});
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save expense category.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Toolbar with KPIs & Search */}
      <CommonModuleToolbar
        moduleTitle="Expense Categories"
        moduleSubtitle="Corporate expense taxonomy, overhead classifications, and operational cost accounting categories"
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
        onAddNew={handleOpenAdd}
        addNewLabel="+ Add Expense Category"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredCategories.length}
      />

      {/* Expense Categories Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-40">Expense Category ID</th>
                <th className="py-3 px-4 w-52">Category Name</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 w-28 text-center">Status</th>
                <th className="py-3 px-4 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Tags className="w-8 h-8 opacity-40 text-slate-400" />
                      <p className="text-sm">No expense categories found matching your query.</p>
                      <button
                        type="button"
                        onClick={handleOpenAdd}
                        className="mt-2 text-xs text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 font-semibold"
                      >
                        + Add Expense Category
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* 1. Category ID */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-cyan-600 dark:text-cyan-400">
                      {cat.id}
                    </td>

                    {/* 2. Category Name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {cat.name}
                        </span>
                      </div>
                    </td>

                    {/* 3. Description */}
                    <td className="py-3 px-4 max-w-md">
                      {cat.description ? (
                        <span className="text-slate-600 dark:text-slate-400 line-clamp-2">
                          {cat.description}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 italic">
                          No description provided
                        </span>
                      )}
                    </td>

                    {/* 4. Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {cat.status === 'Active' ? (
                        <button
                          type="button"
                          onClick={() => setExpenseCategoryStatus(cat.id, 'Inactive')}
                          title="Click to toggle to Inactive"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Active
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpenseCategoryStatus(cat.id, 'Active')}
                          title="Click to toggle to Active"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          <Ban className="w-3 h-3" />
                          Inactive
                        </button>
                      )}
                    </td>

                    {/* 5. Actions */}
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(cat)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                          title="Edit Category"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteCandidate(cat)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT EXPENSE CATEGORY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-600 text-white shadow-md">
                  <Tags className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isEditing ? 'Edit Expense Category' : '+ Add Expense Category'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure operational cost taxonomy for corporate accounting
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

            {/* Modal Form */}
            <form onSubmit={handleSaveSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Expense Category ID (Auto-generated & read-only) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  1. Expense Category ID (Auto-generated)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.id || ''}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-cyan-600 dark:text-cyan-400 cursor-not-allowed"
                />
              </div>

              {/* 2. Category Name (Required, strictly UNIQUE) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Tags className="w-3.5 h-3.5 text-cyan-600" />
                    2. Category Name <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                    Strictly unique across categories
                  </span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Hosting, Domain, Advertising, Office"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none font-medium"
                />
              </div>

              {/* 3. Description (Textarea, optional) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-600" />
                  3. Description <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.description || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. Cloud server hosting, virtual instances, container clusters, and storage buckets."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none"
                />
              </div>

              {/* 4. Status (Dropdown: Active, Inactive) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-600" />
                  4. Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.status || 'Active'}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      status: e.target.value as ExpenseCategoryStatus,
                    }))
                  }
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  <option value="Active">Active (Available for expense bookings)</option>
                  <option value="Inactive">Inactive (Disabled for new bookings)</option>
                </select>
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
                  className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isEditing ? 'Save Category' : 'Create Category'}
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
                  Delete Expense Category
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ID: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{deleteCandidate.id}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete expense category{' '}
              <strong className="text-slate-900 dark:text-white">"{deleteCandidate.name}"</strong>?
              If this category has recorded expenses, deletion will be blocked by referential integrity rules.
            </p>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setExpenseCategoryStatus(deleteCandidate.id, 'Inactive');
                  setDeleteCandidate(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800 transition-colors"
              >
                Mark Inactive Instead
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteCandidate(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteExpenseCategory(deleteCandidate.id);
                    setDeleteCandidate(null);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
