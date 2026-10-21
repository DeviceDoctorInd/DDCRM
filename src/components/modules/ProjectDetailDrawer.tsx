import React from 'react';
import { Project, PaymentPhase } from '../../types/crm';
import { formatINR, formatDate, isPastDate } from '../../utils/formatters';
import {
  X,
  Briefcase,
  FileText,
  FileCheck,
  Download,
  ExternalLink,
  Layers,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  IndianRupee,
  User,
  Edit2,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { normalizeDocument, downloadDocument, openDocumentPreview } from '../../utils/documentViewer';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';

interface ProjectDetailDrawerProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (project: Project) => void;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ProjectDetailDrawer: React.FC<ProjectDetailDrawerProps> = ({
  project,
  isOpen,
  onClose,
  onEdit,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [previewState, setPreviewState] = React.useState<{
    isOpen: boolean;
    doc: any;
    docType: 'proposal' | 'contract';
  }>({
    isOpen: false,
    doc: null,
    docType: 'proposal',
  });

  if (!isOpen || !project) return null;

  const proposalDoc = normalizeDocument(project.proposalDocument);
  const contractDoc = normalizeDocument(project.contractDocument);

  const copyId = () => {
    navigator.clipboard.writeText(project.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOverdue =
    project.status !== 'Completed' &&
    project.status !== 'Cancelled' &&
    isPastDate(project.committedEndDate);

  const phases = project.paymentPhases || [];
  const receivedPhasesCount = phases.filter((p) => p.status === 'Received').length;
  const invoicedPhasesCount = phases.filter((p) => p.status === 'Invoiced').length;
  const totalPhasePercentage = phases.reduce((acc, p) => acc + (Number(p.percentage) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-black/10 dark:bg-slate-500/20 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 truncate max-w-md tracking-tight">
                  {project.id}
                </span>
                <button
                  type="button"
                  onClick={copyId}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Copy Project ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    project.status === 'Completed'
                      ? 'bg-slate-100 text-slate-800 dark:text-slate-200 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200'
                      : project.status === 'In Progress'
                      ? 'bg-slate-100 text-slate-800 dark:text-slate-200 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {project.status}
                </span>
              </div>

              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate">
                {project.clientName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Service: {project.serviceId} • PM: {project.projectManager}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(project);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-black hover:bg-neutral-800 text-white transition-colors shadow-xs"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Project</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Commercial & Timeline Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Contract Value
              </span>
              <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatINR(project.contractValue || 0)}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                {project.currency} {Number(project.contract || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Total Received
              </span>
              <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mt-1">
                {formatINR(project.totalReceived || 0)}
              </div>
              <div className="text-[10px] text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mt-0.5">
                {project.contractValue
                  ? `${Math.round(((project.totalReceived || 0) / project.contractValue) * 100)}% collected`
                  : '0%'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Outstanding Balance
              </span>
              <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mt-1">
                {formatINR(
                  project.balance !== undefined
                    ? project.balance
                    : Math.max(0, (project.contractValue || 0) - (project.totalReceived || 0))
                )}
              </div>
              <div className="text-[10px] text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mt-0.5">
                Payment mode: {project.paymentMode}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Committed Timeline
              </span>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
                {formatDate(project.startDate)} → {formatDate(project.committedEndDate)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                <span>{project.committedDays || 0} days</span>
                {isOverdue && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 dark:text-slate-200 font-bold">
                    Overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* PROJECT DOCUMENTS SECTION (Proposal & Contract) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
                <span>Project Documents (Proposal & Contract)</span>
              </h3>
              <span className="text-[11px] text-slate-400">Version controlled & downloadable</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Proposal Document Card */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-[#e2e8f0] dark:border-slate-800 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-black dark:text-white" />
                      <span>Proposal Document</span>
                    </span>
                    {proposalDoc ? (
                      <span className="text-[10px] font-semibold text-black bg-slate-100 dark:bg-slate-800 dark:text-slate-200 px-2 py-0.5 rounded border border-[#e2e8f0] dark:border-slate-700">
                        Proposal v1
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">None attached</span>
                    )}
                  </div>

                  {proposalDoc ? (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-[#e2e8f0] dark:border-slate-800 mb-3">
                      <p className="text-xs font-semibold text-black dark:text-white truncate" title={proposalDoc.name}>
                        {proposalDoc.name}
                      </p>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>{formatFileSize(proposalDoc.size)}</span>
                        <span>•</span>
                        <span>
                          {proposalDoc.uploadedAt
                            ? new Date(proposalDoc.uploadedAt).toLocaleDateString('en-IN')
                            : 'Uploaded'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-[#e2e8f0] dark:border-slate-700 text-center text-xs text-slate-400 mb-3">
                      No proposal document file uploaded
                    </div>
                  )}

                  {/* Proposal Notes */}
                  {(project.proposalDocumentNotes || proposalDoc?.notes) && (
                    <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-[#e2e8f0] dark:border-slate-800 mb-3">
                      <span className="font-semibold text-black dark:text-white block text-[10px] uppercase tracking-wider mb-0.5">
                        Proposal Scope & Notes:
                      </span>
                      {project.proposalDocumentNotes || proposalDoc?.notes}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {proposalDoc && (
                  <div className="flex items-center gap-2 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewState({ isOpen: true, doc: proposalDoc, docType: 'proposal' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 transition-colors shadow-xs"
                      title="Preview Proposal Document"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-800" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadDocument(project.id, proposalDoc, 'proposal')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-neutral-800 transition-colors shadow-xs"
                      title="Download Proposal Document"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>Download</span>
                    </button>

                    {proposalDoc.externalUrl && (
                      <a
                        href={proposalDoc.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-xs ml-auto"
                        title="Open external Drive storage"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>Drive</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Contract Document Card */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-[#e2e8f0] dark:border-slate-800 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-black dark:text-white" />
                      <span>Contract / Agreement Document</span>
                    </span>
                    {contractDoc ? (
                      <span className="text-[10px] font-semibold text-black bg-slate-100 dark:bg-slate-800 dark:text-slate-200 px-2 py-0.5 rounded border border-[#e2e8f0] dark:border-slate-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-black dark:text-white" />
                        Signed MSA
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">None attached</span>
                    )}
                  </div>

                  {contractDoc ? (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-[#e2e8f0] dark:border-slate-800 mb-3">
                      <p className="text-xs font-semibold text-black dark:text-white truncate" title={contractDoc.name}>
                        {contractDoc.name}
                      </p>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>{formatFileSize(contractDoc.size)}</span>
                        <span>•</span>
                        <span>
                          {contractDoc.uploadedAt
                            ? new Date(contractDoc.uploadedAt).toLocaleDateString('en-IN')
                            : 'Uploaded'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-[#e2e8f0] dark:border-slate-700 text-center text-xs text-slate-400 mb-3">
                      No signed contract document uploaded
                    </div>
                  )}

                  {/* Contract Notes */}
                  {(project.contractDocumentNotes || contractDoc?.notes) && (
                    <div className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-[#e2e8f0] dark:border-slate-800 mb-3">
                      <span className="font-semibold text-black dark:text-white block text-[10px] uppercase tracking-wider mb-0.5">
                        Terms & SLA Notes:
                      </span>
                      {project.contractDocumentNotes || contractDoc?.notes}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {contractDoc && (
                  <div className="flex items-center gap-2 pt-2.5 border-t border-[#e2e8f0] dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewState({ isOpen: true, doc: contractDoc, docType: 'contract' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 transition-colors shadow-xs"
                      title="Preview Contract Agreement"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-800" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadDocument(project.id, contractDoc, 'contract')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-black text-white hover:bg-neutral-800 transition-colors shadow-xs"
                      title="Download Contract Document"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>Download</span>
                    </button>

                    {contractDoc.externalUrl && (
                      <a
                        href={contractDoc.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-xs ml-auto"
                        title="Open external Drive storage"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>Drive</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PAYMENT PHASES & MILESTONES TABLE SECTION */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200" />
                  <span>Phases of Payment & Milestone Schedule</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {phases.length} Payment Milestones ({receivedPhasesCount} Paid, {invoicedPhasesCount} Invoiced,{' '}
                  {phases.length - receivedPhasesCount - invoicedPhasesCount} Pending)
                </p>
              </div>

              <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                Total Allocated: {totalPhasePercentage.toFixed(1)}% of Contract Value
              </div>
            </div>

            {/* Milestones Table */}
            <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Phase / Milestone</th>
                      <th className="py-2.5 px-3">Share (%)</th>
                      <th className="py-2.5 px-3">Amount ({project.currency})</th>
                      <th className="py-2.5 px-3">Amount (INR)</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-4">Deliverables & Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {phases.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          No payment phases configured for this project.
                        </td>
                      </tr>
                    ) : (
                      phases.map((phase, idx) => {
                        let statusColor =
                          'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                        if (phase.status === 'Received') {
                          statusColor =
                            'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                        } else if (phase.status === 'Invoiced') {
                          statusColor =
                            'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                        } else if (phase.status === 'Overdue') {
                          statusColor =
                            'bg-slate-50 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 dark:border-slate-300 dark:border-slate-700';
                        }

                        return (
                          <tr key={phase.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <span>{phase.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                              {phase.percentage}%
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-800 dark:text-slate-200">
                              {Number(phase.amount || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200">
                              {formatINR(phase.amountINR || 0)}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                              {formatDate(phase.dueDate)}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${statusColor}`}>
                                {phase.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-xs">
                              {phase.notes ? (
                                <span className="text-[11px]">{phase.notes}</span>
                              ) : (
                                <span className="text-slate-300 italic text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* General Project Notes */}
          {project.notes && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Project Notes & Scope Specifications
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {project.notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
          >
            Close Overview
          </button>
        </div>
      </div>

      {/* High-contrast Monochrome Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={previewState.isOpen}
        onClose={() => setPreviewState((prev) => ({ ...prev, isOpen: false }))}
        document={previewState.doc}
        documentType={previewState.docType}
        projectId={project.id}
        clientName={project.clientName}
      />
    </div>
  );
};
