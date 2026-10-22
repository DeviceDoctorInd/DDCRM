import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCrm } from '../../context/CrmContext';
import { storageService } from '../../services/storageService';
import { Payment, PaymentStatus, PaymentMode, CurrencyCode, Project, BRAND_CONFIG } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate, calculateDaysOverdue } from '../../utils/formatters';
import {
  CreditCard,
  CheckCircle,
  AlertOctagon,
  ShieldAlert,
  Edit2,
  Trash2,
  X,
  IndianRupee,
  Check,
  AlertCircle,
  Clock,
  Layers,
  Upload,
  FileCheck,
  FileText,
  Eye,
  ExternalLink,
  Download,
  Landmark,
} from 'lucide-react';
import { PaymentProofModal } from '../common/PaymentProofModal';
import { PaymentProofDocument } from '../../types/crm';

const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ['Received', 'Pending', 'Failed', 'Cancelled'];

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

export const PaymentsModule: React.FC = () => {
  const {
    payments,
    projects,
    allProjects,
    clients,
    allClients,
    bankAccounts,
    savePayment,
    deletePayment,
    confirmDelete,
    getClientById,
    getProjectById,
    getBankAccountById,
    activeBrand,
    brandPrefix,
    isConsolidatedView,
    refreshGstInvoices,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Payment>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [uploadInputKey, setUploadInputKey] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const formSessionRef = useRef<string>('');

  // Fetch / refresh latest projects whenever modal opens to guarantee data availability
  useEffect(() => {
    if (isModalOpen) {
      storageService
        .fetchProjects()
        .then((projs) => {
          if (Array.isArray(projs) && projs.length > 0) {
            setLocalProjects(projs);
          }
        })
        .catch((err) => {
          console.warn('[PaymentsModule] Failed to refresh projects for modal:', err);
        });
    }
  }, [isModalOpen]);

  // Unified projects pool ensuring all projects are accessible across brands and offline/online states
  const effectiveProjectsPool = useMemo(() => {
    const map = new Map<string, Project>();
    (allProjects || []).forEach((p) => {
      if (p?.id) map.set(p.id, p);
    });
    (projects || []).forEach((p) => {
      if (p?.id) map.set(p.id, p);
    });
    localProjects.forEach((p) => {
      if (p?.id) map.set(p.id, p);
    });
    return Array.from(map.values());
  }, [allProjects, projects, localProjects]);

  // Scoped project options for payment form dropdown based on brand workspace context
  const availableProjects = useMemo(() => {
    if (effectiveProjectsPool.length === 0) return [];

    if (isConsolidatedView) {
      return effectiveProjectsPool;
    }

    const currentBrand = formData.brand || activeBrand;
    const currentPrefix = BRAND_CONFIG[currentBrand]?.prefix || brandPrefix;

    let list = effectiveProjectsPool.filter((p) => {
      if (p.brand === currentBrand) return true;
      if (currentPrefix && p.id?.startsWith(`${currentPrefix}-`)) return true;
      return false;
    });

    // Ensure currently selected projectId exists in dropdown (e.g. during edit or cross-brand link)
    if (formData.projectId && !list.some((p) => p.id === formData.projectId)) {
      const existing = effectiveProjectsPool.find((p) => p.id === formData.projectId);
      if (existing) {
        list = [existing, ...list];
      }
    }

    return list;
  }, [effectiveProjectsPool, isConsolidatedView, formData.brand, formData.projectId, activeBrand, brandPrefix]);

  // Payment Proof Modal Lightbox state
  const [selectedPaymentForProof, setSelectedPaymentForProof] = useState<Payment | null>(null);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);

  // KPIs
  const totalReceivedINR = payments
    .filter((p) => p.paymentStatus === 'Received')
    .reduce((acc, p) => acc + (p.amountINR || p.amount || 0), 0);

  const totalPendingINR = payments
    .filter((p) => p.paymentStatus === 'Pending')
    .reduce((acc, p) => acc + (p.amountINR || p.amount || 0), 0);

  const totalContractBookings = projects.reduce((acc, p) => acc + (p.contractValue || 0), 0);
  const totalOutstandingBalance = Math.max(0, totalContractBookings - totalReceivedINR);

  const overdueCount = payments.filter((p) => {
    const overdueDays = p.daysOverdue ?? calculateDaysOverdue(p.dueDate, p.paymentStatus);
    return p.paymentStatus === 'Pending' && overdueDays > 0;
  }).length;

  const kpis: KpiCardItem[] = [
    {
      label: 'Settled Receipts (INR)',
      value: formatINR(totalReceivedINR),
      subtext: 'Cleared payments',
      icon: <CheckCircle className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Pending Invoices (INR)',
      value: formatINR(totalPendingINR),
      subtext: 'Invoiced awaiting settlement',
      icon: <Clock className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Remaining Balance (INR)',
      value: formatINR(totalOutstandingBalance),
      subtext: 'Contract balance across projects',
      icon: <AlertOctagon className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Overdue Payments',
      value: overdueCount,
      subtext: 'Pending past due date',
      icon: <ShieldAlert className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
  ];

  // Filtered rows
  const filteredPayments = useMemo(() => {
    return payments.filter((pay) => {
      const client = getClientById(pay.clientId);
      const project = getProjectById(pay.projectId);
      const bankAcc = pay.bankAccountId ? getBankAccountById(pay.bankAccountId) : null;
      const bankName = pay.bankAccountName || bankAcc?.accountName || '';
      const term = (searchTerm || '').toLowerCase().trim();

      const matchesSearch =
        !term ||
        (pay.id || '').toLowerCase().includes(term) ||
        (pay.projectId || '').toLowerCase().includes(term) ||
        (pay.referenceUtr && pay.referenceUtr.toLowerCase().includes(term)) ||
        (client?.name && client.name.toLowerCase().includes(term)) ||
        (pay.clientName && pay.clientName.toLowerCase().includes(term)) ||
        (project?.clientName && project.clientName.toLowerCase().includes(term)) ||
        (bankName && bankName.toLowerCase().includes(term)) ||
        (pay.paymentMode && pay.paymentMode.toLowerCase().includes(term));

      const matchesStatus = statusFilter === 'ALL' || pay.paymentStatus === statusFilter;
      const matchesMode = modeFilter === 'ALL' || pay.paymentMode === modeFilter;

      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [payments, searchTerm, statusFilter, modeFilter, getClientById, getProjectById, getBankAccountById]);

  // Export CSV with all 15 exact fields
  const handleExportCsv = () => {
    exportToCsv(
      filteredPayments,
      [
        { key: 'id', header: 'Payment ID' },
        { key: 'projectId', header: 'Project ID' },
        { key: 'clientId', header: 'Client ID' },
        {
          key: 'clientName',
          header: 'Client Name',
          format: (r) => r.clientName || getClientById(r.clientId)?.name || r.clientId,
        },
        { key: 'paymentMode', header: 'Payment Mode' },
        { key: 'paymentDate', header: 'Payment Date' },
        { key: 'dueDate', header: 'Due Date' },
        { key: 'amountReceived', header: 'Amount Received' },
        { key: 'currency', header: 'Currency' },
        { key: 'exchangeRate', header: 'Exchange Rate' },
        { key: 'amountINR', header: 'Amount (INR)', format: (r) => r.amountINR || r.amount || 0 },
        { key: 'referenceUtr', header: 'Reference / UTR' },
        { key: 'paymentStatus', header: 'Payment Status' },
        {
          key: 'daysOverdue',
          header: 'Days Overdue',
          format: (r) => r.daysOverdue ?? calculateDaysOverdue(r.dueDate, r.paymentStatus),
        },
        {
          key: 'paymentProof',
          header: 'Payment Proof File',
          format: (r) => (r.paymentProof ? r.paymentProof.name : 'N/A'),
        },
        {
          key: 'paymentProofNotes',
          header: 'Payment Proof Notes',
          format: (r) => r.paymentProofNotes || r.paymentProof?.notes || '',
        },
        { key: 'notes', header: 'Notes', format: (r) => r.notes || '' },
      ],
      `${brandPrefix}_Payments_${new Date().toISOString().slice(0, 10)}`
    );
  };

  // Open Add Payment Modal
  const handleOpenAdd = () => {
    setFormError(null);
    setIsEditing(false);

    const brandPrefixCurrent = BRAND_CONFIG[activeBrand]?.prefix || brandPrefix;
    const pool = effectiveProjectsPool;
    const clientPool = allClients && allClients.length > 0 ? allClients : clients;

    // Filter projects for the active brand workspace
    const brandCandidates = isConsolidatedView
      ? pool
      : pool.filter((p) => p.brand === activeBrand || (brandPrefixCurrent && p.id?.startsWith(`${brandPrefixCurrent}-`)));

    const defaultProject = brandCandidates.length > 0
      ? brandCandidates[0]
      : (pool.length > 0 ? pool[0] : undefined);

    const defaultClient = defaultProject
      ? clientPool.find((c) => c.id === defaultProject.clientId)
      : (clientPool.length > 0 ? clientPool[0] : undefined);

    const autoId = storageService.generateId('PAY', activeBrand);
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

    const projectCurrency = defaultProject?.currency || defaultClient?.preferredCurrency || 'INR';
    const projectRate = defaultProject?.exchangeRate ?? (projectCurrency === 'INR' ? 1 : 84.5);
    const initialAmount = 100000;
    const initialAmountINR = Math.round(initialAmount * projectRate);

    const brandBank = bankAccounts.find((b) => b.brand === activeBrand && b.status === 'Active') || bankAccounts[0];

    setFormData({
      id: autoId,
      brand: activeBrand,
      projectId: defaultProject?.id || '',
      clientId: defaultProject?.clientId || defaultClient?.id || '',
      clientName: defaultProject?.clientName || defaultClient?.name || '',
      paymentMode: defaultProject?.paymentMode || 'GST Invoice',
      paymentDate: today,
      dueDate,
      amountReceived: initialAmount,
      currency: projectCurrency,
      exchangeRate: projectRate,
      amountINR: initialAmountINR,
      referenceUtr: `UTR-${brandPrefixCurrent}-${Date.now().toString().slice(-6)}`,
      bankAccountId: brandBank?.id || '',
      bankAccountName: brandBank
        ? `${brandBank.bankName} - ${brandBank.accountNumber} (${brandBank.accountName})`
        : '',
      paymentStatus: 'Received',
      daysOverdue: 0,
      notes: '',
      paymentProof: undefined,
      paymentProofNotes: '',
    });
    formSessionRef.current = `add-${autoId}-${Date.now()}`;
    setUploadInputKey((k) => k + 1);
    setIsModalOpen(true);
  };

  // Open Edit Payment Modal with isolated session & deep cloned proof
  const handleOpenEdit = (pay: Payment) => {
    setFormError(null);
    setIsEditing(true);
    const overdue = pay.daysOverdue ?? calculateDaysOverdue(pay.dueDate, pay.paymentStatus);
    
    // Deep-clone payment proof to prevent in-memory mutation of parent table state
    const clonedProof = pay.paymentProof
      ? (typeof pay.paymentProof === 'string'
          ? storageService.parseProofDocument(pay.paymentProof)
          : JSON.parse(JSON.stringify(pay.paymentProof)))
      : undefined;

    setFormData({
      ...pay,
      amountReceived: pay.amountReceived ?? pay.amount ?? 0,
      amountINR: pay.amountINR ?? pay.amount ?? 0,
      daysOverdue: overdue,
      paymentProof: clonedProof,
      paymentProofNotes: pay.paymentProofNotes || clonedProof?.notes || '',
    });

    formSessionRef.current = `edit-${pay.id}-${Date.now()}`;
    setUploadInputKey((k) => k + 1);
    setIsModalOpen(true);
  };

  // Session-isolated Proof File Upload Handler
  const handleFileUpload = (file: File) => {
    if (!file) return;

    // 1. Enforce strict 10MB file size ceiling to prevent payload truncation
    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setFormError(`File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a compressed image or document.`);
      return;
    }

    // 2. Validate format
    const allowedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowedFormats.includes(file.type.toLowerCase())) {
      setFormError('Invalid file type. Please upload a receipt screenshot (PNG, JPG, WEBP) or PDF clearance document.');
      return;
    }

    setFormError(null);
    setIsUploadingProof(true);

    const targetSessionId = formSessionRef.current;
    const targetPaymentId = formData.id;

    const reader = new FileReader();
    reader.onerror = () => {
      setIsUploadingProof(false);
      setFormError('Failed to read file from storage. Please select the file again.');
    };

    reader.onload = () => {
      // Discard if user closed the modal or switched records while reading file buffer
      if (formSessionRef.current !== targetSessionId) {
        setIsUploadingProof(false);
        return;
      }

      const base64 = reader.result as string;
      if (!base64 || !base64.startsWith('data:')) {
        setIsUploadingProof(false);
        setFormError('File buffer stream is corrupted. Please try again.');
        return;
      }

      const uniqueProofId = `proof-${targetPaymentId || 'pay'}-${Date.now()}`;
      const proofDoc: PaymentProofDocument = {
        id: uniqueProofId,
        name: file.name,
        size: file.size,
        type: file.type || 'image/png',
        uploadedAt: new Date().toISOString(),
        url: base64,
        notes: formData.paymentProofNotes || '',
      };

      setFormData((prev) => {
        // Enforce transaction instance ID binding
        if (targetPaymentId && prev.id !== targetPaymentId) {
          return prev;
        }
        return {
          ...prev,
          paymentProof: proofDoc,
          paymentProofNotes: prev.paymentProofNotes || proofDoc.notes || '',
        };
      });

      setIsUploadingProof(false);
      setUploadInputKey((k) => k + 1);
    };

    reader.readAsDataURL(file);
  };

  const handleExternalUrlChange = (url: string) => {
    setFormData((prev) => ({
      ...prev,
      paymentProof: prev.paymentProof
        ? { ...prev.paymentProof, externalUrl: url }
        : {
            id: `proof-${prev.id || Date.now()}-${Date.now()}`,
            name: 'Online_Receipt_Link',
            uploadedAt: new Date().toISOString(),
            externalUrl: url,
            notes: prev.paymentProofNotes || '',
          },
    }));
  };

  const handleRemoveProof = () => {
    setFormData((prev) => ({
      ...prev,
      paymentProof: undefined,
    }));
    setUploadInputKey((k) => k + 1);
  };

  // Handlers for Project ID selection & reactive field updates
  const handleProjectSelect = (selectedProjectId: string) => {
    const matchedProject = effectiveProjectsPool.find((p) => p.id === selectedProjectId);
    if (!matchedProject) return;

    const clientPool = allClients && allClients.length > 0 ? allClients : clients;
    const matchedClient = clientPool.find((c) => c.id === matchedProject.clientId);
    const newCurrency = matchedProject.currency || matchedClient?.preferredCurrency || 'INR';
    const newRate = matchedProject.exchangeRate ?? (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const currentAmount = Number(formData.amountReceived) || 0;
    const newAmountINR = Math.round(currentAmount * newRate);

    setFormData((prev) => ({
      ...prev,
      projectId: matchedProject.id,
      brand: matchedProject.brand || prev.brand || activeBrand,
      clientId: matchedProject.clientId,
      clientName: matchedProject.clientName || matchedClient?.name || '',
      paymentMode: matchedProject.paymentMode || prev.paymentMode || 'GST Invoice',
      currency: newCurrency,
      exchangeRate: newRate,
      amountINR: newAmountINR,
    }));
  };

  // Handlers for Amount / Rate changes
  const handleAmountOrRateChange = (amount: number, rate: number) => {
    const amountINR = Math.round(amount * rate);
    setFormData((prev) => ({
      ...prev,
      amountReceived: amount,
      exchangeRate: rate,
      amountINR,
    }));
  };

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    const rate = newCurrency === 'INR' ? 1 : (DEFAULT_EXCHANGE_RATES[newCurrency] || 1);
    const amount = Number(formData.amountReceived) || 0;
    setFormData((prev) => ({
      ...prev,
      currency: newCurrency,
      exchangeRate: rate,
      amountINR: Math.round(amount * rate),
    }));
  };

  const handleDueDateOrStatusChange = (newDueDate: string, newStatus: PaymentStatus) => {
    const overdue = calculateDaysOverdue(newDueDate, newStatus);
    setFormData((prev) => ({
      ...prev,
      dueDate: newDueDate,
      paymentStatus: newStatus,
      daysOverdue: overdue,
    }));
  };

  // Selected Project Financial Context for Balance Check
  const selectedProject = effectiveProjectsPool.find((p) => p.id === formData.projectId);
  const otherReceivedOnSelectedProject = useMemo(() => {
    if (!formData.projectId) return 0;
    return payments
      .filter(
        (p) =>
          p.projectId === formData.projectId &&
          p.id !== formData.id &&
          p.paymentStatus === 'Received'
      )
      .reduce((acc, p) => acc + (p.amountINR || p.amount || 0), 0);
  }, [payments, formData.projectId, formData.id]);

  const selectedProjectRemainingBalance = selectedProject
    ? Math.max(0, (selectedProject.contractValue || 0) - otherReceivedOnSelectedProject)
    : 0;

  // Form submit
  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      setFormError('Please select a Project ID from the dropdown.');
      return;
    }
    if (!formData.referenceUtr || !formData.referenceUtr.trim()) {
      setFormError('Reference / UTR is required.');
      return;
    }
    const cleanUtr = formData.referenceUtr.trim();
    // Unique check
    const dup = payments.find(
      (p) => p.id !== formData.id && p.referenceUtr?.trim().toLowerCase() === cleanUtr.toLowerCase()
    );
    if (dup) {
      setFormError(
        `Reference / UTR "${cleanUtr}" is already in use by Payment ${dup.id}. Reference / UTR must be strictly unique.`
      );
      return;
    }

    const amountReceived = Number(formData.amountReceived) || 0;
    const exchangeRate = Number(formData.exchangeRate) || 1;
    const amountINR = Math.round(amountReceived * exchangeRate);

    // Validate project balance for 'Received' payments
    if (formData.paymentStatus === 'Received' && selectedProject) {
      if (amountINR > selectedProjectRemainingBalance) {
        setFormError(
          `Payment amount of ₹${amountINR.toLocaleString('en-IN')} exceeds the project's remaining balance of ₹${selectedProjectRemainingBalance.toLocaleString('en-IN')} (Contract Value: ₹${(selectedProject.contractValue || 0).toLocaleString('en-IN')}, Previously Received: ₹${otherReceivedOnSelectedProject.toLocaleString('en-IN')}).`
        );
        return;
      }
    }

    const overdueDays = calculateDaysOverdue(formData.dueDate || '', formData.paymentStatus || 'Pending');

    const payload: Payment = {
      id: formData.id || '',
      brand: formData.brand || activeBrand,
      projectId: formData.projectId,
      clientId: formData.clientId || selectedProject?.clientId || '',
      clientName: formData.clientName || selectedProject?.clientName || '',
      paymentMode: formData.paymentMode || 'GST Invoice',
      bankAccountId: formData.bankAccountId || '',
      bankAccountName: formData.bankAccountName || '',
      paymentDate: formData.paymentDate || new Date().toISOString().slice(0, 10),
      dueDate: formData.dueDate || new Date().toISOString().slice(0, 10),
      amountReceived,
      currency: formData.currency || 'INR',
      exchangeRate,
      amountINR,
      referenceUtr: cleanUtr,
      paymentStatus: formData.paymentStatus || 'Received',
      daysOverdue: overdueDays,
      notes: formData.notes || '',
      paymentProof: formData.paymentProof ? JSON.parse(JSON.stringify(formData.paymentProof)) : undefined,
      paymentProofNotes: formData.paymentProofNotes || (formData.paymentProof?.notes || ''),
      createdAt: formData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      amount: amountINR,
      receivedAmount: formData.paymentStatus === 'Received' ? amountINR : 0,
      outstandingAmount: formData.paymentStatus === 'Received' ? 0 : amountINR,
    };

    const res = await savePayment(payload);
    if (res.success) {
      if (payload.paymentMode === 'GST Invoice') {
        refreshGstInvoices().catch((err) => console.warn('[Auto-sync GST Invoices re-fetch]', err));
      }
      setIsModalOpen(false);
      setFormData({});
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save payment record.');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Payment Ledger & Invoices"
        moduleSubtitle="Corporate settlement tracking, tax invoices, and real-time project balance reconciliation"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { label: 'All Invoices', value: 'ALL' },
          { label: 'Received', value: 'Received' },
          { label: 'Pending', value: 'Pending' },
          { label: 'Failed', value: 'Failed' },
          { label: 'Cancelled', value: 'Cancelled' },
        ]}
        onAddNew={handleOpenAdd}
        addNewLabel="Add Payment"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredPayments.length}
      />

      {/* Payment Mode Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Payment Mode:
          </span>
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
          >
            <option value="ALL">All Payment Modes</option>
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Showing <strong className="text-slate-900 dark:text-slate-100">{filteredPayments.length}</strong> of{' '}
          {payments.length} transactions
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Project ID & Engagement</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Amount ({'Curr'})</th>
                <th className="py-3 px-4">Amount (INR)</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">Reference / UTR</th>
                <th className="py-3 px-4">Due Date & Aging</th>
                <th className="py-3 px-4">Payment Proof</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No payment records found.</p>
                    <p className="text-xs mt-1">Click "Add Payment" to record a new client transaction.</p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay) => {
                  const client = getClientById(pay.clientId);
                  const overdueDays =
                    pay.daysOverdue ?? calculateDaysOverdue(pay.dueDate, pay.paymentStatus);
                  const isOverdue = pay.paymentStatus === 'Pending' && overdueDays > 0;

                  let statusBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (pay.paymentStatus === 'Received') {
                    statusBadge =
                      'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                  } else if (pay.paymentStatus === 'Pending') {
                    statusBadge = isOverdue
                      ? 'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700'
                      : 'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                  } else if (pay.paymentStatus === 'Failed') {
                    statusBadge =
                      'bg-slate-50 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                  } else if (pay.paymentStatus === 'Cancelled') {
                    statusBadge =
                      'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                  }

                  return (
                    <tr
                      key={pay.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                        {pay.id}
                      </td>
                      <td className="py-3.5 px-4 max-w-[260px]">
                        <div
                          className="font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate"
                          title={pay.projectId}
                        >
                          {pay.projectId}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          Paid on: {formatDate(pay.paymentDate)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {pay.clientName || client?.name || `Client #${pay.clientId}`}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          ID: {pay.clientId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {pay.currency} {Number(pay.amountReceived || pay.amount || 0).toLocaleString()}
                        {pay.currency !== 'INR' && pay.exchangeRate && (
                          <div className="text-[10px] text-slate-400">@ {pay.exchangeRate}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatINR(pay.amountINR || pay.amount || 0)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            pay.paymentMode === 'GST Invoice'
                              ? 'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700'
                              : pay.paymentMode === 'Non GST Online'
                              ? 'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700'
                              : pay.paymentMode === 'Cash'
                              ? 'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700'
                              : 'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {pay.paymentMode}
                        </span>
                        {(() => {
                          const bankAcc = pay.bankAccountId ? getBankAccountById(pay.bankAccountId) : null;
                          const resolvedBankName = pay.bankAccountName || bankAcc?.accountName;
                          if (!resolvedBankName) return null;
                          return (
                            <div
                              className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 truncate max-w-[170px]"
                              title={`Credited to: ${resolvedBankName}`}
                            >
                              <Landmark className="w-3 h-3 text-slate-800 dark:text-slate-200 shrink-0" />
                              <span className="truncate">{resolvedBankName}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 select-all">
                          {pay.referenceUtr || '—'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="tabular-nums text-slate-800 dark:text-slate-200">
                          {formatDate(pay.dueDate)}
                        </div>
                        {isOverdue ? (
                          <div className="text-[10px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                            <span>{overdueDays}d overdue</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {pay.paymentStatus === 'Received' ? 'Settled' : 'On schedule'}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {pay.paymentProof ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPaymentForProof(pay);
                              setIsProofModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs"
                            title={`View Payment Proof / Screenshot (${pay.paymentProof.name})`}
                          >
                            <FileCheck className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
                            <span>View Proof</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(pay)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 italic hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Attach Payment Proof / Receipt Screenshot"
                          >
                            <span>+ Attach Proof</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${statusBadge}`}>
                          {pay.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(pay)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Payment Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              confirmDelete({
                                moduleName: 'Payment',
                                recordTitle: `Payment ${pay.id} (${pay.paymentMode})`,
                                recordId: pay.id,
                                warningNote: `Deleting payment record "${pay.id}" will update project paid balance and remove the associated financial ledger entry in Azure SQL.`,
                                onConfirm: async () => {
                                  await deletePayment(pay.id);
                                },
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:text-slate-200 dark:hover:text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Payment Record"
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

      {/* Add / Edit Payment Modal with Viewport Containment, Pinned Header/Footer & Monochrome UI */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
        >
          <div className="relative flex flex-col w-full max-w-4xl max-h-[88vh] bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-2xl overflow-hidden font-sans">
            {/* Pinned Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-neutral-800 flex items-center justify-between bg-white dark:bg-neutral-900 z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-black text-white dark:bg-white dark:text-black flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="payment-modal-title" className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                    {isEditing ? `Edit Payment (${formData.id})` : 'Record Payment'}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {isEditing
                      ? 'Update transaction reconciliation and ledger entry'
                      : `Corporate settlement tracking · Payment ID: ${formData.id || 'PAY-Auto'}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-black dark:hover:text-white p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Container with Internal Scrollable Body & Pinned Footer */}
            <form onSubmit={handleSaveSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Internal Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {formError && (
                  <div className="p-3 text-xs rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-neutral-700 dark:text-neutral-300" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Project Balance Live Sync Indicator */}
                {selectedProject && (
                  <div className="p-3.5 rounded bg-neutral-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                      <Layers className="w-4 h-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
                      <div>
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">Project Commercial Balance: </span>
                        <span className="text-neutral-500">Contract: </span>
                        <strong className="font-mono text-neutral-900 dark:text-neutral-100">
                          {formatINR(selectedProject.contractValue || selectedProject.contract || 0)}
                        </strong>
                        <span className="mx-2 text-neutral-300 dark:text-neutral-600">|</span>
                        <span className="text-neutral-500">Received: </span>
                        <strong className="font-mono text-neutral-900 dark:text-neutral-100">
                          {formatINR(otherReceivedOnSelectedProject)}
                        </strong>
                      </div>
                    </div>
                    <div className="px-2.5 py-1 rounded bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                      Remaining Balance: {formatINR(selectedProjectRemainingBalance)}
                    </div>
                  </div>
                )}

                {/* SECTION 1: Payment & Project Association */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                    1. Payment & Project Association
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Field 1: Payment ID (Auto-generated, Read-only) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Payment ID (Auto-generated)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formData.id || 'PAY-Auto'}
                        className="w-full px-3 py-2 text-xs font-mono font-semibold rounded bg-neutral-100 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 cursor-not-allowed select-all"
                      />
                    </div>

                    {/* Field 2: Project ID (Dropdown with smart semantic project IDs) */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
                        Project ID <span className="text-neutral-900 dark:text-neutral-100 font-bold">*</span>
                      </label>
                      <select
                        required
                        value={formData.projectId || ''}
                        onChange={(e) => handleProjectSelect(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-mono"
                      >
                        <option value="" disabled>
                          {availableProjects.length === 0
                            ? `-- No projects available for ${formData.brand || activeBrand} --`
                            : '-- Select Project --'}
                        </option>
                        {availableProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} {p.clientName ? `— ${p.clientName}` : ''}
                          </option>
                        ))}
                      </select>
                      {availableProjects.length === 0 && (
                        <p className="text-[10px] text-neutral-400 mt-1">
                          No projects registered under {formData.brand || activeBrand}. Create a project first or switch workspaces.
                        </p>
                      )}
                    </div>

                    {/* Field 3: Client ID (Auto-filled & read-only from Project) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Client ID (Auto-filled)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formData.clientId || '—'}
                        className="w-full px-3 py-2 text-xs font-mono rounded bg-neutral-100 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 cursor-not-allowed select-all"
                      />
                    </div>

                    {/* Field 4: Client Name (Auto-filled & read-only from Project) */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Client Name (Auto-filled)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formData.clientName || '—'}
                        className="w-full px-3 py-2 text-xs font-medium rounded bg-neutral-100 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Dates, Mode & Status */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                    2. Schedule, Mode & Aging Status
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {/* Field 5: Payment Mode (Dropdown) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Payment Mode
                      </label>
                      <select
                        value={formData.paymentMode || 'GST Invoice'}
                        onChange={(e) =>
                          setFormData({ ...formData, paymentMode: e.target.value as PaymentMode })
                        }
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      >
                        {PAYMENT_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Field: Receiving Bank Account (Active Brand's Accounts) */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300" />
                          <span>Receiving Bank Account</span>
                        </span>
                        <span className="text-[10px] text-neutral-400 font-normal">
                          ({(formData.brand || activeBrand)} Accounts)
                        </span>
                      </label>
                      <select
                        value={formData.bankAccountId || ''}
                        onChange={(e) => {
                          const selId = e.target.value;
                          if (!selId) {
                            setFormData({ ...formData, bankAccountId: '', bankAccountName: '' });
                          } else {
                            const matched = bankAccounts.find((b) => b.id === selId);
                            setFormData({
                              ...formData,
                              bankAccountId: selId,
                              bankAccountName: matched
                                ? `${matched.bankName} - ${matched.accountNumber} (${matched.accountName})`
                                : '',
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      >
                        <option value="">-- No Bank Account Tagged / Cash / Direct Settlement --</option>
                        {formData.bankAccountId && !bankAccounts.some((b) => b.id === formData.bankAccountId && b.brand === (formData.brand || activeBrand) && b.status === 'Active') && (
                          <option value={formData.bankAccountId}>
                            {formData.bankAccountName || formData.bankAccountId} (Currently Tagged)
                          </option>
                        )}
                        {bankAccounts
                          .filter((b) => b.brand === (formData.brand || activeBrand) && b.status === 'Active')
                          .map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.bankName} — {acc.accountNumber} ({acc.accountName} · {acc.accountType})
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Field 6: Payment Date (Date picker) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Payment Date <span className="text-neutral-900 dark:text-neutral-100 font-bold">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.paymentDate || ''}
                        onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      />
                    </div>

                    {/* Field 7: Due Date (Date picker) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Due Date <span className="text-neutral-900 dark:text-neutral-100 font-bold">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.dueDate || ''}
                        onChange={(e) =>
                          handleDueDateOrStatusChange(
                            e.target.value,
                            (formData.paymentStatus as PaymentStatus) || 'Pending'
                          )
                        }
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      />
                    </div>

                    {/* Field 13: Payment Status (Dropdown) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Payment Status
                      </label>
                      <select
                        value={formData.paymentStatus || 'Received'}
                        onChange={(e) =>
                          handleDueDateOrStatusChange(
                            formData.dueDate || '',
                            e.target.value as PaymentStatus
                          )
                        }
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      >
                        {PAYMENT_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Field 14: Days Overdue (Auto-calculated & read-only) */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Days Overdue (Auto-calculated, Read-only)
                      </label>
                      <div className="w-full px-3 py-2 text-xs font-mono font-medium rounded bg-neutral-100 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 flex items-center justify-between">
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {formData.daysOverdue !== undefined && formData.daysOverdue > 0
                            ? `${formData.daysOverdue} day(s) overdue`
                            : '0 days (Not overdue)'}
                        </span>
                        {formData.daysOverdue !== undefined && formData.daysOverdue > 0 && (
                          <span className="text-[10px] font-bold text-black dark:text-white uppercase px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">
                            Past Due
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Commercials & UTR Reference */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">
                    3. Commercials, Foreign Exchange & Reference / UTR
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded bg-neutral-50/70 dark:bg-neutral-800/40 border border-slate-200 dark:border-neutral-800">
                    {/* Field 9: Currency (Dropdown) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Currency
                      </label>
                      <select
                        value={formData.currency || 'INR'}
                        onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      >
                        {CURRENCIES.map((curr) => (
                          <option key={curr} value={curr}>
                            {curr}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Field 8: Amount Received (Numeric input) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Amount Received <span className="text-neutral-900 dark:text-neutral-100 font-bold">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        value={formData.amountReceived ?? 0}
                        onChange={(e) =>
                          handleAmountOrRateChange(
                            parseFloat(e.target.value) || 0,
                            formData.exchangeRate ?? 1
                          )
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      />
                    </div>

                    {/* Field 10: Exchange Rate (Numeric input) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Exchange Rate (to INR)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={formData.exchangeRate ?? 1}
                        onChange={(e) =>
                          handleAmountOrRateChange(
                            formData.amountReceived ?? 0,
                            parseFloat(e.target.value) || 1
                          )
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      />
                    </div>

                    {/* Field 11: Amount (INR) (Auto-calculated & read-only) */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Amount (INR, Auto)
                      </label>
                      <div className="w-full px-3 py-2 text-xs font-mono font-bold rounded bg-neutral-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-black dark:text-white truncate">
                        {formatINR(formData.amountINR || 0)}
                      </div>
                    </div>

                    {/* Field 12: Reference / UTR (Text input — Unique check enforced) */}
                    <div className="sm:col-span-2 md:col-span-4 mt-2">
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Reference / UTR (Unique ID) <span className="text-neutral-900 dark:text-neutral-100 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.referenceUtr || ''}
                        onChange={(e) => setFormData({ ...formData, referenceUtr: e.target.value })}
                        placeholder="e.g. UTR-HDFC-9928172601 or IMPS-20261014-998"
                        className="w-full px-3 py-2 text-xs font-mono rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      />
                      <p className="text-[10px] text-neutral-400 mt-1">
                        Must be strictly unique across all payments in the system.
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Payment Proof / Receipt Upload */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300" />
                      <span>4. Payment Proof / Receipt Upload</span>
                    </span>
                    {formData.paymentProof && (
                      <span className="text-[10px] text-black dark:text-white font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Attached
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded bg-neutral-50/70 dark:bg-neutral-800/40 border border-slate-200 dark:border-neutral-800 space-y-4">
                    {formData.paymentProof ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
                        <div className="flex items-center gap-3">
                          {formData.paymentProof.url?.startsWith('data:image/') ||
                          formData.paymentProof.name?.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                            <div className="w-14 h-14 rounded overflow-hidden border border-slate-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 shrink-0 relative group">
                              <img
                                src={formData.paymentProof.url}
                                alt="Payment Proof"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0 border border-slate-200 dark:border-neutral-700">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate max-w-xs">
                              {formData.paymentProof.name}
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {formData.paymentProof.size
                                ? `${(formData.paymentProof.size / 1024).toFixed(1)} KB • `
                                : ''}
                              Uploaded: {formatDate(formData.paymentProof.uploadedAt || new Date().toISOString())}
                            </p>
                            {formData.paymentProof.externalUrl && (
                              <a
                                href={formData.paymentProof.externalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-black dark:text-white underline flex items-center gap-0.5 mt-0.5"
                              >
                                <span>External receipt link</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <label className={`cursor-pointer px-2.5 py-1 text-xs font-medium rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-slate-300 dark:border-neutral-700 transition-colors ${isUploadingProof ? 'opacity-50 pointer-events-none' : ''}`}>
                            <span>{isUploadingProof ? 'Uploading...' : 'Replace'}</span>
                            <input
                              key={`replace-proof-${formData.id || 'new'}-${uploadInputKey}`}
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                              className="hidden"
                              disabled={isUploadingProof}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  const selectedFile = e.target.files[0];
                                  e.target.value = '';
                                  handleFileUpload(selectedFile);
                                }
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleRemoveProof}
                            disabled={isUploadingProof}
                            className="p-1 text-neutral-500 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                            title="Remove attachment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(false);
                            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                              handleFileUpload(e.dataTransfer.files[0]);
                            }
                          }}
                          className={`flex flex-col items-center justify-center p-5 border-2 border-dashed ${
                            isDragging
                              ? 'border-black bg-neutral-100 dark:border-white dark:bg-neutral-800'
                              : 'border-neutral-300 dark:border-neutral-700 hover:border-black dark:hover:border-white bg-white dark:bg-neutral-900'
                          } rounded cursor-pointer transition-colors group ${
                            isUploadingProof ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          <Upload className="w-6 h-6 text-neutral-400 group-hover:text-black dark:group-hover:text-white mb-1.5 transition-colors" />
                          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            {isUploadingProof
                              ? 'Processing and isolating file...'
                              : isDragging
                              ? 'Drop receipt proof here to attach'
                              : 'Click or drag receipt proof screenshot to upload'}
                          </span>
                          <span className="text-[10px] text-neutral-400 mt-0.5">
                            PNG, JPG, JPEG, WEBP, or PDF (Max 10MB • screenshots & transaction receipts)
                          </span>
                          <input
                            key={`new-proof-${formData.id || 'new'}-${uploadInputKey}`}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                            className="hidden"
                            disabled={isUploadingProof}
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                const selectedFile = e.target.files[0];
                                e.target.value = '';
                                handleFileUpload(selectedFile);
                              }
                            }}
                          />
                        </label>

                        {/* Optional External Link */}
                        <div className="flex items-center gap-2">
                          <ExternalLink className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <input
                            type="url"
                            placeholder="Or paste Google Drive / external receipt URL..."
                            value={(formData.paymentProof as PaymentProofDocument | undefined)?.externalUrl || ''}
                            onChange={(e) => handleExternalUrlChange(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                          />
                        </div>
                      </div>
                    )}

                    {/* Dedicated Payment Proof Notes */}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Payment Proof Notes (Voucher & Clearance Verification)
                      </label>
                      <textarea
                        rows={2}
                        value={formData.paymentProofNotes || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            paymentProofNotes: val,
                            paymentProof: prev.paymentProof
                              ? { ...prev.paymentProof, notes: val }
                              : prev.paymentProof,
                          }));
                        }}
                        placeholder="e.g. PhonePe UPI transaction screenshot verified by accounts desk • IMPS reference cleared in HDFC..."
                        className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 5: Notes */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                    5. Transaction Notes
                  </div>
                  {/* Field 15: Notes (Textarea) */}
                  <textarea
                    rows={3}
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Record bank clearance reference, remittance details, or client billing communication..."
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-black focus:border-black font-sans"
                  />
                </div>
              </div>

              {/* Pinned Modal Footer */}
              <div className="shrink-0 px-6 py-4 border-t border-slate-200 dark:border-neutral-800 flex items-center justify-end gap-3 bg-neutral-50 dark:bg-neutral-900/90 z-10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded border border-slate-300 dark:border-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-black hover:bg-neutral-800 active:bg-neutral-900 rounded shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isEditing ? 'Save Payment Changes' : 'Record Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Proof Lightbox Modal */}
      {selectedPaymentForProof && (
        <PaymentProofModal
          isOpen={isProofModalOpen}
          onClose={() => {
            setIsProofModalOpen(false);
            setSelectedPaymentForProof(null);
          }}
          title="Client Payment Proof & Clearance Voucher"
          paymentId={selectedPaymentForProof.id}
          partyLabel={`Client: ${
            selectedPaymentForProof.clientName ||
            getClientById(selectedPaymentForProof.clientId)?.name ||
            selectedPaymentForProof.clientId
          }`}
          amountINR={
            selectedPaymentForProof.amountINR || selectedPaymentForProof.amount || 0
          }
          paymentDate={selectedPaymentForProof.paymentDate}
          paymentMode={selectedPaymentForProof.paymentMode}
          referenceUtr={selectedPaymentForProof.referenceUtr}
          proofDocument={selectedPaymentForProof.paymentProof}
          proofNotes={
            selectedPaymentForProof.paymentProofNotes ||
            selectedPaymentForProof.paymentProof?.notes
          }
          onEditProof={() => {
            handleOpenEdit(selectedPaymentForProof);
          }}
        />
      )}
    </div>
  );
};
