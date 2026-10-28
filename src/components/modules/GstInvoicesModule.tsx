import React, { useState, useMemo, useEffect } from 'react';
import { useCrm } from '../../context/CrmContext';
import { GstInvoice, GstPortalUploadStatus, InvoiceDocumentFile } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate } from '../../utils/formatters';
import {
  FileCheck,
  CheckCircle,
  Clock,
  AlertCircle,
  Edit2,
  X,
  FileText,
  Building,
  Briefcase,
  IndianRupee,
  Layers,
  Lock,
  ExternalLink,
  Upload,
  Trash2,
  Paperclip,
  Check,
  RefreshCw,
} from 'lucide-react';

export const GstInvoicesModule: React.FC = () => {
  const {
    gstInvoices,
    payments,
    saveGstInvoice,
    deleteGstInvoice,
    confirmDelete,
    activeBrand,
    brandPrefix,
    refreshGstInvoices,
    syncGstInvoicesFromPayments,
    gstInvoiceError,
    isGstInvoicesLoading,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [portalFilter, setPortalFilter] = useState<'ALL' | 'Yes' | 'No'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);

  // Proactively refresh GST Invoices on module load to guarantee instant sync
  useEffect(() => {
    refreshGstInvoices().catch((err) =>
      console.warn('[GstInvoicesModule] Initial refresh notice:', err)
    );
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncGstInvoicesFromPayments();
    } finally {
      setIsSyncing(false);
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<GstInvoice | null>(null);
  const [uploadedFile, setUploadedFile] = useState<InvoiceDocumentFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modalFormData, setModalFormData] = useState<{
    invoiceNumber: string;
    uploadedToGstPortal: GstPortalUploadStatus;
    gstPortalUploadDate: string;
    notes: string;
  }>({
    invoiceNumber: '',
    uploadedToGstPortal: 'No',
    gstPortalUploadDate: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // KPIs (ERPNext Desk UI Monochrome)
  const totalCount = gstInvoices.length;
  const totalAmountINR = useMemo(
    () => gstInvoices.reduce((acc, inv) => acc + (Number(inv.amountINR) || 0), 0),
    [gstInvoices]
  );
  const totalGstAmountINR = useMemo(
    () => gstInvoices.reduce((acc, inv) => acc + (Number(inv.gstAmountINR) || 0), 0),
    [gstInvoices]
  );
  const uploadedCount = useMemo(
    () => gstInvoices.filter((inv) => inv.uploadedToGstPortal === 'Yes').length,
    [gstInvoices]
  );
  const pendingCount = totalCount - uploadedCount;

  const kpis: KpiCardItem[] = [
    {
      label: 'Total GST Invoices',
      value: totalCount,
      subtext: 'Synced from GST payments',
      icon: <FileCheck className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Total Invoice Amount',
      value: formatINR(totalAmountINR),
      subtext: 'Taxable payments turnover',
      icon: <IndianRupee className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Total 18% GST Amount',
      value: formatINR(totalGstAmountINR),
      subtext: 'Calculated 18% output GST',
      icon: <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
    {
      label: 'Portal Upload Status',
      value: `${uploadedCount} Uploaded · ${pendingCount} Pending`,
      subtext: `${uploadedCount > 0 ? Math.round((uploadedCount / (totalCount || 1)) * 100) : 0}% compliance filed`,
      icon: <CheckCircle className="w-4 h-4 text-slate-800 dark:text-slate-200" />,
    },
  ];

  // Filtering
  const filteredInvoices = useMemo(() => {
    return gstInvoices.filter((inv) => {
      const q = (searchTerm || '').toLowerCase().trim();
      const matchesSearch =
        !q ||
        (inv.paymentId || '').toLowerCase().includes(q) ||
        (inv.projectId || '').toLowerCase().includes(q) ||
        (inv.clientId || '').toLowerCase().includes(q) ||
        (inv.clientName || '').toLowerCase().includes(q) ||
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (inv.notes && inv.notes.toLowerCase().includes(q));

      const matchesPortal = portalFilter === 'ALL' || inv.uploadedToGstPortal === portalFilter;

      return matchesSearch && matchesPortal;
    });
  }, [gstInvoices, searchTerm, portalFilter]);

  // Open Edit Modal for a specific row
  const handleOpenEdit = (invoice: GstInvoice) => {
    setSelectedInvoice(invoice);
    setFormError(null);
    setUploadedFile(invoice.invoiceFile || null);
    setModalFormData({
      invoiceNumber: invoice.invoiceNumber || '',
      uploadedToGstPortal: invoice.uploadedToGstPortal || 'No',
      gstPortalUploadDate:
        invoice.gstPortalUploadDate ||
        (invoice.uploadedToGstPortal === 'Yes' ? new Date().toISOString().slice(0, 10) : ''),
      notes: invoice.notes || '',
    });
    setIsModalOpen(true);
  };

  // Quick Open Modal from toolbar (+ Update / Upload GST Invoice button)
  const handleOpenToolbarModal = () => {
    if (gstInvoices.length > 0) {
      // Find first pending or first record
      const pending = gstInvoices.find((i) => i.uploadedToGstPortal === 'No') || gstInvoices[0];
      handleOpenEdit(pending);
    } else {
      // Auto-detect or create draft GST invoice linked to payment or brand
      const matchingPay = payments.find((p) => p.paymentMode === 'GST Invoice') || payments[0];
      if (matchingPay) {
        const tempInv: GstInvoice = {
          id: '',
          brand: matchingPay.brand || activeBrand,
          paymentId: matchingPay.id,
          projectId: matchingPay.projectId || '',
          clientId: matchingPay.clientId || '',
          clientName: matchingPay.clientName || 'Direct Client',
          paymentDate: matchingPay.paymentDate || new Date().toISOString().slice(0, 10),
          amountReceived: matchingPay.amountReceived || 0,
          currency: matchingPay.currency || 'INR',
          amountINR: matchingPay.amountINR || 0,
          gstAmountINR: Math.round((matchingPay.amountINR || 0) * 0.18),
          invoiceNumber: `INV-${new Date().getFullYear()}-001`,
          uploadedToGstPortal: 'No',
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        handleOpenEdit(tempInv);
      } else {
        const tempInv: GstInvoice = {
          id: '',
          brand: activeBrand,
          paymentId: `PAY-${brandPrefix}-${Date.now().toString().slice(-6)}`,
          projectId: `PRJ-${brandPrefix}-001`,
          clientId: `CLI-${brandPrefix}-001`,
          clientName: 'Direct Client',
          paymentDate: new Date().toISOString().slice(0, 10),
          amountReceived: 100000,
          currency: 'INR',
          amountINR: 100000,
          gstAmountINR: 18000,
          invoiceNumber: `INV-${new Date().getFullYear()}-001`,
          uploadedToGstPortal: 'No',
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        handleOpenEdit(tempInv);
      }
    }
  };

  // File Upload Handler (PDF, JPEG, PNG, DOC up to 15MB)
  const handleFileUpload = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      setFormError('File size exceeds 15 MB limit. Please select a smaller document.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const doc: InvoiceDocumentFile = {
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        uploadedAt: new Date().toISOString(),
        url: base64,
      };
      setUploadedFile(doc);
      setFormError(null);
    };
    reader.onerror = () => {
      setFormError('Failed to read the file. Please try another document.');
    };
    reader.readAsDataURL(file);
  };

  // Save Modal Form
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    if (modalFormData.uploadedToGstPortal === 'Yes' && !modalFormData.gstPortalUploadDate) {
      setFormError('Please select the GST Portal Upload Date when status is marked as Yes.');
      return;
    }

    let finalNotes = modalFormData.notes.trim();
    if (uploadedFile && !finalNotes.includes(uploadedFile.name)) {
      const attachmentNote = `[Attached Invoice File: ${uploadedFile.name} (${(uploadedFile.size / 1024).toFixed(1)} KB)]`;
      finalNotes = finalNotes ? `${finalNotes}\n${attachmentNote}` : attachmentNote;
    }

    const payload: GstInvoice = {
      ...selectedInvoice,
      brand: selectedInvoice.brand || activeBrand,
      invoiceNumber: modalFormData.invoiceNumber.trim(),
      uploadedToGstPortal: modalFormData.uploadedToGstPortal,
      gstPortalUploadDate:
        modalFormData.uploadedToGstPortal === 'Yes' ? modalFormData.gstPortalUploadDate : '',
      invoiceFile: uploadedFile || undefined,
      notes: finalNotes,
      updatedAt: new Date().toISOString(),
    };

    const res = await saveGstInvoice(payload);
    if (res.success) {
      setIsModalOpen(false);
      setSelectedInvoice(null);
      setUploadedFile(null);
    } else {
      setFormError(res.error || 'Failed to save GST Invoice details.');
    }
  };

  // CSV Export with ALL 12 EXACT FIELDS
  const handleExportCsv = () => {
    exportToCsv(
      filteredInvoices,
      [
        { key: 'paymentId', header: '1. Payment ID' },
        { key: 'projectId', header: '2. Project ID' },
        { key: 'clientId', header: '3. Client ID' },
        { key: 'clientName', header: '4. Client Name' },
        { key: 'paymentDate', header: '5. Payment Date' },
        {
          key: 'amountReceived',
          header: '6. Amount Received',
          format: (r) => `${r.currency || 'INR'} ${Number(r.amountReceived || 0).toLocaleString()}`,
        },
        {
          key: 'amountINR',
          header: '7. Amount (INR)',
          format: (r) => Number(r.amountINR || 0),
        },
        {
          key: 'gstAmountINR',
          header: '8. GST Amount (18%) (INR)',
          format: (r) => Number(r.gstAmountINR || Math.round((r.amountINR || 0) * 0.18)),
        },
        {
          key: 'invoiceNumber',
          header: '9. Invoice Number (Zoho INV Number)',
          format: (r) => r.invoiceNumber || 'Pending Draft',
        },
        {
          key: 'uploadedToGstPortal',
          header: '10. Uploaded to GST Portal',
          format: (r) => r.uploadedToGstPortal || 'No',
        },
        {
          key: 'gstPortalUploadDate',
          header: '11. GST Portal Upload Date',
          format: (r) => (r.uploadedToGstPortal === 'Yes' && r.gstPortalUploadDate ? r.gstPortalUploadDate : 'N/A'),
        },
        {
          key: 'notes',
          header: '12. Notes',
          format: (r) => r.notes || '',
        },
      ],
      `${brandPrefix}_GST_Invoices_Ledger_${new Date().toISOString().slice(0, 10)}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Module Toolbar & 4 KPIs */}
      <CommonModuleToolbar
        moduleTitle="GST Invoice & Zoho Tracker"
        moduleSubtitle="Automatic GST filing compliance, Zoho Books invoice reconciliation, and 18% GST output tax audit ledger"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={portalFilter}
        onStatusFilterChange={(v) => setPortalFilter(v as 'ALL' | 'Yes' | 'No')}
        statusOptions={[
          { label: 'All Portal Statuses', value: 'ALL' },
          { label: 'Uploaded to Portal (Yes)', value: 'Yes' },
          { label: 'Pending Upload (No)', value: 'No' },
        ]}
        onAddNew={handleOpenToolbarModal}
        addNewLabel="+ Update / Upload GST Invoice"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredInvoices.length}
      />

      {/* Sync Status Banner (ERPNext Desk UI Monochrome) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-white border border-[#e2e8f0] text-xs text-[#0f172a] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-black text-white shadow-xs">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-black tracking-tight">
              Automatic Payments & GST Sync Active
            </div>
            <p className="text-[11px] text-[#64748b] mt-0.5">
              All transactions recorded with <strong className="text-black font-semibold">Payment Mode == "GST Invoice"</strong> are automatically bound to this GST ledger with 18% output tax calculation and Zoho invoice placeholders.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748b] border-r border-[#e2e8f0] pr-3">
            <span className="w-2 h-2 rounded-full bg-black" />
            <span>Zoho & GSTR-1 Audit Ready</span>
          </div>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing || isGstInvoicesLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white hover:bg-neutral-800 active:bg-black disabled:opacity-50 text-xs font-semibold tracking-tight transition-colors shadow-xs"
            title="Re-synchronize all GST payments from the Payments module into the GST Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || isGstInvoicesLoading ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Payments Now'}</span>
          </button>
        </div>
      </div>

      {/* Database Error Banner (Distinguishing failure from empty result) */}
      {gstInvoiceError && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div>
              <div className="font-semibold text-rose-900 dark:text-rose-100">
                Azure SQL Database Notice: GST Invoice Fetch Failed
              </div>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5">
                {gstInvoiceError}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refreshGstInvoices()}
            disabled={isGstInvoicesLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold tracking-tight transition-colors shadow-xs cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGstInvoicesLoading ? 'animate-spin' : ''}`} />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* GST Invoices Table with ALL 12 COLUMNS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">1. Payment ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">2. Project ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">3 & 4. Client</th>
                <th className="py-3 px-3.5 whitespace-nowrap">5. Payment Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap">6. Amount Received</th>
                <th className="py-3 px-3.5 whitespace-nowrap">7. Amount (INR)</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-slate-900 dark:text-white">
                  8. GST 18% (INR)
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap">9. Zoho INV # & File</th>
                <th className="py-3 px-3.5 whitespace-nowrap">10. GST Portal</th>
                <th className="py-3 px-3.5 whitespace-nowrap">11. Upload Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap">12. Notes</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {isGstInvoicesLoading && filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-8 h-8 mx-auto mb-2 text-slate-400 animate-spin" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Loading GST Invoices...</p>
                    <p className="text-xs mt-1 text-slate-500">Querying Azure SQL Database ledger...</p>
                  </td>
                </tr>
              ) : gstInvoiceError && filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-rose-500 dark:text-rose-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                      Azure SQL Database Unavailable or Query Failed
                    </p>
                    <p className="text-xs mt-1 text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      {gstInvoiceError}
                    </p>
                    <button
                      type="button"
                      onClick={() => refreshGstInvoices()}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white hover:bg-neutral-800 text-xs font-semibold tracking-tight transition-colors shadow-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Fetch</span>
                    </button>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <FileCheck className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No GST Invoice records found.</p>
                    <p className="text-xs mt-1 text-slate-500">
                      Click "+ Update / Upload GST Invoice" above or record a payment with "GST Invoice" payment mode.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const isUploaded = inv.uploadedToGstPortal === 'Yes';
                  return (
                    <tr
                      key={inv.id || inv.paymentId}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Payment ID */}
                      <td className="py-3.5 px-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {inv.paymentId}
                      </td>

                      {/* 2. Project ID */}
                      <td className="py-3.5 px-3.5 max-w-[200px]">
                        <div
                          className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate"
                          title={inv.projectId}
                        >
                          {inv.projectId}
                        </div>
                      </td>

                      {/* 3 & 4. Client ID & Client Name */}
                      <td className="py-3.5 px-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {inv.clientName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {inv.clientId}
                        </div>
                      </td>

                      {/* 5. Payment Date */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatDate(inv.paymentDate)}
                      </td>

                      {/* 6. Amount Received */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {inv.currency || 'INR'} {Number(inv.amountReceived || 0).toLocaleString()}
                      </td>

                      {/* 7. Amount (INR) */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(inv.amountINR)}
                      </td>

                      {/* 8. GST Amount (18%) */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatINR(inv.gstAmountINR || Math.round(inv.amountINR * 0.18))}
                      </td>

                      {/* 9. Invoice Number & Attached File */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="space-y-1">
                          {inv.invoiceNumber ? (
                            <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 inline-block">
                              {inv.invoiceNumber}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Pending Draft
                            </span>
                          )}

                          {inv.invoiceFile && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 font-mono">
                              <Paperclip className="w-3 h-3 text-slate-500" />
                              <span className="truncate max-w-[130px]" title={inv.invoiceFile.name}>
                                {inv.invoiceFile.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 10. Uploaded to GST Portal (Monochrome) */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {isUploaded ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                            <CheckCircle className="w-3 h-3 text-white dark:text-slate-900" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            <Clock className="w-3 h-3 text-slate-500" />
                            No (Pending)
                          </span>
                        )}
                      </td>

                      {/* 11. GST Portal Upload Date */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                        {isUploaded && inv.gstPortalUploadDate ? (
                          formatDate(inv.gstPortalUploadDate)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 12. Notes */}
                      <td className="py-3.5 px-3.5 max-w-[180px]">
                        {inv.notes ? (
                          <span className="truncate block text-slate-600 dark:text-slate-300 text-[11px]" title={inv.notes}>
                            {inv.notes}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">—</span>
                        )}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(inv)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-semibold shadow-xs transition-colors"
                            title="Upload / Update GST Invoice & Filing Details"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload / Update</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              confirmDelete({
                                moduleName: 'GST Invoice',
                                recordTitle: inv.invoiceNumber ? `Invoice #${inv.invoiceNumber}` : `Payment ${inv.paymentId}`,
                                recordId: inv.id,
                                warningNote: 'This will permanently remove this GST invoice record from Azure SQL.',
                                onConfirm: async () => {
                                  await deleteGstInvoice(inv.id);
                                },
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-semibold shadow-xs transition-colors"
                            title="Delete GST Invoice Record"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                            <span>Delete</span>
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

      {/* EDIT / UPDATE GST INVOICE MODAL (EXACT 12 FIELDS: 8 AUTO-FILLED + 4 MANUAL) */}
      {isModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Update / Upload GST Invoice
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Zoho INV Number, file document upload, and GSTR-1 portal filing for {selectedInvoice.paymentId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedInvoice(null);
                  setUploadedFile(null);
                }}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-800 dark:text-slate-200" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Record Selector (if multiple exist) */}
              {gstInvoices.length > 1 && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Select GST Payment / Invoice Record to Edit:</span>
                    <span className="text-[11px] font-normal text-slate-400 font-mono">
                      {gstInvoices.length} invoices available
                    </span>
                  </label>
                  <select
                    value={selectedInvoice.id || selectedInvoice.paymentId}
                    onChange={(e) => {
                      const inv = gstInvoices.find((i) => (i.id || i.paymentId) === e.target.value);
                      if (inv) handleOpenEdit(inv);
                    }}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 outline-none"
                  >
                    {gstInvoices.map((i) => (
                      <option key={i.id || i.paymentId} value={i.id || i.paymentId}>
                        {i.paymentId} — {i.clientName} ({i.invoiceNumber || 'Draft'}) — {formatINR(i.amountINR)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* A. AUTO-FILLED & READ-ONLY FIELDS (8 FIELDS) */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    A. Auto-Filled & Read-Only Fields (Pulled from Payment Record)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-medium">
                    Mode: GST Invoice
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* 1. Payment ID */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      1. Payment ID
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedInvoice.paymentId}
                      className="w-full px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-not-allowed"
                    />
                  </div>

                  {/* 2. Project ID */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      2. Project ID
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedInvoice.projectId}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* 3. Client ID */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      3. Client ID
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedInvoice.clientId}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* 4. Client Name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      4. Client Name
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedInvoice.clientName}
                      className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-not-allowed"
                    />
                  </div>

                  {/* 5. Payment Date */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      5. Payment Date
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formatDate(selectedInvoice.paymentDate)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* 6. Amount Received */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      6. Amount Received
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={`${selectedInvoice.currency || 'INR'} ${Number(selectedInvoice.amountReceived || 0).toLocaleString()}`}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* 7. Amount (INR) */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      7. Amount (INR)
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={formatINR(selectedInvoice.amountINR)}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white cursor-not-allowed"
                    />
                  </div>

                  {/* 8. GST Amount (18%) */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>8. GST Amount (18%)</span>
                      <span className="text-[10px] font-normal text-slate-400">Amount (INR) * 0.18</span>
                    </label>
                    <div className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                      <span>{formatINR(selectedInvoice.gstAmountINR || Math.round(selectedInvoice.amountINR * 0.18))}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-normal">
                        18% Output GST
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* B. MANUALLY FILLED FIELDS & INVOICE FILE UPLOAD */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <Edit2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  B. Manually Filled Fields & Document Upload
                </div>

                {/* 9. Invoice Number (Zoho INV Number) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>
                      9. Invoice Number (Zoho INV Number)
                    </span>
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      e.g., INV-2026-001 or ZOHO-8819
                    </span>
                  </label>
                  <input
                    type="text"
                    value={modalFormData.invoiceNumber}
                    onChange={(e) =>
                      setModalFormData((prev) => ({ ...prev, invoiceNumber: e.target.value }))
                    }
                    placeholder="e.g. INV-2026-001 or ZOHO-INV-8819"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 outline-none"
                  />
                </div>

                {/* File Upload Component for GST Invoice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                      <span>Upload Official GST Tax Invoice Document</span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      PDF, JPG, PNG, DOC (Max 15MB)
                    </span>
                  </label>

                  {uploadedFile ? (
                    <div className="p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <div className="p-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={uploadedFile.name}>
                            {uploadedFile.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                            {(uploadedFile.size / 1024).toFixed(1)} KB · Uploaded {new Date(uploadedFile.uploadedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="cursor-pointer px-2.5 py-1 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 transition-colors">
                          <span>Replace</span>
                          <input
                            type="file"
                            accept=".pdf,image/png,image/jpeg,image/jpg,.doc,.docx"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleFileUpload(e.target.files[0]);
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setUploadedFile(null)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          title="Remove attached file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                        isDragging
                          ? 'border-slate-900 bg-slate-100 dark:border-white dark:bg-slate-800'
                          : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40'
                      }`}
                    >
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg,image/jpg,.doc,.docx"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="flex flex-col items-center justify-center pointer-events-none space-y-1">
                        <Upload className="w-5 h-5 text-slate-500 mb-1" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Click to select or drag & drop invoice document
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Attach official Zoho Tax Invoice PDF or GSTR-1 acknowledgement receipt
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 10. Uploaded to GST Portal */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      10. Uploaded to GST Portal <span className="text-slate-800 dark:text-slate-200">*</span>
                    </label>
                    <select
                      value={modalFormData.uploadedToGstPortal}
                      onChange={(e) => {
                        const val = e.target.value as GstPortalUploadStatus;
                        setModalFormData((prev) => ({
                          ...prev,
                          uploadedToGstPortal: val,
                          gstPortalUploadDate:
                            val === 'Yes' && !prev.gstPortalUploadDate
                              ? new Date().toISOString().slice(0, 10)
                              : val === 'No'
                              ? ''
                              : prev.gstPortalUploadDate,
                        }));
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 outline-none font-medium"
                    >
                      <option value="No">No (Pending Portal Filing)</option>
                      <option value="Yes">Yes (Uploaded to Government Portal)</option>
                    </select>
                  </div>

                  {/* 11. GST Portal Upload Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>
                        11. GST Portal Upload Date
                        {modalFormData.uploadedToGstPortal === 'Yes' && (
                          <span className="text-slate-800 dark:text-slate-200"> *</span>
                        )}
                      </span>
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        Enabled when status is 'Yes'
                      </span>
                    </label>
                    <input
                      type="date"
                      disabled={modalFormData.uploadedToGstPortal !== 'Yes'}
                      value={modalFormData.gstPortalUploadDate}
                      onChange={(e) =>
                        setModalFormData((prev) => ({
                          ...prev,
                          gstPortalUploadDate: e.target.value,
                        }))
                      }
                      className={`w-full px-3 py-2 text-xs rounded-lg border ${
                        modalFormData.uploadedToGstPortal === 'Yes'
                          ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed'
                      } outline-none`}
                    />
                  </div>
                </div>

                {/* 12. Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    12. Notes
                  </label>
                  <textarea
                    rows={3}
                    value={modalFormData.notes}
                    onChange={(e) =>
                      setModalFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Enter GSTR-1 ARN number, Zoho Books synchronization remarks, or audit notes..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 outline-none resize-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedInvoice(null);
                    setUploadedFile(null);
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg text-white bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-xs transition-colors"
                >
                  Save & Upload GST Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
