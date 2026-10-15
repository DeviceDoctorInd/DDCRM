import React, { useState, useEffect } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { Project, ProjectStatus, PaymentMode, CurrencyCode } from '../../types/crm';
import { formatINR } from '../../utils/formatters';
import { X, Briefcase, Check, AlertCircle } from 'lucide-react';

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

export const ProjectModal: React.FC = () => {
  const {
    isProjectModalOpen,
    isProjectModalEditing,
    projectModalData,
    closeProjectModal,
    saveProject,
    clients,
    services,
  } = useCrm();

  const [formData, setFormData] = useState<Partial<Project>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Sync form data when modal opens
  useEffect(() => {
    if (isProjectModalOpen && projectModalData) {
      setFormData({ ...projectModalData });
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
        currentServiceId
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
        matchedService.id
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
    setFormData((prev) => ({
      ...prev,
      currency: newCurrency,
      exchangeRate: rate,
      contractValue: Math.round(contract * rate),
    }));
  };

  const handleContractOrRateChange = (newContract: number, newRate: number) => {
    setFormData((prev) => ({
      ...prev,
      contract: newContract,
      exchangeRate: newRate,
      contractValue: Math.round(newContract * newRate),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
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
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = saveProject(payload);
    if (res.success) {
      closeProjectModal();
    } else {
      setFormError(res.error || 'Failed to save project.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isProjectModalEditing ? `Edit Project (${formData.id})` : 'New Project'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isProjectModalEditing
                  ? 'Update client engagement details, timelines, and commercial parameters'
                  : `Add new client engagement · Assigned ID: ${formData.id || 'PRJ-Auto'}`}
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

        {/* Form strictly containing the 19 exact specified fields */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {formError && (
            <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* SECTION 1: Client & Identification */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              1. Project & Client Identification
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Field 1: Project ID (Auto-generated, read-only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project ID (Auto-generated, Read-only)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.id || 'PRJ-Auto'}
                  className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-cyan-600 dark:text-cyan-400 cursor-not-allowed select-all"
                  title="Auto-generated Project ID (Read-only)"
                />
              </div>

              {/* Field 2: Client Dropdown (Populated dynamically from Clients module) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formData.clientId || ''}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="" disabled>-- Select Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 3: Client ID (Auto-filled & read-only) */}
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

              {/* Field 4: Client Name (Auto-filled & read-only) */}
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
              {/* Field 5: Service Type (Dropdown populated from Services module) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Service Type <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formData.serviceId || ''}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="" disabled>-- Select Service Type --</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 18: Project Manager (Text input) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Manager <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.projectManager || ''}
                  onChange={(e) => setFormData({ ...formData, projectManager: e.target.value })}
                  placeholder="e.g. Karthik Ramanathan"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 12: Status (Dropdown) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status || 'In Progress'}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as ProjectStatus })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 13: Payment Mode (Dropdown) */}
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
            </div>
          </div>

          {/* SECTION 3: Schedule & Timeline Milestones */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              3. Project Schedule & Milestone Dates
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Field 6: Proposal Date (Date picker) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Proposal Date
                </label>
                <input
                  type="date"
                  value={formData.proposalDate || ''}
                  onChange={(e) => setFormData({ ...formData, proposalDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 7: Contract/Agreement Date (Date picker) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contract/Agreement Date
                </label>
                <input
                  type="date"
                  value={formData.contractDate || ''}
                  onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 8: Project Start Date (Date picker) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate || ''}
                  onChange={(e) =>
                    handleStartDateOrDaysChange(e.target.value, formData.committedDays ?? 30)
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 9: Committed Days (Number input) */}
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
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 10: Committed End Date (Auto-calculated & read-only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Committed End Date (Auto-calculated, Read-only)
                </label>
                <input
                  type="date"
                  readOnly
                  value={formData.committedEndDate || ''}
                  className="w-full px-3 py-2 text-xs font-mono font-medium rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-cyan-700 dark:text-cyan-300 cursor-not-allowed"
                />
              </div>

              {/* Field 11: Actual End Date (Date picker, optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Actual End Date (Optional)
                </label>
                <input
                  type="date"
                  value={formData.actualEndDate || ''}
                  onChange={(e) => setFormData({ ...formData, actualEndDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Financials & Commercials */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              4. Commercial Valuation & Foreign Exchange
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              {/* Field 14: Currency (Dropdown) */}
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

              {/* Field 15: Contract (Numeric input) */}
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
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 16: Exchange Rate (Numeric input) */}
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
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Field 17: Contract Value (Auto-calculated & read-only in INR) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contract Value (INR, Read-only)
                </label>
                <div className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 text-cyan-700 dark:text-cyan-300 truncate">
                  {formatINR(formData.contractValue || 0)}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: Notes */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              5. Delivery Notes & Scope
            </div>
            {/* Field 19: Notes (Textarea) */}
            <textarea
              rows={3}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Outline project deliverables, staging URLs, milestone terms, or client specifications..."
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeProjectModal}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isProjectModalEditing ? 'Save Project Changes' : 'Add Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
