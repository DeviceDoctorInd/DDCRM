import React, { useState } from 'react';
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
} from 'lucide-react';

interface PaymentProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  paymentId: string;
  partyLabel: string; // e.g. "Client: Zenith Logistics" or "Employee: Saumya Khandelwal"
  amountINR: number;
  paymentDate: string;
  paymentMode: string;
  referenceUtr?: string;
  proofDocument?: PaymentProofDocument;
  proofNotes?: string;
  onEditProof?: () => void;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '0 KB';
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
  proofDocument,
  proofNotes,
  onEditProof,
}) => {
  const [copiedUtr, setCopiedUtr] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  if (!isOpen) return null;

  const handleCopyUtr = () => {
    if (referenceUtr) {
      navigator.clipboard.writeText(referenceUtr);
      setCopiedUtr(true);
      setTimeout(() => setCopiedUtr(false), 2000);
    }
  };

  const isImage =
    proofDocument?.url?.startsWith('data:image/') ||
    proofDocument?.name?.match(/\.(png|jpg|jpeg|webp|svg)$/i);

  const isPdf =
    proofDocument?.url?.startsWith('data:application/pdf') ||
    proofDocument?.name?.match(/\.pdf$/i);

  const effectiveNotes = proofNotes || proofDocument?.notes;

  // Fallback realistic vector voucher generator if only sample without physical image file
  const renderFallbackVoucher = () => (
    <div className="w-full max-w-sm mx-auto bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-xl p-5 border border-slate-700 shadow-xl font-mono text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-500/20 text-slate-800 dark:text-slate-200 flex items-center justify-center font-bold">
            ₹
          </div>
          <div>
            <div className="font-bold tracking-wider text-[11px] text-slate-200">
              PAYMENT TRANSACTION VOUCHER
            </div>
            <div className="text-[10px] text-slate-400">Device Doctor India Official Ledger</div>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold">
          VERIFIED
        </span>
      </div>

      <div className="space-y-2 py-2">
        <div className="flex justify-between items-center text-slate-300">
          <span className="text-slate-400">Amount Paid:</span>
          <span className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatINR(amountINR)}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span className="text-slate-400">Transaction ID:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{paymentId}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span className="text-slate-400">Bank Reference / UTR:</span>
          <span className="font-semibold text-white">{referenceUtr || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span className="text-slate-400">Payment Mode:</span>
          <span>{paymentMode}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span className="text-slate-400">Settlement Date:</span>
          <span>{formatDate(paymentDate)}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span className="text-slate-400">Stakeholder:</span>
          <span className="truncate max-w-[160px] text-right">{partyLabel}</span>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
        <span className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-sans">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Accounts Verified</span>
        </span>
        <span>Electronic Clearance</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/10 dark:bg-slate-500/20 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {title}
                </h3>
                <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700">
                  {paymentId}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {partyLabel} • {formatDate(paymentDate)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Main Screenshot / Receipt Preview Container */}
          <div className="relative rounded-xl bg-slate-950 border border-slate-800 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[260px] overflow-hidden">
            {proofDocument?.url ? (
              isImage ? (
                <div className="relative group max-w-full flex items-center justify-center">
                  <img
                    src={proofDocument.url}
                    alt={proofDocument.name || 'Payment Receipt Proof'}
                    className={`rounded-lg object-contain transition-all duration-200 ${
                      isZoomed ? 'max-h-[75vh] w-auto' : 'max-h-[360px] w-auto'
                    }`}
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setIsZoomed(!isZoomed)}
                      className="p-1.5 rounded-md bg-slate-900/80 text-white hover:bg-slate-800 border border-slate-700 text-xs flex items-center gap-1"
                      title={isZoomed ? 'Fit to window' : 'Zoom In'}
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>{isZoomed ? 'Reset' : 'Zoom'}</span>
                    </button>
                    <a
                      href={proofDocument.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-md bg-slate-900/80 text-white hover:bg-slate-800 border border-slate-700 text-xs flex items-center gap-1"
                      title="Open full image in new tab"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : isPdf ? (
                <div className="p-8 text-center text-slate-300 space-y-3">
                  <FileText className="w-12 h-12 mx-auto text-slate-800 dark:text-slate-200" />
                  <div>
                    <p className="font-semibold text-sm text-white">{proofDocument.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      PDF Document Receipt ({formatFileSize(proofDocument.size)})
                    </p>
                  </div>
                  <a
                    href={proofDocument.url}
                    download={proofDocument.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF Receipt</span>
                  </a>
                </div>
              ) : (
                renderFallbackVoucher()
              )
            ) : (
              renderFallbackVoucher()
            )}
          </div>

          {/* Transaction Metadata & Proof Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Financial & Reference Details */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Transaction Clearance Data
              </span>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400">Amount Settled:</span>
                  <span className="text-base font-bold font-mono text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                    {formatINR(amountINR)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400">Reference / UTR:</span>
                  <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    <span>{referenceUtr || 'N/A'}</span>
                    {referenceUtr && (
                      <button
                        type="button"
                        onClick={handleCopyUtr}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Copy UTR Number"
                      >
                        {copiedUtr ? (
                          <Check className="w-3 h-3 text-slate-800 dark:text-slate-200" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400">Payment Mode:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{paymentMode}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Clearance Date:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {formatDate(paymentDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Payment Proof Notes & Audit Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Payment Proof & Audit Notes
                  </span>
                  <span className="text-[10px] text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 min-h-[64px]">
                  {effectiveNotes ? (
                    <p className="whitespace-pre-wrap">{effectiveNotes}</p>
                  ) : (
                    <p className="text-slate-400 italic">No specific proof notes added for this voucher.</p>
                  )}
                </div>

                {proofDocument?.name && (
                  <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                    <span className="truncate max-w-[180px]">File: {proofDocument.name}</span>
                    <span>{formatFileSize(proofDocument.size)}</span>
                  </div>
                )}
              </div>

              {/* External Link or Secondary Action */}
              {proofDocument?.externalUrl && (
                <div className="pt-2 mt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <a
                    href={proofDocument.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-800 dark:text-slate-200 hover:underline font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Bank Portal / Google Drive Link</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div>
            {onEditProof && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditProof();
                }}
                className="text-xs text-slate-800 dark:text-slate-200 hover:underline font-medium"
              >
                Edit / Replace Proof
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {proofDocument?.url && (
              <a
                href={proofDocument.url}
                download={proofDocument.name || `Payment_Receipt_${paymentId}.png`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-black hover:bg-neutral-800 text-white transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Receipt</span>
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
