import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { Assignment, AssignmentPaymentStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate } from '../../utils/formatters';
import {
  ClipboardCheck,
  CheckCircle,
  Clock,
  AlertOctagon,
  CreditCard,
  Edit2,
  Trash2,
  X,
  IndianRupee,
  Check,
  AlertCircle,
  FileText,
  User,
  Briefcase,
  Layers,
  Calendar,
} from 'lucide-react';

const STATUS_OPTIONS: AssignmentPaymentStatus[] = [
  'Pending',
  'Partially Paid',
  'Paid',
  'On Hold',
  'Cancelled',
];

export const AssignmentsModule: React.FC = () => {
  const {
    assignments,
    projects,
    employees,
    roles,
    clients,
    saveAssignment,
    deleteAssignment,
    getProjectById,
    getEmployeeById,
    getRoleById,
    getClientById,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Assignment>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteCandidate, setDeleteCandidate] = useState<Assignment | null>(null);

  // Active employees for the dropdown
  const activeEmployees = useMemo(() => {
    return employees.filter((e) => e.status === 'Active');
  }, [employees]);

  // KPIs
  const totalAssignments = assignments.length;
  const activeWorkValue = assignments
    .filter((a) => a.paymentStatus !== 'Cancelled')
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalAmountPaid = assignments.reduce(
    (sum, a) => sum + (Number(a.amountPaid) || 0),
    0
  );
  const pendingPayouts = assignments
    .filter((a) => a.paymentStatus !== 'Cancelled' && a.paymentStatus !== 'Paid')
    .reduce((sum, a) => sum + Math.max(0, (Number(a.amount) || 0) - (Number(a.amountPaid) || 0)), 0);

  const kpis: KpiCardItem[] = [
    {
      label: 'Total Assignments',
      value: totalAssignments,
      subtext: 'Project tasks & modules',
      icon: <ClipboardCheck className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'Active Work Value',
      value: formatINR(activeWorkValue),
      subtext: 'Allocated budget for active tasks',
      icon: <Layers className="w-4 h-4 text-blue-600" />,
    },
    {
      label: 'Total Paid to Employees',
      value: formatINR(totalAmountPaid),
      subtext: 'Disbursed compensations',
      icon: <CreditCard className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Pending Employee Payouts',
      value: formatINR(pendingPayouts),
      subtext: 'Unsettled employee milestones',
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    },
  ];

  // Filtered Assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((asn) => {
      const project = getProjectById(asn.projectId);
      const employee = getEmployeeById(asn.employeeId);
      const client = project ? getClientById(project.clientId) : undefined;
      const role = employee ? getRoleById(employee.roleId) : undefined;

      const clientName = client?.name || project?.clientName || asn.clientName || '';
      const employeeName = employee?.name || asn.employeeName || '';
      const roleName = role?.roleName || asn.roleName || '';

      const term = searchTerm.toLowerCase();
      const matchesSearch =
        asn.id.toLowerCase().includes(term) ||
        asn.projectId.toLowerCase().includes(term) ||
        clientName.toLowerCase().includes(term) ||
        employeeName.toLowerCase().includes(term) ||
        roleName.toLowerCase().includes(term) ||
        (asn.workAssigned && asn.workAssigned.toLowerCase().includes(term)) ||
        asn.paymentStatus.toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'ALL' || asn.paymentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [assignments, searchTerm, statusFilter, getProjectById, getEmployeeById, getClientById, getRoleById]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormError(null);

    const defaultProject = projects.length > 0 ? projects[0] : undefined;
    const defaultEmployee = activeEmployees.length > 0 ? activeEmployees[0] : undefined;
    const defaultRole = defaultEmployee ? getRoleById(defaultEmployee.roleId) : undefined;
    const defaultClient = defaultProject ? getClientById(defaultProject.clientId) : undefined;

    const newId = storageService.generateId('DDI-ASN');
    const today = new Date().toISOString().slice(0, 10);

    setFormData({
      id: newId,
      projectId: defaultProject?.id || '',
      clientId: defaultProject?.clientId || '',
      clientName: defaultClient?.name || defaultProject?.clientName || '',
      employeeId: defaultEmployee?.id || '',
      employeeName: defaultEmployee?.name || '',
      roleName: defaultRole?.roleName || '',
      assignedDate: today,
      workAssigned: '',
      amount: 50000,
      amountPaid: 0,
      paymentStatus: 'Pending',
      employeeNotes: '',
      lastNoteUpdate: '',
    });

    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (asn: Assignment) => {
    setIsEditing(true);
    setFormError(null);

    // Relational live refresh on edit
    const project = getProjectById(asn.projectId);
    const employee = getEmployeeById(asn.employeeId);
    const client = project ? getClientById(project.clientId) : undefined;
    const role = employee ? getRoleById(employee.roleId) : undefined;

    setFormData({
      ...asn,
      clientId: project?.clientId || asn.clientId,
      clientName: client?.name || project?.clientName || asn.clientName,
      employeeName: employee?.name || asn.employeeName,
      roleName: role?.roleName || asn.roleName,
    });

    setIsModalOpen(true);
  };

  // Handle Project Change in Modal (Auto-fill Client ID & Client Name)
  const handleProjectChange = (projectId: string) => {
    const project = getProjectById(projectId);
    const client = project ? getClientById(project.clientId) : undefined;

    setFormData((prev) => ({
      ...prev,
      projectId,
      clientId: project?.clientId || '',
      clientName: client?.name || project?.clientName || '',
    }));
  };

  // Handle Employee Change in Modal (Auto-fill Employee ID, Employee Name, Role)
  const handleEmployeeChange = (employeeId: string) => {
    const employee = getEmployeeById(employeeId);
    const role = employee ? getRoleById(employee.roleId) : undefined;

    setFormData((prev) => ({
      ...prev,
      employeeId,
      employeeName: employee?.name || '',
      roleName: role?.roleName || '',
    }));
  };

  // Handle Amount change with auto-suggest payment status
  const handleAmountChange = (newAmount: number) => {
    setFormData((prev) => {
      const amountPaid = prev.amountPaid || 0;
      let paymentStatus = prev.paymentStatus || 'Pending';

      if (amountPaid === newAmount && newAmount > 0) {
        paymentStatus = 'Paid';
      } else if (amountPaid > 0 && amountPaid < newAmount) {
        paymentStatus = 'Partially Paid';
      } else if (amountPaid === 0) {
        paymentStatus = 'Pending';
      }

      return {
        ...prev,
        amount: newAmount,
        paymentStatus,
      };
    });
  };

  // Handle Amount Paid change with auto-suggest payment status
  const handleAmountPaidChange = (newPaid: number) => {
    setFormData((prev) => {
      const amount = prev.amount || 0;
      let paymentStatus = prev.paymentStatus || 'Pending';

      if (newPaid === amount && amount > 0) {
        paymentStatus = 'Paid';
      } else if (newPaid > 0 && newPaid < amount) {
        paymentStatus = 'Partially Paid';
      } else if (newPaid === 0) {
        paymentStatus = 'Pending';
      }

      return {
        ...prev,
        amountPaid: newPaid,
        paymentStatus,
      };
    });
  };

  // Handle Employee Notes change (Auto-generate Last Note Update timestamp)
  const handleNotesChange = (notes: string) => {
    const nowTimestamp = new Date().toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    setFormData((prev) => ({
      ...prev,
      employeeNotes: notes,
      lastNoteUpdate: notes.trim() ? nowTimestamp : '',
    }));
  };

  // Save Assignment
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.projectId) {
      setFormError('Please select a Project.');
      return;
    }
    if (!formData.employeeId) {
      setFormError('Please select an Employee.');
      return;
    }
    if (!formData.workAssigned || !formData.workAssigned.trim()) {
      setFormError('Work / Module Assigned is required.');
      return;
    }

    const amount = Number(formData.amount) || 0;
    const amountPaid = Number(formData.amountPaid) || 0;

    if (amount < 0) {
      setFormError('Amount cannot be negative.');
      return;
    }
    if (amountPaid < 0) {
      setFormError('Amount Paid cannot be negative.');
      return;
    }
    if (amountPaid > amount) {
      setFormError(
        `Amount Paid (₹${amountPaid.toLocaleString('en-IN')}) cannot exceed total allocated Amount (₹${amount.toLocaleString('en-IN')}).`
      );
      return;
    }

    const payload: Assignment = {
      id: formData.id || storageService.generateId('DDI-ASN'),
      projectId: formData.projectId,
      clientId: formData.clientId || '',
      clientName: formData.clientName || '',
      employeeId: formData.employeeId,
      employeeName: formData.employeeName || '',
      roleName: formData.roleName || '',
      assignedDate: formData.assignedDate || new Date().toISOString().slice(0, 10),
      workAssigned: formData.workAssigned.trim(),
      amount,
      amountPaid,
      paymentStatus: (formData.paymentStatus as AssignmentPaymentStatus) || 'Pending',
      employeeNotes: formData.employeeNotes || '',
      lastNoteUpdate: formData.lastNoteUpdate || '',
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = saveAssignment(payload);
    if (!res.success) {
      setFormError(res.error || 'Failed to save assignment.');
      return;
    }

    setIsModalOpen(false);
  };

  // CSV Export
  const handleExportCsv = () => {
    const columns = [
      { key: 'id', header: 'Assignment ID' },
      { key: 'projectId', header: 'Project ID' },
      { key: 'clientId', header: 'Client ID' },
      {
        key: 'clientName',
        header: 'Client Name',
        format: (row: Assignment) => {
          const project = getProjectById(row.projectId);
          const client = project ? getClientById(project.clientId) : undefined;
          return client?.name || project?.clientName || row.clientName;
        },
      },
      { key: 'employeeId', header: 'Employee ID' },
      {
        key: 'employeeName',
        header: 'Employee Name',
        format: (row: Assignment) => {
          const emp = getEmployeeById(row.employeeId);
          return emp?.name || row.employeeName;
        },
      },
      {
        key: 'roleName',
        header: 'Role',
        format: (row: Assignment) => {
          const emp = getEmployeeById(row.employeeId);
          const role = emp ? getRoleById(emp.roleId) : undefined;
          return role?.roleName || row.roleName;
        },
      },
      { key: 'assignedDate', header: 'Assigned Date' },
      { key: 'workAssigned', header: 'Work / Module Assigned' },
      { key: 'amount', header: 'Allocated Amount (INR)' },
      { key: 'amountPaid', header: 'Amount Paid (INR)' },
      {
        key: 'balance',
        header: 'Balance Due (INR)',
        format: (row: Assignment) => Math.max(0, (row.amount || 0) - (row.amountPaid || 0)),
      },
      { key: 'paymentStatus', header: 'Payment Status' },
      { key: 'lastNoteUpdate', header: 'Last Note Update' },
      { key: 'employeeNotes', header: 'Employee Notes' },
    ];

    exportToCsv(filteredAssignments, columns, 'ddi_assignments_register');
  };

  // Status Badge Helper
  const renderStatusBadge = (status: AssignmentPaymentStatus) => {
    switch (status) {
      case 'Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="w-3 h-3" />
            Paid
          </span>
        );
      case 'Partially Paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
            <CreditCard className="w-3 h-3" />
            Partially Paid
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'On Hold':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <AlertOctagon className="w-3 h-3" />
            On Hold
          </span>
        );
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <X className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Toolbar with KPIs & Search */}
      <CommonModuleToolbar
        moduleTitle="Project Assignments"
        moduleSubtitle="Project-to-Employee assignment and compensation tracker with relational synchronization"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { label: 'All Statuses', value: 'ALL' },
          { label: 'Pending', value: 'Pending' },
          { label: 'Partially Paid', value: 'Partially Paid' },
          { label: 'Paid', value: 'Paid' },
          { label: 'On Hold', value: 'On Hold' },
          { label: 'Cancelled', value: 'Cancelled' },
        ]}
        onAddNew={handleOpenAdd}
        addNewLabel="+ Assign Project / New Assignment"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredAssignments.length}
      />

      {/* Assignments Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Assignment ID</th>
                <th className="py-3.5 px-4">Project & Client</th>
                <th className="py-3.5 px-4">Assigned Employee & Role</th>
                <th className="py-3.5 px-4">Assigned Date</th>
                <th className="py-3.5 px-4">Work / Module Assigned</th>
                <th className="py-3.5 px-4 text-right">Amount (INR)</th>
                <th className="py-3.5 px-4 text-right">Paid (INR)</th>
                <th className="py-3.5 px-4 text-right">Balance Due</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4">Notes & Last Update</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No assignments found matching your filter criteria.</p>
                    <p className="text-xs mt-1">Click "+ Assign Project / New Assignment" to allocate tasks to employees.</p>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((asn) => {
                  const project = getProjectById(asn.projectId);
                  const employee = getEmployeeById(asn.employeeId);
                  const client = project ? getClientById(project.clientId) : undefined;
                  const role = employee ? getRoleById(employee.roleId) : undefined;

                  const liveClientName = client?.name || project?.clientName || asn.clientName;
                  const liveEmployeeName = employee?.name || asn.employeeName;
                  const liveRoleName = role?.roleName || asn.roleName;

                  const balanceDue = Math.max(0, (asn.amount || 0) - (asn.amountPaid || 0));

                  return (
                    <tr
                      key={asn.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Assignment ID */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                        {asn.id}
                      </td>

                      {/* 2. Project & Client (Relational ID Linking) */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1 text-xs" title={asn.projectId}>
                          {asn.projectId}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded text-slate-600 dark:text-slate-300">
                            {project?.clientId || asn.clientId}
                          </span>
                          <span className="truncate">{liveClientName}</span>
                        </div>
                      </td>

                      {/* 3. Assigned Employee & Role */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{liveEmployeeName}</span>
                          <span className="text-[10px] font-mono text-slate-400">({asn.employeeId})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                          <span>{liveRoleName || 'General Staff'}</span>
                        </div>
                      </td>

                      {/* 4. Assigned Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(asn.assignedDate)}
                      </td>

                      {/* 5. Work / Module Assigned */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-xs text-slate-800 dark:text-slate-200 font-medium line-clamp-2" title={asn.workAssigned}>
                          {asn.workAssigned}
                        </div>
                      </td>

                      {/* 6. Amount (INR) */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatINR(asn.amount)}
                      </td>

                      {/* 7. Paid (INR) */}
                      <td className="py-3.5 px-4 text-right font-mono font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {formatINR(asn.amountPaid)}
                      </td>

                      {/* 8. Balance Due */}
                      <td className="py-3.5 px-4 text-right font-mono whitespace-nowrap">
                        {balanceDue > 0 ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {formatINR(balanceDue)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-normal">Settled</span>
                        )}
                      </td>

                      {/* 9. Payment Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {renderStatusBadge(asn.paymentStatus)}
                      </td>

                      {/* 10. Notes & Last Update */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {asn.employeeNotes ? (
                          <div>
                            <div className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1 italic" title={asn.employeeNotes}>
                              "{asn.employeeNotes}"
                            </div>
                            {asn.lastNoteUpdate && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                Updated: {asn.lastNoteUpdate}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">No notes</span>
                        )}
                      </td>

                      {/* 11. Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(asn)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                            title="Edit Assignment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(asn)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                            title="Delete Assignment"
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

      {/* ADD / EDIT ASSIGNMENT MODAL FORM (EXACTLY AND ONLY THE 15 FIELDS) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-600 text-white shadow-md">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isEditing ? 'Edit Project Assignment' : 'Assign Project / New Assignment'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Allocate project modules to IT team members with relational auto-fill & payout tracking
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
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* SECTION A: ASSIGNMENT ID & PROJECT LINKAGE */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-cyan-600" />
                  <span>1. Assignment & Project Details</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Field 1: Assignment ID (Auto-generated & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      1. Assignment ID <span className="text-[10px] text-cyan-600 font-normal">(Auto-generated)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.id || ''}
                      className="w-full px-3 py-2 text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-not-allowed"
                    />
                  </div>

                  {/* Field 3: Client ID (Auto-filled & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      3. Client ID <span className="text-[10px] text-emerald-600 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.clientId || ''}
                      placeholder="Auto-filled from Project"
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-not-allowed"
                    />
                  </div>

                  {/* Field 4: Client Name (Auto-filled & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      4. Client Name <span className="text-[10px] text-emerald-600 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.clientName || ''}
                      placeholder="Auto-filled from Project"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-not-allowed truncate"
                    />
                  </div>
                </div>

                {/* Field 2: Project ID (Dropdown populated dynamically from all Projects) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    2. Project ID <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.projectId || ''}
                    onChange={(e) => handleProjectChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    <option value="" disabled>
                      -- Select Project from Projects Module --
                    </option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.id} ({proj.clientName})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Selecting a Project dynamically auto-fills Client ID and Client Name.
                  </p>
                </div>
              </div>

              {/* SECTION B: EMPLOYEE & ROLE ALLOCATION */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>2. Employee & Role Allocation</span>
                </div>

                {/* Field 5: Employee Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    5. Employee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.employeeId || ''}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100 font-medium"
                  >
                    <option value="" disabled>
                      -- Select Active Employee --
                    </option>
                    {activeEmployees.map((emp) => {
                      const empRole = getRoleById(emp.roleId);
                      return (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.id}) — {empRole?.roleName || 'Employee'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Field 6: Employee ID (Auto-filled & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      6. Employee ID <span className="text-[10px] text-emerald-600 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.employeeId || ''}
                      placeholder="Auto-filled from Employee"
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-not-allowed"
                    />
                  </div>

                  {/* Field 7: Employee Name (Auto-filled & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      7. Employee Name <span className="text-[10px] text-emerald-600 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.employeeName || ''}
                      placeholder="Auto-filled from Employee"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-not-allowed"
                    />
                  </div>

                  {/* Field 8: Role (Auto-filled & read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      8. Role <span className="text-[10px] text-emerald-600 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formData.roleName || ''}
                      placeholder="Auto-filled from Role"
                      className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION C: TASK & SCHEDULE */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Field 9: Assigned Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    9. Assigned Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.assignedDate || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, assignedDate: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Field 10: Work / Module Assigned */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    10. Work / Module Assigned <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.workAssigned || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, workAssigned: e.target.value }))}
                    required
                    placeholder="e.g., Frontend UI Development, Backend API Integration, SEO On-Page Setup"
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* SECTION D: FINANCIAL COMPENSATION & STATUS */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>3. Financial Allocation & Payout Status</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Field 11: Amount (INR) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      11. Amount (INR) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-xs font-medium">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={formData.amount ?? ''}
                        onChange={(e) => handleAmountChange(Number(e.target.value))}
                        required
                        placeholder="Total allocated task amount"
                        className="w-full pl-7 pr-3 py-2 text-xs font-mono font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {/* Field 12: Amount Paid (INR) with validation <= Amount */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      12. Amount Paid (INR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 text-xs font-medium">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={formData.amountPaid ?? ''}
                        onChange={(e) => handleAmountPaidChange(Number(e.target.value))}
                        placeholder="Amount paid to date"
                        className={`w-full pl-7 pr-3 py-2 text-xs font-mono font-semibold bg-white dark:bg-slate-900 border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100 ${
                          (formData.amountPaid || 0) > (formData.amount || 0)
                            ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </div>
                    {(formData.amountPaid || 0) > (formData.amount || 0) && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-medium">
                        Amount Paid cannot exceed Amount (₹{(formData.amount || 0).toLocaleString('en-IN')})
                      </p>
                    )}
                  </div>

                  {/* Field 13: Payment Status */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      13. Payment Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.paymentStatus || 'Pending'}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          paymentStatus: e.target.value as AssignmentPaymentStatus,
                        }))
                      }
                      className="w-full px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100"
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Balance preview card */}
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Calculated Unsettled Payout:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatINR(Math.max(0, (formData.amount || 0) - (formData.amountPaid || 0)))}
                  </span>
                </div>
              </div>

              {/* SECTION E: NOTES & AUTOMATIC TIMESTAMP */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    14. Employee Notes
                  </label>
                  {/* Field 15: Last Note Update (Auto-generated & read-only) */}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">15. Last Note Update: </span>
                    <span className="font-mono text-cyan-600 dark:text-cyan-400">
                      {formData.lastNoteUpdate || '(Will update upon saving notes)'}
                    </span>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={formData.employeeNotes || ''}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Record deliverable progress, milestone reviews, repository links, or payout clearance notes..."
                  className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Modal Action Buttons */}
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
                  disabled={(formData.amountPaid || 0) > (formData.amount || 0)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'Save Changes' : 'Confirm Assignment'}</span>
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
                  Delete Assignment Record
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assignment ID: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{deleteCandidate.id}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to remove the assignment for{' '}
              <strong className="text-slate-900 dark:text-white">{deleteCandidate.employeeName}</strong> on project{' '}
              <strong className="text-slate-900 dark:text-white">{deleteCandidate.projectId}</strong>? This will remove the recorded task allocation of {formatINR(deleteCandidate.amount)}.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Keep Record
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteAssignment(deleteCandidate.id);
                  setDeleteCandidate(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
              >
                Delete Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
