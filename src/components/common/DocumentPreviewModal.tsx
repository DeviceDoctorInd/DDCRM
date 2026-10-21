import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, FileText, FileCheck, Printer, CheckCircle } from 'lucide-react';
import { ProjectDocument } from '../../types/crm';
import { base64ToBlob, downloadDocument, normalizeDocument } from '../../utils/documentViewer';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: ProjectDocument | null | undefined;
  documentType: 'proposal' | 'contract';
  projectId: string;
  clientName?: string;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  documentType,
  projectId,
  clientName,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('application/pdf');

  const normalizedDoc = normalizeDocument(document);
  const isProposal = documentType === 'proposal';
  const docTitle = isProposal ? 'Project Proposal Document' : 'Contract & Signed Agreement';
  const fileName = normalizedDoc?.name || (isProposal ? `${projectId}_Proposal.pdf` : `${projectId}_Contract.pdf`);

  useEffect(() => {
    if (!isOpen || !normalizedDoc) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      return;
    }

    if (normalizedDoc.url && normalizedDoc.url.startsWith('data:')) {
      const res = base64ToBlob(normalizedDoc.url);
      if (res) {
        const objUrl = URL.createObjectURL(res.blob);
        setBlobUrl(objUrl);
        setMimeType(res.mimeType);
        return () => {
          URL.revokeObjectURL(objUrl);
          setBlobUrl(null);
        };
      }
    } else {
      // Use backend static document route as iframe source
      setBlobUrl(`/api/projects/${encodeURIComponent(projectId)}/documents/${documentType}`);
      setMimeType('application/pdf');
    }
  }, [isOpen, normalizedDoc?.url, projectId, documentType]);

  if (!isOpen || !normalizedDoc) return null;

  const handleDownload = () => {
    downloadDocument(projectId, normalizedDoc, documentType);
  };

  const handleOpenNewTab = () => {
    if (normalizedDoc.externalUrl && !normalizedDoc.url) {
      window.open(normalizedDoc.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (blobUrl) {
      window.open(blobUrl, '_blank');
    } else {
      window.open(`/api/projects/${encodeURIComponent(projectId)}/documents/${documentType}`, '_blank');
    }
  };

  const isImage =
    mimeType.startsWith('image/') ||
    Boolean(fileName.match(/\.(jpg|jpeg|png|webp|svg|gif)$/i));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0] bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-black text-white">
              {isProposal ? <FileText className="w-5 h-5" /> : <FileCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-black tracking-tight">{docTitle}</h3>
                <span className="text-[10px] font-semibold bg-black text-white px-2 py-0.5 rounded">
                  {isProposal ? 'Proposal v1' : 'Signed MSA'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">
                {fileName} • <span className="font-mono text-slate-700">{projectId}</span>
                {clientName ? ` • ${clientName}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 transition-colors"
              title="Open document in a dedicated browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-700" />
              <span>Open Tab</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-neutral-800 transition-colors shadow-xs"
              title="Download original file"
            >
              <Download className="w-3.5 h-3.5 text-white" />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-black rounded-lg hover:bg-slate-200 transition-colors ml-2"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Document Preview Area */}
        <div className="flex-1 overflow-auto bg-slate-100 p-4 min-h-[480px] flex items-center justify-center">
          {isImage && blobUrl ? (
            <div className="max-w-full max-h-[65vh] flex items-center justify-center p-2 bg-white rounded-lg border border-[#e2e8f0] shadow-sm">
              <img
                src={blobUrl}
                alt={fileName}
                className="max-h-[60vh] max-w-full object-contain rounded"
              />
            </div>
          ) : blobUrl ? (
            <iframe
              src={blobUrl}
              title={fileName}
              className="w-full h-[65vh] bg-white rounded-lg border border-[#e2e8f0] shadow-sm"
            />
          ) : (
            <div className="p-8 bg-white rounded-xl border border-[#e2e8f0] text-center max-w-md">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-800">Document Archive Reference</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                This document is indexed in the Azure SQL enterprise database. You can trigger an instant download or open the verified server view.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-black text-white hover:bg-neutral-800 transition-colors"
              >
                <Download className="w-4 h-4" /> Download Document
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#e2e8f0] bg-white text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Azure App Service & SQL Cloud Archive</span>
            {normalizedDoc.uploadedAt && (
              <span className="text-slate-400">
                • Uploaded on {new Date(normalizedDoc.uploadedAt).toLocaleDateString('en-IN')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
