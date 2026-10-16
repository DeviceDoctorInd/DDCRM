import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { Employee, EmployeeStatus, EmployeeType, TdsOption } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatDate, formatINR } from '../../utils/formatters';
import {
  Users,
  CheckCircle,
  XCircle,
  IndianRupee,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Briefcase,
  Calendar,
  Mail,
  FileText,
  BadgePercent,
  Calculator,
} from 'lucide-react';
import { storageService } from '../../services/storageService';

export const EmployeesModule: React.FC = () => {
  const {
    employees,
    roles,
    saveEmployee,
    deleteEmployee,
    getRoleById,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Exact 10 Fields Form State
  const [formData, setFormData] = useState<{
    id: string;
    name: string;
    roleId: string;
    email: string;
    status: EmployeeStatus;
    joiningDate: string;
    costOfEmployee: number;
    employeeType: EmployeeType;
    comesUnderTds: TdsOption;
    notes: string;
  }>({
    id: '',
    name: '',
    roleId: '',
    email: '',
    status: 'Active',
    joiningDate: new Date().toISOString().slice(0, 10),
    costOfEmployee: 0,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: '',
  });

  // KPIs
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.status === 'Active').length;
  const totalCostOfEmployees = employees
    .filter((e) => e.status === 'Active')
    .reduce((sum, e) => sum + (e.costOfEmployee ?? e.monthlyCost ?? e.salary ?? 0), 0);
  const avgCostPerEmployee = activeEmployees > 0 ? Math.round(totalCostOfEmployees / activeEmployees) : 0;

  const kpis: KpiCardItem[] = [
    {
      label: 'Total Employees',
      value: totalEmployees,
      subtext: 'IT & digital marketing team',
      icon: <Users className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'Active Staff',
      value: activeEmployees,
      subtext: 'Active payroll & contracts',
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Total Cost of Employees',
      value: formatINR(totalCostOfEmployees),
      subtext: 'Monthly active team cost',
      icon: <IndianRupee className="w-4 h-4 text-blue-600" />,
    },
    {
      label: 'Avg Cost per Employee',
      value: formatINR(avgCostPerEmployee),
      subtext: 'Average monthly allocation',
      icon: <Calculator className="w-4 h-4 text-amber-500" />,
    },
  ];

  // Active roles for dynamic dropdown sync
  const availableRoles = useMemo(() => {
    return roles.filter((r) => r.status === 'Active' || r.id === formData.roleId);
  }, [roles, formData.roleId]);

  // Filtered rows
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const role = getRoleById(emp.roleId);

      const matchesSearch =
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.notes && emp.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.employeeType && emp.employeeType.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (role && role.roleName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || emp.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [employees, searchTerm, statusFilter, getRoleById]);

  // Export CSV matching exact 10 fields
  const handleExportCsv = () => {
    exportToCsv(
      filteredEmployees,
      [
        { key: 'id', header: 'Employee ID' },
        { key: 'name', header: 'Employee Name' },
        {
          key: 'role',
          header: 'Role',
          format: (r) => {
            const role = getRoleById(r.roleId);
            return role ? `${role.roleName} (${role.id})` : r.roleId;
          },
        },
        { key: 'email', header: 'Email' },
        { key: 'status', header: 'Active' },
        {
          key: 'joiningDate',
          header: 'Joining Date',
          format: (r) => r.joiningDate || r.joinedDate || '',
        },
        {
          key: 'costOfEmployee',
          header: 'Cost of Employee (INR)',
          format: (r) => {
            const cost = r.costOfEmployee ?? r.monthlyCost ?? r.salary ?? 0;
            return `₹${cost.toLocaleString('en-IN')}`;
          },
        },
        { key: 'employeeType', header: 'Employee Type' },
        { key: 'comesUnderTds', header: 'Comes Under TDS' },
        { key: 'notes', header: 'Notes', format: (r) => r.notes || '' },
      ],
      `${brandPrefix}_Employees_Directory_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleOpenAdd = () => {
    setFormError(null);
    setIsEditing(false);

    // Auto-generate fresh Employee ID
    const freshId = storageService.generateId('EMP', activeBrand);
    const firstRoleId = roles.find((r) => r.status === 'Active')?.id || (roles[0]?.id ?? '');

    setFormData({
      id: freshId,
      name: '',
      roleId: firstRoleId,
      email: '',
      status: 'Active',
      joiningDate: new Date().toISOString().slice(0, 10),
      costOfEmployee: 85000,
      employeeType: 'Salary Basis',
      comesUnderTds: 'Yes',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setFormError(null);
    setIsEditing(true);

    const cost = emp.costOfEmployee ?? emp.monthlyCost ?? emp.salary ?? 0;

    setFormData({
      id: emp.id,
      name: emp.name,
      roleId: emp.roleId,
      email: emp.email,
      status: emp.status || 'Active',
      joiningDate: emp.joiningDate || emp.joinedDate || new Date().toISOString().slice(0, 10),
      costOfEmployee: cost,
      employeeType: emp.employeeType || 'Salary Basis',
      comesUnderTds: emp.comesUnderTds || 'Yes',
      notes: emp.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Employee Name validation
    if (!formData.name.trim()) {
      setFormError('Employee Name is required.');
      return;
    }

    // 2. Role validation
    if (!formData.roleId) {
      setFormError('Please select a valid Employee Role.');
      return;
    }

    // 3. Email validation & strict uniqueness check
    const cleanEmail = formData.email.trim().toLowerCase();
    if (!cleanEmail) {
      setFormError('Email address is required.');
      return;
    }
    const duplicateEmail = employees.find(
      (e) => e.id !== formData.id && e.email?.trim().toLowerCase() === cleanEmail
    );
    if (duplicateEmail) {
      setFormError(
        `Email "${formData.email.trim()}" is already registered to Employee "${duplicateEmail.name}" (${duplicateEmail.id}). Email must be strictly unique across all employees.`
      );
      return;
    }

    const costVal = Number(formData.costOfEmployee) || 0;

    const payload: Employee = {
      id: formData.id,
      brand: activeBrand,
      name: formData.name.trim(),
      roleId: formData.roleId,
      email: cleanEmail,
      status: formData.status,
      joiningDate: formData.joiningDate,
      costOfEmployee: costVal,
      salary: costVal,
      monthlyCost: costVal,
      employeeType: formData.employeeType,
      comesUnderTds: formData.comesUnderTds,
      notes: formData.notes.trim(),
      joinedDate: formData.joiningDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = saveEmployee(payload);
    if (res.success) {
      setIsModalOpen(false);
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save employee.');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Employees Directory"
        moduleSubtitle="Software engineers, mobile app developers, UI/UX designers, and IT marketing specialists"
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
        addNewLabel="Onboard Employee"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredEmployees.length}
      />

      {/* Employees Table - Exact 10 Columns + Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1050px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5">1. Employee ID</th>
                <th className="py-3 px-3.5">2. Employee Name</th>
                <th className="py-3 px-3.5">3. Role</th>
                <th className="py-3 px-3.5">4. Email</th>
                <th className="py-3 px-3.5">5. Active</th>
                <th className="py-3 px-3.5">6. Joining Date</th>
                <th className="py-3 px-3.5 text-right">7. Cost of Employee (INR)</th>
                <th className="py-3 px-3.5">8. Employee Type</th>
                <th className="py-3 px-3.5 text-center">9. TDS</th>
                <th className="py-3 px-3.5">10. Notes</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No employees found matching criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const role = getRoleById(emp.roleId);
                  const cost = emp.costOfEmployee ?? emp.monthlyCost ?? emp.salary ?? 0;

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Employee ID */}
                      <td className="py-3 px-3.5 font-mono font-semibold text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                        {emp.id}
                      </td>

                      {/* 2. Employee Name */}
                      <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {emp.name}
                      </td>

                      {/* 3. Role */}
                      <td className="py-3 px-3.5">
                        {role ? (
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {role.roleName}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {role.id}
                            </span>
                          </div>
                        ) : (
                          <span className="text-rose-500 font-mono text-xs">{emp.roleId || 'Unassigned'}</span>
                        )}
                      </td>

                      {/* 4. Email */}
                      <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {emp.email}
                      </td>

                      {/* 5. Active */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                            emp.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {emp.status === 'Active' ? (
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-400" />
                          )}
                          <span>{emp.status || 'Active'}</span>
                        </span>
                      </td>

                      {/* 6. Joining Date */}
                      <td className="py-3 px-3.5 tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(emp.joiningDate || emp.joinedDate)}
                      </td>

                      {/* 7. Cost of Employee (INR) */}
                      <td className="py-3 px-3.5 text-right font-mono font-semibold tabular-nums text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                        {formatINR(cost)}
                      </td>

                      {/* 8. Employee Type */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${
                            emp.employeeType === 'Contract Basis'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400'
                              : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400'
                          }`}
                        >
                          {emp.employeeType || 'Salary Basis'}
                        </span>
                      </td>

                      {/* 9. Comes Under TDS */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded ${
                            emp.comesUnderTds === 'Yes'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {emp.comesUnderTds === 'Yes' ? 'TDS: Yes' : 'TDS: No'}
                        </span>
                      </td>

                      {/* 10. Notes */}
                      <td className="py-3 px-3.5 text-slate-500 dark:text-slate-400 max-w-[180px] truncate" title={emp.notes || ''}>
                        {emp.notes || '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to remove employee "${emp.name}" (${emp.id})?`)) {
                                deleteEmployee(emp.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Employee"
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

      {/* Onboard / Edit Employee Modal - Contains ONLY and EXACTLY the 10 Specified Fields */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isEditing ? `Edit Employee: ${formData.name || formData.id}` : 'Onboard Employee'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Device Doctor India · Personnel Management & Payroll Directory
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="p-3.5 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <div>
                    <span className="font-semibold">Unable to Save:</span> {formError}
                  </div>
                </div>
              )}

              {/* Grid: Fields 1 to 4 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Employee ID (Auto-generated & read-only) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    1. Employee ID <span className="text-slate-400 font-normal">(Auto-generated & Read-only)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={formData.id}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono font-bold text-cyan-600 dark:text-cyan-400 cursor-not-allowed select-all"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Strict system format: DDI-EMP-XXX
                  </span>
                </div>

                {/* 2. Employee Name (Text input, required) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    2. Employee Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Karthik Ramanathan"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow"
                  />
                </div>

                {/* 3. Role (Dropdown populated dynamically from active roles, linked strictly by Role ID) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    3. Role <span className="text-rose-500">* (Linked by Role ID)</span>
                  </label>
                  <select
                    required
                    value={formData.roleId}
                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow"
                  >
                    <option value="" disabled>-- Select Employee Role --</option>
                    {availableRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roleName} ({r.id}) {r.status === 'Inactive' ? '[Inactive]' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Live dynamic sync with Employee Roles module
                  </span>
                </div>

                {/* 4. Email (Email input, required — strictly UNIQUE across all employees) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    4. Email Address <span className="text-rose-500">* (Strictly Unique)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="karthik.r@devicedoctor.in"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow font-mono"
                    />
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Grid: Fields 5 to 7 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                {/* 5. Active (Dropdown: Active / Inactive) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    5. Active Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as EmployeeStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow font-medium"
                  >
                    <option value="Active">Active (On Active Duty & Payroll)</option>
                    <option value="Inactive">Inactive (Off Roster)</option>
                  </select>
                </div>

                {/* 6. Joining Date (Date picker) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    6. Joining Date <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={formData.joiningDate}
                      onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow"
                    />
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Single Field 7: Cost of Employee (INR) */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    7. Cost of Employee (INR) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      required
                      value={formData.costOfEmployee || ''}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setFormData({ ...formData, costOfEmployee: val });
                      }}
                      placeholder="e.g. 105000"
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow font-semibold"
                    />
                    <IndianRupee className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                  <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 mt-1 block">
                    Monthly total cost allocation: {formatINR(formData.costOfEmployee || 0)}
                  </span>
                </div>
              </div>

              {/* Grid: Fields 8 to 9 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                {/* 8. Employee Type (Dropdown: "Salary Basis", "Contract Basis") */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    8. Employee Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.employeeType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        employeeType: e.target.value as EmployeeType,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow font-medium"
                  >
                    <option value="Salary Basis">Salary Basis (Full-time Employee)</option>
                    <option value="Contract Basis">Contract Basis (Retainer / Consultant)</option>
                  </select>
                </div>

                {/* 9. Employee Comes Under TDS or Not (Dropdown: "Yes", "No") */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    9. Employee Comes Under TDS or Not <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.comesUnderTds}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          comesUnderTds: e.target.value as TdsOption,
                        })
                      }
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow font-medium"
                    >
                      <option value="Yes">Yes (Tax Deducted at Source Applicable)</option>
                      <option value="No">No (Exempt or Non-TDS Structure)</option>
                    </select>
                    <BadgePercent className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* 10. Notes (Textarea) */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  10. Notes <span className="text-slate-400 font-normal">(Tech stack, certifications, deliverables, performance notes)</span>
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Specify developer tech stack (e.g. Next.js, Node.js, Flutter), certifications, client assignments, or internal roles..."
                    className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow"
                  />
                  <FileText className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 absolute right-3 bottom-3 pointer-events-none" />
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-sm transition-all"
                >
                  {isEditing ? 'Save Changes' : '+ Onboard Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
