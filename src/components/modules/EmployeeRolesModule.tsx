import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { EmployeeRole, CategoryStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import {
  ShieldCheck,
  CheckCircle,
  Users,
  Ban,
  Edit2,
  Trash2,
  X,
  BadgeCheck,
} from 'lucide-react';

export const EmployeeRolesModule: React.FC = () => {
  const {
    roles,
    employees,
    saveRole,
    deleteRole,
    confirmDelete,
    getRoleEmployeesCount,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<EmployeeRole> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // KPIs
  const totalRoles = roles.length;
  const activeRoles = roles.filter((r) => r.status === 'Active').length;
  const totalEmployeesAssigned = employees.length;
  const distinctDepts = new Set(roles.map((r) => r.department)).size;

  const kpis: KpiCardItem[] = [
    {
      label: 'Defined Positions',
      value: totalRoles,
      subtext: 'Engineering & marketing roles',
      icon: <ShieldCheck className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Active Roles',
      value: activeRoles,
      subtext: 'Assignable designations',
      icon: <CheckCircle className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Assigned Staff',
      value: totalEmployeesAssigned,
      subtext: 'Active team members',
      icon: <Users className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Departments',
      value: distinctDepts,
      subtext: 'Functional agency units',
      icon: <BadgeCheck className="w-4 h-4 text-slate-600" />,
    },
  ];

  // Filtered rows
  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      const matchesSearch =
        r.roleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [roles, searchTerm, statusFilter]);

  // Export CSV
  const handleExportCsv = () => {
    exportToCsv(
      filteredRoles,
      [
        { key: 'id', header: 'Role ID' },
        { key: 'roleName', header: 'Role Name' },
        { key: 'department', header: 'Department' },
        { key: 'description', header: 'Description' },
        {
          key: 'employeesCount',
          header: 'Assigned Employees',
          format: (r) => getRoleEmployeesCount(r.id),
        },
        { key: 'status', header: 'Status' },
      ],
      `${brandPrefix}_EmployeeRoles_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleOpenAdd = () => {
    setFormError(null);
    setEditingRole({
      brand: activeBrand,
      roleName: '',
      department: 'Software Engineering',
      status: 'Active',
      description: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (role: EmployeeRole) => {
    setFormError(null);
    setEditingRole({ ...role });
    setIsModalOpen(true);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    if (!editingRole.roleName?.trim()) {
      setFormError('Role Name is required.');
      return;
    }

    const duplicate = roles.find(
      (r) =>
        r.id !== editingRole.id &&
        r.roleName.trim().toLowerCase() === editingRole.roleName!.trim().toLowerCase()
    );
    if (duplicate) {
      setFormError(`A role named "${editingRole.roleName}" already exists.`);
      return;
    }

    const res = await saveRole({ ...editingRole, brand: editingRole.brand || activeBrand } as EmployeeRole);
    if (res.success) {
      setIsModalOpen(false);
      setEditingRole(null);
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save role');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Employee Roles & Job Hierarchy"
        moduleSubtitle="Technical positions, software engineering hierarchy, and digital marketing agency designations"
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
        addNewLabel="Add Employee Role"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredRoles.length}
      />

      {/* Roles Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Role ID</th>
                <th className="py-3 px-4">Role Title</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Role Scope & Description</th>
                <th className="py-3 px-4">Assigned Staff</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No roles matching your query.</p>
                  </td>
                </tr>
              ) : (
                filteredRoles.map((role) => {
                  const employeeCount = getRoleEmployeesCount(role.id);

                  return (
                    <tr
                      key={role.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                        {role.id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {role.roleName}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {role.department}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-sm">
                        {role.description || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono tabular-nums px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
                          {employeeCount} {employeeCount === 1 ? 'Employee' : 'Employees'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                            role.status === 'Active'
                              ? 'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {role.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(role)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Role"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              confirmDelete({
                                moduleName: 'Role',
                                recordTitle: role.roleName,
                                recordId: role.id,
                                warningNote: `Deleting role "${role.roleName}" will verify referential integrity against active employees in Azure SQL.`,
                                onConfirm: async () => {
                                  await deleteRole(role.id);
                                },
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Role (Protected if staff assigned)"
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

      {/* Add / Edit Role Modal */}
      {isModalOpen && editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingRole.id ? `Edit Role: ${editingRole.roleName}` : 'Add Employee Role'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Role ID: <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{editingRole.id || 'Auto-generated (e.g. ROL-006)'}</span>
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
                  Role Designation Title <span className="text-slate-800 dark:text-slate-200">* (Unique)</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingRole.roleName || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, roleName: e.target.value })}
                  placeholder="e.g. Full-Stack Developer"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  required
                  value={editingRole.department || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, department: e.target.value })}
                  placeholder="e.g. Software Engineering"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Job Scope & Responsibilities
                </label>
                <textarea
                  rows={3}
                  value={editingRole.description || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  placeholder="Key technical responsibilities, stack requirements, and deliverables..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={editingRole.status || 'Active'}
                  onChange={(e) =>
                    setEditingRole({
                      ...editingRole,
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
                  Save Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
