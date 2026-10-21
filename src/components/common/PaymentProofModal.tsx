import React, { useState, useMemo } from 'react';
import { PaymentProofDocument } from '../../types/crm';
import { formatINR, formatDate } from '../../utils/formatters';
import {
  X,
  Download,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  FileCheck,
  FileText,
  CreditCard,
  Building,
  User,
  Calendar,
  ShieldCheck,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Image as ImageIcon,
} from 'lucide-react';

interface PaymentProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  paymentId: string;
  partyLabel: string; // e.g. "Client: TechCorp Infotech Pvt Ltd" or "Employee: Saumya Khandelwal"
  amountINR: number;
  paymentDate: string;
  paymentMode: string;
  referenceUtr?: string;
  proofDocument?: PaymentProofDocument | string;
  proofNotes?: string;
  onEditProof?: () => void;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const PaymentProofModal: React.FC<PaymentProofModalProps> = ({
  isOpen,
  onClose,
  title,
  paymentId,
  partyLabel,
  amountINR,
  paymentDate,
  paymentMode,
  referenceUtr,
  proofDocument: rawProofDocument,
  proofNotes,
  onEditProof,
}) => {
  const [copiedUtr, setCopiedUtr] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Safely parse proofDocument in case it was serialized as a string
  const proofDoc: PaymentProofDocument | undefined = useMemo(() => {
    if (!rawProofDocument) return undefined;
    if (typeof rawProofDocument === 'object') {
      return rawProofDocument;
    }
    if (typeof rawProofDocument === 'string' && rawProofDocument.trim()) {
      try {
        let parsed = JSON.parse(rawProofDocument);
        while (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            break;
          }
        }
        if (parsed && typeof parsed === 'object') {
          return parsed as PaymentProofDocument;
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [rawProofDocument]);

  if (!isOpen) return null;

  const handleCopyUtr = () => {
    if (referenceUtr) {
      navigator.clipboard.writeText(referenceUtr);
      setCopiedUtr(true);
      setTimeout(() => setCopiedUtr(false), 2000);
    }
  };

  const fileUrl = proofDoc?.url || proofDoc?.externalUrl || '';

  const isImage = Boolean(
    fileUrl?.startsWith('data:image/') ||
    fileUrl?.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp|svg)(\?.*)?$/i) ||
    proofDoc?.name?.match(/\.(png|jpg|jpeg|webp|svg)$/i) ||
    proofDoc?.type?.startsWith('image/')
  );

  const isPdf = Boolean(
    fileUrl?.startsWith('data:application/pdf') ||
    fileUrl?.match(/^https?:\/\/.*\.pdf(\?.*)?$/i) ||
    proofDoc?.name?.match(/\.pdf$/i) ||
    proofDoc?.type?.includes('pdf')
  );

  const effectiveNotes = proofNotes || proofDoc?.notes || '';

  // Minimalist ERPNext Desk Monochrome Clearance Voucher Fallback
  const renderMonochromeVoucher = () => (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded border border-neutral-300 dark:border-neutral-700 p-6 shadow-sm font-sans space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-black text-white flex items-center justify-center font-bold text-xs">
            ₹
          </div>
          <div>
            <div className="font-bold tracking-tight text-xs uppercase text-neutral-900 dark:text-neutral-100">
              Clearance & Settlement Voucher
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Electronic Ledger Verification
            </div>
          </div>
        </div>
        <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700">
          Verified
        </span>
      </div>

      <div className="space-y-2.5 py-1 text-xs">
        <div className="flex justify-between items-baseline border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <span className="text-neutral-500 dark:text-neutral-400">Settled Amount:</span>
          <span className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {formatINR(amountINR)}
          </span>
        </div>
        <div className="flex justify-between text-neutral-600 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <span className="text-neutral-500 dark:text-neutral-400">Transaction ID:</span>
          <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{paymentId}</span>
        </div>
        <div className="flex justify-between text-neutral-600 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <span className="text-neutral-500 dark:text-neutral-400">Bank Reference / UTR:</span>
          <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{referenceUtr || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-neutral-600 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <span className="text-neutral-500 dark:text-neutral-400">Payment Mode:</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{paymentMode}</span>
        </div>
        <div className="flex justify-between text-neutral-600 dark:text-neutral-300 border-b border-neutral-100 dark:border-neutral-800 pb-2">
          <span className="text-neutral-500 dark:text-neutral-400">Settlement Date:</span>
          <span className="font-mono">{formatDate(paymentDate)}</span>
        </div>
        <div className="flex justify-between text-neutral-600 dark:text-neutral-300">
          <span className="text-neutral-500 dark:text-neutral-400">Stakeholder:</span>
          <span className="font-medium truncate max-w-[200px] text-right text-neutral-900 dark:text-neutral-100">{partyLabel}</span>
        </div>
      </div>

      <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-300">
          <ShieldCheck className="w-3.5 h-3.5 text-black dark:text-white" />
          <span>Accounts Clearance Verified</span>
        </span>
        <span className="font-mono text-[10px]">No physical image attached</span>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-modal-title"
      style={{ fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded shadow-2xl overflow-hidden">
        {/* Pinned Modal Header */}
        <div className="shrink-0 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/90 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded bg-black text-white flex items-center justify-center shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="proof-modal-title" className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                  {title}
                </h3>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700">
                  {paymentId}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                {partyLabel} • Settled {formatDate(paymentDate)} • {paymentMode}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-black dark:hover:text-white p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Main Visual Display Container */}
          <div className="relative rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-950 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[300px] overflow-hidden">
            {fileUrl ? (
              isImage ? (
                <div className="relative group max-w-full flex items-center justify-center">
                  <img
                    src={fileUrl}
                    alt={proofDoc?.name || 'Payment Proof Screenshot'}
                    className={`rounded border border-neutral-200 dark:border-neutral-800 object-contain transition-all duration-200 bg-white shadow-sm ${
                      isZoomed ? 'max-h-[75vh] w-auto max-w-full' : 'max-h-[380px] w-auto max-w-full'
                    }`}
                  />
                  {/* Floating Image Control Bar */}
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setIsZoomed(!isZoomed)}
                      className="px-2.5 py-1 rounded bg-black/80 hover:bg-black text-white text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                      title={isZoomed ? 'Reset Zoom' : 'Zoom In'}
                    >
                      {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                      <span>{isZoomed ? 'Reset' : 'Zoom'}</span>
                    </button>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded bg-black/80 hover:bg-black text-white text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                      title="Open full-resolution image in new tab"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Full View</span>
                    </a>
                  </div>
                </div>
              ) : isPdf ? (
                <div className="p-8 text-center text-neutral-800 dark:text-neutral-200 space-y-4 max-w-sm">
                  <div className="w-16 h-16 mx-auto rounded bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-900 dark:text-neutral-100">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                      {proofDoc?.name || 'Payment_Voucher.pdf'}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      Portable Document Format ({formatFileSize(proofDoc?.size)})
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <a
                      href={fileUrl}
                      download={proofDoc?.name || `Receipt_${paymentId}.pdf`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-black hover:bg-neutral-800 text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </a>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Tab</span>
                    </a>
                  </div>
                </div>
              ) : (
                renderMonochromeVoucher()
              )
            ) : (
              renderMonochromeVoucher()
            )}
          </div>

          {/* Transaction Metadata & Proof Notes Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Card: Financial Clearance Data */}
            <div className="p-4 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Transaction Clearance Data
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400">Settled Amount:</span>
                  <span className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100">
                    {formatINR(amountINR)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400">Bank Reference / UTR:</span>
                  <div className="flex items-center gap-1.5 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                    <span>{referenceUtr || 'N/A'}</span>
                    {referenceUtr && (
                      <button
                        type="button"
                        onClick={handleCopyUtr}
                        className="p-1 text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
                        title="Copy UTR Reference"
                      >
                        {copiedUtr ? <Check className="w-3 h-3 text-black dark:text-white" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-neutral-500 dark:text-neutral-400">Payment Mode:</span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{paymentMode}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 dark:text-neutral-400">Clearance Date:</span>
                  <span className="font-mono text-neutral-900 dark:text-neutral-100">
                    {formatDate(paymentDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Card: Proof Notes & File Audit Box */}
            <div className="p-4 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Proof & Verification Notes
                  </span>
                  <span className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                </div>

                <div className="p-3 rounded bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-200 min-h-[72px]">
                  {effectiveNotes ? (
                    <p className="whitespace-pre-wrap">{effectiveNotes}</p>
                  ) : (
                    <p className="text-neutral-400 italic">No custom clearance notes added for this voucher.</p>
                  )}
                </div>

                {proofDoc?.name && (
                  <div className="mt-2.5 text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                    <span className="truncate max-w-[200px] font-mono">File: {proofDoc.name}</span>
                    <span>{formatFileSize(proofDoc.size)}</span>
                  </div>
                )}
              </div>

              {/* Optional External Link */}
              {proofDoc?.externalUrl && (
                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <a
                    href={proofDoc.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-neutral-900 dark:text-neutral-100 hover:underline font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open External Drive / Banking Portal</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pinned Modal Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/90 z-10">
          <div>
            {onEditProof && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditProof();
                }}
                className="text-xs text-neutral-900 dark:text-neutral-100 hover:underline font-semibold"
              >
                Edit / Replace Proof
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {fileUrl && (
              <a
                href={fileUrl}
                download={proofDoc?.name || `Payment_Receipt_${paymentId}.png`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-black hover:bg-neutral-800 text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Proof</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded border border-neutral-300 dark:border-neutral-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
