import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { Service, ServiceStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import {
  Code,
  CheckCircle,
  Layers,
  Briefcase,
  Edit2,
  Trash2,
  X,
  Filter,
} from 'lucide-react';

/**
 * Checks if a string matches the standard 36-character hexadecimal UUID format.
 * Used to avoid displaying raw database GUIDs in the user-facing ERPNext desk UI.
 */
const isUuid = (val?: string | null): boolean => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
};

export const ServicesModule: React.FC = () => {
  const {
    services,
    categories,
    saveService,
    deleteService,
    confirmDelete,
    getCategoryById,
    getServiceProjectsCount,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modal form (Strictly 5 fields: id, name, categoryId, description, status)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Partial<Service> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // KPIs (IT solutions priced per project/client)
  const totalServices = services.length;
  const activeServices = services.filter((s) => s.status === 'Active').length;

  const distinctCategoriesCount = useMemo(() => {
    const unique = new Set(
      services
        .map((s) => {
          const category = getCategoryById(s.categoryId);
          return (category?.name || s.categoryName || s.category_name || s.categoryId || '').trim();
        })
        .filter(Boolean)
    );
    return unique.size;
  }, [services, getCategoryById]);

  const totalAssociatedProjects = services.reduce(
    (acc, s) => acc + getServiceProjectsCount(s.id),
    0
  );

  const kpis: KpiCardItem[] = [
    {
      label: 'Agency Services',
      value: totalServices,
      subtext: 'Software & marketing offerings',
      icon: <Code className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Active Offerings',
      value: activeServices,
      subtext: 'Available for client proposals',
      icon: <CheckCircle className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Specialty Categories',
      value: distinctCategoriesCount,
      subtext: 'Web, mobile, SEO, UI/UX, cloud',
      icon: <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Client Project Deployments',
      value: totalAssociatedProjects,
      subtext: 'Active enterprise contracts',
      icon: <Briefcase className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
  ];

  // Filtered rows
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const category = getCategoryById(s.categoryId);
      const catName = (category?.name || s.categoryName || s.category_name || '').toLowerCase();
      const sId = (s.id || '').toLowerCase();
      const sName = (s.name || '').toLowerCase();
      const sDesc = (s.description || '').toLowerCase();
      const q = searchTerm.toLowerCase();

      const matchesSearch =
        sName.includes(q) ||
        sId.includes(q) ||
        sDesc.includes(q) ||
        catName.includes(q);

      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      const matchesCategory =
        categoryFilter === 'ALL' ||
        s.categoryId === categoryFilter ||
        (category && category.id === categoryFilter) ||
        (catName && catName === categoryFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [services, searchTerm, statusFilter, categoryFilter, getCategoryById]);

  // Export CSV (Strictly 5 fields + linked counts)
  const handleExportCsv = () => {
    exportToCsv(
      filteredServices,
      [
        { key: 'id', header: 'Service ID' },
        { key: 'name', header: 'Service Name' },
        {
          key: 'category',
          header: 'Category Name',
          format: (r) => {
            const cat = getCategoryById(r.categoryId);
            return cat?.name || r.categoryName || r.category_name || 'Unassigned';
          },
        },
        {
          key: 'categoryId',
          header: 'Category ID',
          format: (r) => {
            const cat = getCategoryById(r.categoryId);
            const code = cat?.id || r.categoryId;
            return code && !isUuid(code) ? code : '—';
          },
        },
        { key: 'description', header: 'Description' },
        { key: 'status', header: 'Status' },
        {
          key: 'linkedProjects',
          header: 'Active Projects',
          format: (r) => getServiceProjectsCount(r.id),
        },
      ],
      `${brandPrefix}_Services_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleOpenAdd = () => {
    setFormError(null);
    setEditingService({
      brand: activeBrand,
      name: '',
      categoryId: categories.length > 0 ? categories[0].id : '',
      description: '',
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (srv: Service) => {
    setFormError(null);
    setEditingService({
      id: srv.id,
      brand: srv.brand || activeBrand,
      name: srv.name,
      categoryId: srv.categoryId,
      categoryName: srv.categoryName,
      category_name: srv.category_name,
      description: srv.description,
      status: srv.status,
    });
    setIsModalOpen(true);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;

    if (!editingService.name?.trim()) {
      setFormError('Service Name is required.');
      return;
    }
    if (!editingService.categoryId) {
      setFormError('Please select a valid Service Category.');
      return;
    }

    const res = await saveService({ ...editingService, brand: editingService.brand || activeBrand } as Service);
    if (res.success) {
      setIsModalOpen(false);
      setEditingService(null);
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save service');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Agency Services Catalog"
        moduleSubtitle="IT solutions, custom software development, mobile apps, and digital marketing capabilities"
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
        addNewLabel="Add Service Offering"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredServices.length}
        childrenSecondaryFilters={
          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100 cursor-pointer appearance-none max-w-[200px] truncate"
              title="Filter by Service Category"
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Services Table - strictly contains 5 fields + relational link + action */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Service ID</th>
                <th className="py-3 px-4">Service Name</th>
                <th className="py-3 px-4">Category (Relational Link)</th>
                <th className="py-3 px-4">Description & Scope</th>
                <th className="py-3 px-4">Linked Projects</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Code className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No agency services match your current query.</p>
                  </td>
                </tr>
              ) : (
                filteredServices.map((srv) => {
                  const category = getCategoryById(srv.categoryId);
                  const resolvedCategoryName = (category?.name || srv.categoryName || srv.category_name || '').trim();
                  const hasCategory = Boolean(resolvedCategoryName && resolvedCategoryName !== 'Unassigned');

                  // Extract clean human-readable code (e.g. DDI-CAT-001), strictly suppress raw database UUIDs
                  const displayCategoryCode = (() => {
                    if (category?.id && !isUuid(category.id)) return category.id;
                    if (category?.category_id_code && !isUuid(category.category_id_code)) return category.category_id_code;
                    if (srv.categoryId && !isUuid(srv.categoryId)) return srv.categoryId;
                    return null;
                  })();

                  const linkedProjectsCount = getServiceProjectsCount(srv.id);

                  return (
                    <tr
                      key={srv.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {srv.id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {srv.name}
                      </td>
                      <td className="py-3.5 px-4">
                        {hasCategory ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {resolvedCategoryName}
                            </span>
                            {displayCategoryCode && (
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                ({displayCategoryCode})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-md">
                        {srv.description || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            linkedProjectsCount > 0
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {linkedProjectsCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                            srv.status === 'Active'
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700'
                              : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {srv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(srv)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Service"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              confirmDelete({
                                moduleName: 'Service',
                                recordTitle: srv.name,
                                recordId: srv.id,
                                warningNote: `Deleting service "${srv.name}" will verify referential integrity against active projects in Azure SQL.`,
                                onConfirm: async () => {
                                  await deleteService(srv.id);
                                },
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Service (Protected if active in projects)"
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

      {/* Add / Edit Service Modal - strictly 5 fields as specified */}
      {isModalOpen && editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingService.id ? `Edit Service: ${editingService.name}` : 'New IT & Agency Service'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  1. Service ID: <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">{editingService.id || 'Auto-generated (e.g. SRV-007)'}</span>
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
                <div className="p-3 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                  {formError}
                </div>
              )}

              {/* 2. Service Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. Service Name <span className="text-slate-900 dark:text-slate-100">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingService.name || ''}
                  onChange={(e) => setEditingService({ ...editingService, name: e.target.value })}
                  placeholder="e.g. Full-Stack React & Node.js Web App"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
                />
              </div>

              {/* 3. Category (Dropdown linked strictly by Category ID) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  3. Service Category (Relational Foreign Key) <span className="text-slate-900 dark:text-slate-100">*</span>
                </label>
                <select
                  required
                  value={editingService.categoryId || ''}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const cat = categories.find((c) => c.id === selId);
                    setEditingService({
                      ...editingService,
                      categoryId: selId,
                      categoryName: cat?.name || '',
                      category_name: cat?.name || '',
                    });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
                >
                  <option value="" disabled>
                    -- Select Category by ID --
                  </option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {!isUuid(cat.id) ? `(${cat.id})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Linked strictly by Category ID. Relational joins resolve category name instantly across all views.
                </p>
              </div>

              {/* 4. Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  4. Service Description & Scope
                </label>
                <textarea
                  rows={3}
                  value={editingService.description || ''}
                  onChange={(e) => setEditingService({ ...editingService, description: e.target.value })}
                  placeholder="Specify technology stack (e.g. Next.js, Flutter, AWS), core deliverables, architecture patterns, and SLA milestones..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
                />
              </div>

              {/* 5. Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  5. Status
                </label>
                <select
                  value={editingService.status || 'Active'}
                  onChange={(e) =>
                    setEditingService({
                      ...editingService,
                      status: e.target.value as ServiceStatus,
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
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
                  className="px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-neutral-800 active:bg-neutral-900 rounded-lg shadow-xs transition-colors"
                >
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
