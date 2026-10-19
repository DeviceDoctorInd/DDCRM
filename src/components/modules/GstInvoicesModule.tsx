import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { GstInvoice, GstPortalUploadStatus } from '../../types/crm';
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
} from 'lucide-react';

export const GstInvoicesModule: React.FC = () => {
  const { gstInvoices, payments, saveGstInvoice, activeBrand, brandPrefix } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [portalFilter, setPortalFilter] = useState<'ALL' | 'Yes' | 'No'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<GstInvoice | null>(null);
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

  // KPIs
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
      icon: <FileCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />,
    },
    {
      label: 'Total Invoice Amount',
      value: formatINR(totalAmountINR),
      subtext: 'Taxable payments turnover',
      icon: <IndianRupee className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
    },
    {
      label: 'Total 18% GST Amount',
      value: formatINR(totalGstAmountINR),
      subtext: 'Calculated 18% output GST',
      icon: <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
    },
    {
      label: 'Portal Upload Status',
      value: `${uploadedCount} Uploaded · ${pendingCount} Pending`,
      subtext: `${uploadedCount > 0 ? Math.round((uploadedCount / (totalCount || 1)) * 100) : 0}% compliance filed`,
      icon: <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
    },
  ];

  // Filtering
  const filteredInvoices = useMemo(() => {
    return gstInvoices.filter((inv) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        inv.paymentId.toLowerCase().includes(q) ||
        inv.projectId.toLowerCase().includes(q) ||
        inv.clientId.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
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

  // Quick Open Modal from toolbar
  const handleOpenToolbarModal = () => {
    if (gstInvoices.length > 0) {
      // Find first pending or first record
      const pending = gstInvoices.find((i) => i.uploadedToGstPortal === 'No') || gstInvoices[0];
      handleOpenEdit(pending);
    } else {
      setFormError('No GST payments found in Payments module. Record a payment with "GST Invoice" payment mode first.');
    }
  };

  // Save Modal Form
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    if (modalFormData.uploadedToGstPortal === 'Yes' && !modalFormData.gstPortalUploadDate) {
      setFormError('Please select the GST Portal Upload Date when status is marked as Yes.');
      return;
    }

    const payload: GstInvoice = {
      ...selectedInvoice,
      brand: selectedInvoice.brand || activeBrand,
      invoiceNumber: modalFormData.invoiceNumber.trim(),
      uploadedToGstPortal: modalFormData.uploadedToGstPortal,
      gstPortalUploadDate:
        modalFormData.uploadedToGstPortal === 'Yes' ? modalFormData.gstPortalUploadDate : '',
      notes: modalFormData.notes.trim(),
    };

    const res = await saveGstInvoice(payload);
    if (res.success) {
      setIsModalOpen(false);
      setSelectedInvoice(null);
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
        addNewLabel="+ Update GST Invoice"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredInvoices.length}
      />

      {/* Sync Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border border-cyan-200 dark:border-cyan-900/50 text-xs text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-600 text-white shadow-xs">
            <FileText className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Live Real-Time Sync Active:
            </span>{' '}
            All transactions from the{' '}
            <strong className="text-cyan-700 dark:text-cyan-400">Payments</strong> module with{' '}
            <code className="px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 font-mono text-[11px] text-cyan-800 dark:text-cyan-300">
              Payment Mode == "GST Invoice"
            </code>{' '}
            are automatically linked with 18% GST calculations.
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>Zoho Books Sync Ready</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* GST Invoices Table with ALL 12 COLUMNS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">1. Payment ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">2. Project ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">3 & 4. Client</th>
                <th className="py-3 px-3.5 whitespace-nowrap">5. Payment Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap">6. Amount Received</th>
                <th className="py-3 px-3.5 whitespace-nowrap">7. Amount (INR)</th>
                <th className="py-3 px-3.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                  8. GST 18% (INR)
                </th>
                <th className="py-3 px-3.5 whitespace-nowrap">9. Zoho INV #</th>
                <th className="py-3 px-3.5 whitespace-nowrap">10. GST Portal</th>
                <th className="py-3 px-3.5 whitespace-nowrap">11. Upload Date</th>
                <th className="py-3 px-3.5 whitespace-nowrap">12. Notes</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <FileCheck className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No GST Invoice records found.</p>
                    <p className="text-xs mt-1">
                      Payments marked with "GST Invoice" payment mode will automatically appear here.
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
                      <td className="py-3.5 px-3.5 font-mono font-semibold text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
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

                      {/* 8. GST Amount (18%) (Auto-calculated: Amount INR * 0.18) */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        {formatINR(inv.gstAmountINR || Math.round(inv.amountINR * 0.18))}
                      </td>

                      {/* 9. Invoice Number (Zoho INV Number) */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {inv.invoiceNumber ? (
                          <span className="font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            {inv.invoiceNumber}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-500 italic flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending Draft
                          </span>
                        )}
                      </td>

                      {/* 10. Uploaded to GST Portal */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {isUploaded ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60">
                            <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60">
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
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
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/50 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-xs font-medium transition-colors"
                          title="Edit / Update GST Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit / Update GST</span>
                        </button>
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
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-600 text-white shadow-md">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Edit / Update GST Invoice Details
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Zoho INV Number & GSTR-1 portal filing status for {selectedInvoice.paymentId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedInvoice(null);
                }}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveModal} className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* A. AUTO-FILLED & READ-ONLY FIELDS (8 FIELDS) */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    A. Auto-Filled & Read-Only Fields (Pulled from Payment Record)
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
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
                      className="w-full px-3 py-1.5 text-xs font-mono font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 cursor-not-allowed"
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
                      className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-not-allowed"
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
                    <label className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                      <span>8. GST Amount (18%)</span>
                      <span className="text-[10px] font-normal text-slate-400">Amount (INR) * 0.18</span>
                    </label>
                    <div className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
                      <span>{formatINR(selectedInvoice.gstAmountINR || Math.round(selectedInvoice.amountINR * 0.18))}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 font-normal">
                        Output Tax
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* B. MANUALLY FILLED FIELDS (4 FIELDS) */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <Edit2 className="w-3.5 h-3.5 text-cyan-600" />
                  B. Manually Filled Fields (Editable by User)
                </div>

                {/* 9. Invoice Number (Zoho INV Number) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>
                      9. Invoice Number (Zoho INV Number)
                    </span>
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      e.g., INV-2026-001
                    </span>
                  </label>
                  <input
                    type="text"
                    value={modalFormData.invoiceNumber}
                    onChange={(e) =>
                      setModalFormData((prev) => ({ ...prev, invoiceNumber: e.target.value }))
                    }
                    placeholder="e.g. INV-2026-001 or ZOHO-INV-8819"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 10. Uploaded to GST Portal */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      10. Uploaded to GST Portal <span className="text-rose-500">*</span>
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
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none font-medium"
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
                          <span className="text-rose-500"> *</span>
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
                          ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500'
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
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500 outline-none resize-none"
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
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg text-white bg-cyan-600 hover:bg-cyan-500 shadow-md transition-all active:scale-95"
                >
                  Save GST Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
