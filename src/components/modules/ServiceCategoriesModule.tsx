import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { ServiceCategory, CategoryStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import {
  Layers,
  CheckCircle,
  Cpu,
  Ban,
  Edit2,
  Trash2,
  X,
  FolderOpen,
} from 'lucide-react';

export const ServiceCategoriesModule: React.FC = () => {
  const {
    categories,
    saveCategory,
    deleteCategory,
    confirmDelete,
    getCategoryServicesCount,
    services,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<ServiceCategory> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // KPIs
  const totalCategories = categories.length;
  const activeCategories = categories.filter((c) => c.status === 'Active').length;
  const inactiveCategories = categories.filter((c) => c.status === 'Inactive').length;
  const totalServicesAcrossAll = services.length;

  const kpis: KpiCardItem[] = [
    {
      label: 'Service Categories',
      value: totalCategories,
      subtext: 'Hardware taxonomy domains',
      icon: <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Active Categories',
      value: activeCategories,
      subtext: 'Available for new services',
      icon: <CheckCircle className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Catalog Services',
      value: totalServicesAcrossAll,
      subtext: 'Linked across categories',
      icon: <Cpu className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Inactive Categories',
      value: inactiveCategories,
      subtext: 'Deprecated repair streams',
      icon: <Ban className="w-4 h-4 text-slate-400" />,
    },
  ];

  // Filtering
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const term = (searchTerm || '').toLowerCase().trim();
      const matchesSearch =
        !term ||
        (c.name || '').toLowerCase().includes(term) ||
        (c.id || '').toLowerCase().includes(term) ||
        (c.description && c.description.toLowerCase().includes(term));

      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [categories, searchTerm, statusFilter]);

  // Export CSV
  const handleExportCsv = () => {
    exportToCsv(
      filteredCategories,
      [
        { key: 'id', header: 'Category ID' },
        { key: 'name', header: 'Category Name' },
        { key: 'description', header: 'Description' },
        {
          key: 'servicesCount',
          header: 'Services Count',
          format: (r) => getCategoryServicesCount(r.id),
        },
        { key: 'status', header: 'Status' },
      ],
      `${brandPrefix}_ServiceCategories_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleOpenAdd = () => {
    setFormError(null);
    setEditingCategory({
      brand: activeBrand,
      name: '',
      description: '',
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: ServiceCategory) => {
    setFormError(null);
    setEditingCategory({ ...category });
    setIsModalOpen(true);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    if (!editingCategory.name?.trim()) {
      setFormError('Category Name is required.');
      return;
    }

    // Check unique category name (case-insensitive)
    const duplicate = categories.find(
      (c) =>
        c.id !== editingCategory.id &&
        c.name.trim().toLowerCase() === editingCategory.name!.trim().toLowerCase()
    );
    if (duplicate) {
      setFormError(`A category named "${editingCategory.name}" already exists. Category names must be strictly unique.`);
      return;
    }

    const res = await saveCategory({ ...editingCategory, brand: editingCategory.brand || activeBrand } as ServiceCategory);
    if (res.success) {
      setIsModalOpen(false);
      setEditingCategory(null);
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save category');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Service Categories"
        moduleSubtitle="Web apps, mobile development, performance marketing, UI/UX, and cloud engineering"
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
        addNewLabel="Add Service Category"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredCategories.length}
      />

      {/* Categories Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Category ID</th>
                <th className="py-3 px-4">Category Name</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Services Count</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No service categories found.</p>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => {
                  const servicesCount = getCategoryServicesCount(cat.id);

                  return (
                    <tr
                      key={cat.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                        {cat.id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {cat.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-md">
                        {cat.description || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono tabular-nums px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
                          {servicesCount} {servicesCount === 1 ? 'Service' : 'Services'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                            cat.status === 'Active'
                              ? 'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {cat.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(cat)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Category"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              confirmDelete({
                                moduleName: 'Category',
                                recordTitle: cat.name,
                                recordId: cat.id,
                                warningNote: `Deleting category "${cat.name}" will verify referential integrity against linked services in Azure SQL.`,
                                onConfirm: async () => {
                                  await deleteCategory(cat.id);
                                },
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Category (Blocked if linked to services)"
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

      {/* Add / Edit Category Modal */}
      {isModalOpen && editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingCategory.id ? `Edit Category: ${editingCategory.name}` : 'New Service Category'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Category ID: <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{editingCategory.id || 'Auto-generated (e.g. CAT-006)'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category Name <span className="text-slate-800 dark:text-slate-200">* (Must be strictly unique)</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingCategory.name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="e.g. Web & Custom Software Development"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editingCategory.description || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  placeholder="Outline development stack, marketing channels, deliverable scope, or cloud architecture involved..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={editingCategory.status || 'Active'}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      status: e.target.value as CategoryStatus,
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

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
                  className="px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-neutral-800 active:bg-neutral-900 rounded-lg shadow-sm transition-colors"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
