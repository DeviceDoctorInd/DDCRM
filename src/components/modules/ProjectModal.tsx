import React, { useState, useEffect, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import {
  Project,
  ProjectStatus,
  PaymentMode,
  CurrencyCode,
  ProjectDocument,
  PaymentPhase,
  PaymentPhaseStatus,
} from '../../types/crm';
import { formatINR } from '../../utils/formatters';
import {
  X,
  Briefcase,
  Check,
  AlertCircle,
  FileText,
  FileCheck,
  Upload,
  ExternalLink,
  Download,
  Trash2,
  Plus,
  Calendar,
  Layers,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { BrandSafetyGuardBanner } from '../common/BrandSafetyGuardBanner';
import { BrandSafetyConfirmModal } from '../common/BrandSafetyConfirmModal';

const PROJECT_STATUSES: ProjectStatus[] = [
  'Proposal',
  'Contracted',
  'In Progress',
  'On Hold',
  'Completed',
  'Cancelled',
];

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

const PHASE_STATUS_OPTIONS: PaymentPhaseStatus[] = [
  'Pending',
  'Invoiced',
  'Received',
  'Overdue',
];

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ProjectModal: React.FC = () => {
  const {
    isProjectModalOpen,
    isProjectModalEditing,
    projectModalData,
    closeProjectModal,
    saveProject,
    clients,
    services,
    employees,
    getRoleById,
    activeBrand,
  } = useCrm();

  const [formData, setFormData] = useState<Partial<Project>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [pendingProjectPayload, setPendingProjectPayload] = useState<Project | null>(null);

  // Active employees for Project Manager dropdown
  const activeEmployees = useMemo(() => {
    return employees.filter((e) => e.status === 'Active');
  }, [employees]);

  // Sync form data when modal opens
  useEffect(() => {
    if (isProjectModalOpen && projectModalData) {
      const contract = Number(projectModalData.contract) || 0;
      const rate = Number(projectModalData.exchangeRate) || 1;

      // Ensure default payment phases exist if empty
      let phases = projectModalData.paymentPhases;
      if (!phases || phases.length === 0) {
        const p1Amt = Math.round(contract * 0.4);
        const p2Amt = Math.round(contract * 0.3);
        const p3Amt = Math.max(0, contract - p1Amt - p2Amt);

        phases = [
          {
            id: `phase-${Date.now()}-1`,
            name: 'Phase 1 - Advance / Kickoff',
            percentage: 40,
            amount: p1Amt,
            amountINR: Math.round(p1Amt * rate),
            dueDate: projectModalData.startDate || new Date().toISOString().slice(0, 10),
            status: 'Pending',
            notes: 'Advance mobilization payment upon contract execution.',
          },
          {
            id: `phase-${Date.now()}-2`,
            name: 'Phase 2 - UI/UX & Prototype Milestone',
            percentage: 30,
            amount: p2Amt,
            amountINR: Math.round(p2Amt * rate),
            dueDate: projectModalData.committedEndDate || new Date().toISOString().slice(0, 10),
            status: 'Pending',
            notes: 'Prototype deliverables and core functionality approval.',
          },
          {
            id: `phase-${Date.now()}-3`,
            name: 'Phase 3 - Final Delivery & Go-Live',
            percentage: 30,
            amount: p3Amt,
            amountINR: Math.round(p3Amt * rate),
            dueDate: projectModalData.committedEndDate || new Date().toISOString().slice(0, 10),
            status: 'Pending',
            notes: 'Production release, server deployment, and project handover.',
          },
        ];
      }

      setFormData({
        ...projectModalData,
        paymentPhases: phases,
        proposalDocumentNotes:
          projectModalData.proposalDocumentNotes || projectModalData.proposalDocument?.notes || '',
        contractDocumentNotes:
          projectModalData.contractDocumentNotes || projectModalData.contractDocument?.notes || '',
      });
      setFormError(null);
    }
  }, [isProjectModalOpen, projectModalData]);

  if (!isProjectModalOpen) return null;

  // Handlers for dynamic calculations & reactive client sync
  const handleClientChange = (selectedClientId: string) => {
    const matchedClient = clients.find((c) => c.id === selectedClientId);
    if (!matchedClient) return;

    const newCurrency = matchedClient.preferredCurrency || 'INR';
    const newRate = newCurrency === 'INR' ? 1 : (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const currentContract = Number(formData.contract) || 0;
    const newContractValue = Math.round(currentContract * newRate);

    const currentServiceId = formData.serviceId;
    const matchedService = services.find((s) => s.id === currentServiceId);

    let nextId = formData.id;
    if (!isProjectModalEditing) {
      nextId = storageService.generateSmartProjectId(
        matchedClient.name,
        matchedService?.name || 'SERVICE',
        matchedClient.id,
        currentServiceId,
        undefined,
        formData.brand || activeBrand
      );
    }

    setFormData((prev) => ({
      ...prev,
      id: nextId,
      clientId: matchedClient.id,
      clientName: matchedClient.name,
      currency: newCurrency,
      exchangeRate: newRate,
      contractValue: newContractValue,
    }));
  };

  const handleServiceChange = (selectedServiceId: string) => {
    const matchedService = services.find((s) => s.id === selectedServiceId);
    const matchedClient = clients.find((c) => c.id === formData.clientId);

    let nextId = formData.id;
    if (!isProjectModalEditing && matchedClient && matchedService) {
      nextId = storageService.generateSmartProjectId(
        matchedClient.name,
        matchedService.name,
        matchedClient.id,
        matchedService.id,
        undefined,
        formData.brand || activeBrand
      );
    }

    setFormData((prev) => ({
      ...prev,
      id: nextId,
      serviceId: selectedServiceId,
    }));
  };

  const handleStartDateOrDaysChange = (newStartDate: string, newDays: number) => {
    let newEndDate = '';
    if (newStartDate) {
      const d = new Date(newStartDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + (Number(newDays) || 0));
        newEndDate = d.toISOString().slice(0, 10);
      }
    }
    setFormData((prev) => ({
      ...prev,
      startDate: newStartDate,
      committedDays: newDays,
      committedEndDate: newEndDate,
    }));
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    const rate = newCurrency === 'INR' ? 1 : (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const contract = Number(formData.contract) || 0;
    const newContractValue = Math.round(contract * rate);

    // Sync phase amountINR values
    const updatedPhases = (formData.paymentPhases || []).map((ph) => ({
      ...ph,
      amountINR: Math.round(ph.amount * rate),
    }));

    setFormData((prev) => ({
      ...prev,
      currency: newCurrency,
      exchangeRate: rate,
      contractValue: newContractValue,
      paymentPhases: updatedPhases,
    }));
  };

  const handleContractOrRateChange = (newContract: number, newRate: number) => {
    const newContractValue = Math.round(newContract * newRate);

    // Re-sync payment phase amounts based on existing percentages
    const updatedPhases = (formData.paymentPhases || []).map((ph) => {
      const newAmt = Math.round((newContract * ph.percentage) / 100);
      return {
        ...ph,
        amount: newAmt,
        amountINR: Math.round(newAmt * newRate),
      };
    });

    setFormData((prev) => ({
      ...prev,
      contract: newContract,
      exchangeRate: newRate,
      contractValue: newContractValue,
      paymentPhases: updatedPhases,
    }));
  };

  // --- File Upload Handlers (Proposal & Contract) ---
  const handleFileUpload = (
    field: 'proposalDocument' | 'contractDocument',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      const doc: ProjectDocument = {
        id: `doc-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        url: base64Url,
        notes: field === 'proposalDocument' ? formData.proposalDocumentNotes : formData.contractDocumentNotes,
      };

      setFormData((prev) => ({
        ...prev,
        [field]: doc,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = (field: 'proposalDocument' | 'contractDocument') => {
    setFormData((prev) => ({
      ...prev,
      [field]: undefined,
    }));
  };

  // --- Payment Phase Handlers ---
  const handleAddPhase = () => {
    const phases = formData.paymentPhases || [];
    const contract = Number(formData.contract) || 0;
    const rate = Number(formData.exchangeRate) || 1;

    // Default remaining percentage
    const currentTotalPct = phases.reduce((sum, p) => sum + (Number(p.percentage) || 0), 0);
    const remPct = Math.max(0, 100 - currentTotalPct);
    const remAmt = Math.round((contract * remPct) / 100);

    const newPhase: PaymentPhase = {
      id: `phase-${Date.now()}-${phases.length + 1}`,
      name: `Phase ${phases.length + 1} - Milestone`,
      percentage: remPct > 0 ? remPct : 20,
      amount: remPct > 0 ? remAmt : Math.round(contract * 0.2),
      amountINR: Math.round((remPct > 0 ? remAmt : Math.round(contract * 0.2)) * rate),
      dueDate: formData.committedEndDate || formData.startDate || new Date().toISOString().slice(0, 10),
      status: 'Pending',
      notes: '',
    };

    setFormData((prev) => ({
      ...prev,
      paymentPhases: [...(prev.paymentPhases || []), newPhase],
    }));
  };

  const handleRemovePhase = (phaseId: string) => {
    setFormData((prev) => ({
      ...prev,
      paymentPhases: (prev.paymentPhases || []).filter((p) => p.id !== phaseId),
    }));
  };

  const handlePhaseChange = (
    phaseId: string,
    field: keyof PaymentPhase,
    val: string | number
  ) => {
    const contract = Number(formData.contract) || 0;
    const rate = Number(formData.exchangeRate) || 1;

    setFormData((prev) => {
      const updated = (prev.paymentPhases || []).map((ph) => {
        if (ph.id !== phaseId) return ph;

        if (field === 'percentage') {
          const pct = Math.max(0, Math.min(100, Number(val) || 0));
          const amt = Math.round((contract * pct) / 100);
          return {
            ...ph,
            percentage: pct,
            amount: amt,
            amountINR: Math.round(amt * rate),
          };
        }

        if (field === 'amount') {
          const amt = Math.max(0, Number(val) || 0);
          const pct = contract > 0 ? parseFloat(((amt / contract) * 100).toFixed(1)) : 0;
          return {
            ...ph,
            amount: amt,
            percentage: pct,
            amountINR: Math.round(amt * rate),
          };
        }

        return {
          ...ph,
          [field]: val,
        };
      });

      return {
        ...prev,
        paymentPhases: updated,
      };
    });
  };

  const handleAutoDistributePhases = () => {
    const contract = Number(formData.contract) || 0;
    const rate = Number(formData.exchangeRate) || 1;
    const p1Amt = Math.round(contract * 0.4);
    const p2Amt = Math.round(contract * 0.3);
    const p3Amt = Math.max(0, contract - p1Amt - p2Amt);

    const standardPhases: PaymentPhase[] = [
      {
        id: `phase-${Date.now()}-1`,
        name: 'Phase 1 - Advance / Kickoff (40%)',
        percentage: 40,
        amount: p1Amt,
        amountINR: Math.round(p1Amt * rate),
        dueDate: formData.startDate || new Date().toISOString().slice(0, 10),
        status: 'Pending',
        notes: 'Advance mobilization payment upon contract execution.',
      },
      {
        id: `phase-${Date.now()}-2`,
        name: 'Phase 2 - Core Dev & Prototype (30%)',
        percentage: 30,
        amount: p2Amt,
        amountINR: Math.round(p2Amt * rate),
        dueDate: formData.committedEndDate || new Date().toISOString().slice(0, 10),
        status: 'Pending',
        notes: 'Deliverable milestones & prototype approval.',
      },
      {
        id: `phase-${Date.now()}-3`,
        name: 'Phase 3 - Go-Live & Handover (30%)',
        percentage: 30,
        amount: p3Amt,
        amountINR: Math.round(p3Amt * rate),
        dueDate: formData.committedEndDate || new Date().toISOString().slice(0, 10),
        status: 'Pending',
        notes: 'Final production deployment and code sign-off.',
      },
    ];

    setFormData((prev) => ({
      ...prev,
      paymentPhases: standardPhases,
    }));
  };

  // Phase allocation statistics
  const currentPhases = formData.paymentPhases || [];
  const totalPhasePercentage = currentPhases.reduce(
    (sum, p) => sum + (Number(p.percentage) || 0),
    0
  );
  const totalPhaseAmount = currentPhases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalPhaseAmountINR = currentPhases.reduce(
    (sum, p) => sum + (Number(p.amountINR) || 0),
    0
  );
  const contractValueINR = formData.contractValue || 0;
  const isAllocationBalanced = Math.abs(totalPhasePercentage - 100) < 0.1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clientId) {
      setFormError('Please select a Client from the dropdown.');
      return;
    }
    if (!formData.serviceId) {
      setFormError('Please select a Service Type from the dropdown.');
      return;
    }
    if (!formData.startDate) {
      setFormError('Project Start Date is required.');
      return;
    }

    const payload: Project = {
      id: formData.id || '',
      brand: formData.brand || activeBrand,
      clientId: formData.clientId,
      clientName: formData.clientName || 'Client',
      serviceId: formData.serviceId,
      proposalDate: formData.proposalDate || new Date().toISOString().slice(0, 10),
      contractDate: formData.contractDate || new Date().toISOString().slice(0, 10),
      startDate: formData.startDate,
      committedDays: Number(formData.committedDays) || 0,
      committedEndDate: formData.committedEndDate || formData.startDate,
      actualEndDate: formData.actualEndDate || '',
      status: formData.status || 'In Progress',
      paymentMode: formData.paymentMode || 'GST Invoice',
      currency: formData.currency || 'INR',
      contract: Number(formData.contract) || 0,
      exchangeRate: Number(formData.exchangeRate) || 1,
      contractValue:
        Math.round((Number(formData.contract) || 0) * (Number(formData.exchangeRate) || 1)),
      projectManager: formData.projectManager || 'Lead Project Manager',
      notes: formData.notes || '',
      proposalDocument: formData.proposalDocument,
      proposalDocumentNotes: formData.proposalDocumentNotes || formData.proposalDocument?.notes || '',
      contractDocument: formData.contractDocument,
      contractDocumentNotes: formData.contractDocumentNotes || formData.contractDocument?.notes || '',
      paymentPhases: formData.paymentPhases || [],
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Safety Guard: If creating a new project, show confirmation modal to verify active workspace
    if (!isProjectModalEditing) {
      setPendingProjectPayload(payload);
      setIsConfirmModalOpen(true);
      return;
    }

    await executeSaveProject(payload);
  };

  const executeSaveProject = async (payloadToSave: Project) => {
    const res = await saveProject(payloadToSave);
    if (res.success) {
      setIsConfirmModalOpen(false);
      setPendingProjectPayload(null);
      closeProjectModal();
    } else {
      setFormError(res.error || 'Failed to save project.');
      setIsConfirmModalOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/10 dark:bg-slate-500/20 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{isProjectModalEditing ? `Edit Project` : 'New Project'}</span>
                {formData.id && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 font-semibold truncate max-w-xs">
                    {formData.id}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Client engagement details, proposal & contract documents, and dynamic payment milestone schedule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeProjectModal}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {formError && (
            <div className="p-3 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Active Workspace Safety Guard Banner */}
          <BrandSafetyGuardBanner
            entityType="Project"
            targetBrand={formData.brand || activeBrand}
            isEditing={isProjectModalEditing}
            recordId={formData.id}
          />

          {/* SECTION 1: Client & Identification */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
              <span>1. Project & Client Identification</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project ID (Auto-generated, Read-only)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.id || 'PRJ-Auto'}
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 cursor-not-allowed select-all"
                  title="Auto-generated Project ID (Read-only)"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client <span className="text-slate-800 dark:text-slate-200">*</span>
                </label>
                <select
                  required
                  value={formData.clientId || ''}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="" disabled>-- Select Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client ID (Auto-filled, Read-only)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.clientId || '—'}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client Name (Auto-filled, Read-only)
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

          {/* SECTION 2: Service Offering & Governance */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              2. Scope & Governance
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Service Type <span className="text-slate-800 dark:text-slate-200">*</span>
                </label>
                <select
                  required
                  value={formData.serviceId || ''}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="" disabled>-- Select Service Type --</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Manager <span className="text-slate-800 dark:text-slate-200">*</span>
                </label>
                <select
                  required
                  value={formData.projectManager || ''}
                  onChange={(e) => setFormData({ ...formData, projectManager: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="" disabled>-- Select Project Manager from Employees --</option>
                  {/* Preserve existing PM if not in active employee list */}
                  {formData.projectManager && !activeEmployees.some((e: any) => e.name === formData.projectManager) && (
                    <option value={formData.projectManager}>
                      {formData.projectManager} (Currently Assigned)
                    </option>
                  )}
                  {activeEmployees.map((emp: any) => {
                    const role = getRoleById(emp.roleId);
                    return (
                      <option key={emp.id} value={emp.name}>
                        {emp.name} ({emp.id} · {role?.roleName || emp.employeeType})
                      </option>
                    );
                  })}
                </select>
                {activeEmployees.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                    No active employees registered. Please add employees in the Employees module.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status || 'In Progress'}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as ProjectStatus })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Mode
                </label>
                <select
                  value={formData.paymentMode || 'GST Invoice'}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentMode: e.target.value as PaymentMode })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {PAYMENT_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 3: Schedule & Timeline Milestones */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              3. Project Schedule & Milestone Dates
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Proposal Date
                </label>
                <input
                  type="date"
                  value={formData.proposalDate || ''}
                  onChange={(e) => setFormData({ ...formData, proposalDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contract/Agreement Date
                </label>
                <input
                  type="date"
                  value={formData.contractDate || ''}
                  onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Start Date <span className="text-slate-800 dark:text-slate-200">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate || ''}
                  onChange={(e) =>
                    handleStartDateOrDaysChange(e.target.value, formData.committedDays ?? 30)
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Committed Days
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.committedDays ?? 30}
                  onChange={(e) =>
                    handleStartDateOrDaysChange(
                      formData.startDate || '',
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Committed End Date (Auto-calculated, Read-only)
                </label>
                <input
                  type="date"
                  readOnly
                  value={formData.committedEndDate || ''}
                  className="w-full px-3 py-2 text-xs font-mono font-medium rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual End Date (Optional)
                </label>
                <input
                  type="date"
                  value={formData.actualEndDate || ''}
                  onChange={(e) => setFormData({ ...formData, actualEndDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: PROJECT DOCUMENTS (Proposal & Contract) */}
          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
                <span>Project Documents (Proposal & Contract Uploads)</span>
              </div>
              <span className="text-[10px] text-slate-500">PDF, DOC, DOCX, Images, or Cloud Links</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Proposal Document Upload Box */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />
                      <span>Proposal Document</span>
                    </span>
                    {formData.proposalDocument ? (
                      <span className="text-[10px] font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Attached
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Not uploaded</span>
                    )}
                  </div>

                  {formData.proposalDocument ? (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 mb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {formData.proposalDocument.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatFileSize(formData.proposalDocument.size)} •{' '}
                            {formData.proposalDocument.uploadedAt
                              ? new Date(formData.proposalDocument.uploadedAt).toLocaleDateString('en-IN')
                              : 'Uploaded'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(formData.proposalDocument.url || formData.proposalDocument.externalUrl) && (
                            <a
                              href={formData.proposalDocument.url || formData.proposalDocument.externalUrl}
                              download={formData.proposalDocument.name}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Download / View Proposal"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDocument('proposalDocument')}
                            className="p-1 rounded text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Remove Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-700 rounded-lg cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Click to upload Proposal
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">PDF, DOCX, PNG (Max 10MB)</span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => handleFileUpload('proposalDocument', e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {/* External Link Field */}
                  <div className="mb-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      External Link / Google Drive URL (Optional)
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={formData.proposalDocument?.externalUrl || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            proposalDocument: {
                              ...(prev.proposalDocument || {
                                id: `doc-${Date.now()}`,
                                name: 'Proposal_Document_External.pdf',
                                uploadedAt: new Date().toISOString(),
                              }),
                              externalUrl: val,
                            },
                          }));
                        }}
                        placeholder="https://drive.google.com/file/d/..."
                        className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                      />
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                    </div>
                  </div>

                  {/* Proposal Document Notes */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Proposal Document Notes / Version Summary
                    </label>
                    <textarea
                      rows={2}
                      value={formData.proposalDocumentNotes || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, proposalDocumentNotes: e.target.value })
                      }
                      placeholder="e.g. Approved scope baseline, version v2.1 with revised infrastructure milestones..."
                      className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Contract / Agreement Document Upload Box */}
              <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />
                      <span>Contract / Agreement Document</span>
                    </span>
                    {formData.contractDocument ? (
                      <span className="text-[10px] font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Signed
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Not uploaded</span>
                    )}
                  </div>

                  {formData.contractDocument ? (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 mb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {formData.contractDocument.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {formatFileSize(formData.contractDocument.size)} •{' '}
                            {formData.contractDocument.uploadedAt
                              ? new Date(formData.contractDocument.uploadedAt).toLocaleDateString('en-IN')
                              : 'Uploaded'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(formData.contractDocument.url || formData.contractDocument.externalUrl) && (
                            <a
                              href={formData.contractDocument.url || formData.contractDocument.externalUrl}
                              download={formData.contractDocument.name}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Download / View Contract"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDocument('contractDocument')}
                            className="p-1 rounded text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Remove Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-700 rounded-lg cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Click to upload Signed Contract
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">PDF, Signed Agreement (Max 10MB)</span>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => handleFileUpload('contractDocument', e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {/* External Link Field */}
                  <div className="mb-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Signed Contract Link / External Drive URL (Optional)
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={formData.contractDocument?.externalUrl || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            contractDocument: {
                              ...(prev.contractDocument || {
                                id: `doc-${Date.now()}`,
                                name: 'Signed_Contract_External.pdf',
                                uploadedAt: new Date().toISOString(),
                              }),
                              externalUrl: val,
                            },
                          }));
                        }}
                        placeholder="https://drive.google.com/file/d/..."
                        className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                      />
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                    </div>
                  </div>

                  {/* Contract Document Notes */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Contract Notes / Special Terms & SLA Clauses
                    </label>
                    <textarea
                      rows={2}
                      value={formData.contractDocumentNotes || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, contractDocumentNotes: e.target.value })
                      }
                      placeholder="e.g. 99.9% uptime SLA, 2-hour bug turnaround, 3-month free bug warranty..."
                      className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: Financials & Commercials */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              5. Commercial Valuation & Foreign Exchange
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Currency
                </label>
                <select
                  value={formData.currency || 'INR'}
                  onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {CURRENCIES.map((curr) => (
                    <option key={curr} value={curr}>
                      {curr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contract ({formData.currency || 'INR'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.contract ?? 0}
                  onChange={(e) =>
                    handleContractOrRateChange(
                      parseFloat(e.target.value) || 0,
                      formData.exchangeRate ?? 1
                    )
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

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
                    handleContractOrRateChange(
                      formData.contract ?? 0,
                      parseFloat(e.target.value) || 1
                    )
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contract Value (INR, Read-only)
                </label>
                <div className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 truncate">
                  {formatINR(formData.contractValue || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 6: DYNAMIC PHASES OF PAYMENT / MILESTONES BUILDER */}
          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
                  <span>Phases of Payment & Milestone Schedule</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Breakdown installments, due dates, deliverable notes & link to contract value
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoDistributePhases}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Auto-split into standard 40% Kickoff, 30% Milestone, 30% Delivery"
                >
                  Standard 40/30/30
                </button>
                <button
                  type="button"
                  onClick={handleAddPhase}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-black hover:bg-neutral-800 rounded-lg transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Payment Phase</span>
                </button>
              </div>
            </div>

            {/* Payment Phase Rows */}
            <div className="space-y-3">
              {currentPhases.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                  <Layers className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                  <p>No payment phases defined yet.</p>
                  <button
                    type="button"
                    onClick={handleAddPhase}
                    className="mt-2 text-slate-800 dark:text-slate-200 hover:underline font-semibold"
                  >
                    + Click to add first phase
                  </button>
                </div>
              ) : (
                currentPhases.map((phase, idx) => (
                  <div
                    key={phase.id || idx}
                    className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                      {/* Phase Title */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Phase #{idx + 1} Name / Title
                        </label>
                        <input
                          type="text"
                          required
                          value={phase.name}
                          onChange={(e) => handlePhaseChange(phase.id, 'name', e.target.value)}
                          placeholder="e.g. Phase 1 - Advance / Kickoff"
                          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      {/* Percentage (%) */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Share (%)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={phase.percentage}
                            onChange={(e) =>
                              handlePhaseChange(phase.id, 'percentage', parseFloat(e.target.value) || 0)
                            }
                            className="w-full pr-6 pl-2.5 py-1.5 text-xs font-mono font-bold rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                          />
                          <span className="absolute right-2 top-1.5 text-xs text-slate-400 font-bold">%</span>
                        </div>
                      </div>

                      {/* Amount in Currency */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 truncate">
                          Amount ({formData.currency || 'INR'})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={phase.amount}
                          onChange={(e) =>
                            handlePhaseChange(phase.id, 'amount', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                        {formData.currency !== 'INR' && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                            ≈ {formatINR(phase.amountINR)}
                          </div>
                        )}
                      </div>

                      {/* Due Date */}
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Expected / Due
                        </label>
                        <input
                          type="date"
                          value={phase.dueDate || ''}
                          onChange={(e) => handlePhaseChange(phase.id, 'dueDate', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs font-mono rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      </div>

                      {/* Status & Remove */}
                      <div className="sm:col-span-2 flex items-center gap-1.5 pt-0.5">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Status
                          </label>
                          <select
                            value={phase.status || 'Pending'}
                            onChange={(e) =>
                              handlePhaseChange(phase.id, 'status', e.target.value as PaymentPhaseStatus)
                            }
                            className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded-md border text-slate-900 dark:text-slate-100 focus:outline-none ${
                              phase.status === 'Received'
                                ? 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200'
                                : phase.status === 'Invoiced'
                                ? 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200'
                                : phase.status === 'Overdue'
                                ? 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {PHASE_STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePhase(phase.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mt-4"
                          title="Remove Phase"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Phase Notes input */}
                    <div>
                      <input
                        type="text"
                        value={phase.notes || ''}
                        onChange={(e) => handlePhaseChange(phase.id, 'notes', e.target.value)}
                        placeholder="Phase notes: deliverables required, client sign-off conditions, or invoice references..."
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Validation Helper & Progress Bar */}
            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {isAllocationBalanced ? (
                    <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Total Allocated Across Phases: {totalPhasePercentage.toFixed(1)}%</span>
                    </span>
                  ) : totalPhasePercentage < 100 ? (
                    <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>
                        Total Allocated: {totalPhasePercentage.toFixed(1)}% ({formatINR(totalPhaseAmountINR)} /{' '}
                        {formatINR(contractValueINR)}) — {(100 - totalPhasePercentage).toFixed(1)}% unallocated
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold">
                      <AlertCircle className="w-4 h-4" />
                      <span>
                        Total Allocated: {totalPhasePercentage.toFixed(1)}% — Exceeds Contract Value by{' '}
                        {(totalPhasePercentage - 100).toFixed(1)}%!
                      </span>
                    </span>
                  )}
                </div>

                <div className="text-slate-500 font-mono text-[11px]">
                  Sum: {formData.currency || 'INR'} {totalPhaseAmount.toLocaleString()} ({formatINR(totalPhaseAmountINR)})
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-2.5 overflow-hidden flex">
                {currentPhases.map((phase, idx) => {
                  const width = `${Math.min(100, phase.percentage)}%`;
                  const color =
                    phase.status === 'Received'
                      ? 'bg-slate-500'
                      : phase.status === 'Invoiced'
                      ? 'bg-slate-500'
                      : phase.status === 'Overdue'
                      ? 'bg-slate-500'
                      : 'bg-slate-400';
                  return (
                    <div
                      key={phase.id || idx}
                      style={{ width }}
                      className={`${color} h-full border-r border-white dark:border-slate-900 transition-all`}
                      title={`${phase.name}: ${phase.percentage}% (${phase.status})`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 7: Notes */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              7. Delivery Notes & Scope
            </div>
            <textarea
              rows={3}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Outline project deliverables, staging URLs, milestone terms, or client specifications..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900 pb-1">
            <button
              type="button"
              onClick={closeProjectModal}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-neutral-800 active:bg-neutral-900 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isProjectModalEditing ? 'Save Project Changes' : 'Add Project'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Brand Safety Confirmation Modal */}
      <BrandSafetyConfirmModal
        isOpen={isConfirmModalOpen}
        entityType="Project"
        entityName={pendingProjectPayload?.id || formData.id || 'New Project Proposal'}
        targetBrand={pendingProjectPayload?.brand || formData.brand || activeBrand}
        onConfirm={() => {
          if (pendingProjectPayload) {
            executeSaveProject(pendingProjectPayload);
          }
        }}
        onCancel={() => {
          setIsConfirmModalOpen(false);
        }}
      />
    </div>
  );
};
