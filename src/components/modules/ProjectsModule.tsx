import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { Project, ProjectStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatINR, formatDate, isPastDate } from '../../utils/formatters';
import { ProjectDetailDrawer } from './ProjectDetailDrawer';
import {
  Briefcase,
  Clock,
  CheckCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  FileSpreadsheet,
  IndianRupee,
  FileText,
  FileCheck,
  Layers,
  Eye,
  Download,
  ExternalLink,
} from 'lucide-react';

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Proposal', value: 'Proposal' },
  { label: 'Contracted', value: 'Contracted' },
  { label: 'In Progress', value: 'In Progress' },
  { label: 'On Hold', value: 'On Hold' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
];

export const ProjectsModule: React.FC = () => {
  const {
    projects,
    deleteProject,
    getClientById,
    getServiceById,
    getProjectExpensesTotalINR,
    openAddProjectModal,
    openEditProjectModal,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<Project | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // KPIs
  const totalProjects = projects.length;
  const inProgressProjects = projects.filter((p) => p.status === 'In Progress').length;
  const contractedOrProposal = projects.filter(
    (p) => p.status === 'Proposal' || p.status === 'Contracted'
  ).length;
  const totalValue = projects.reduce((acc, p) => acc + (p.contractValue || 0), 0);

  const kpis: KpiCardItem[] = [
    {
      label: 'Client Projects',
      value: totalProjects,
      subtext: 'Registered client contracts',
      icon: <Briefcase className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'In Progress Sprints',
      value: inProgressProjects,
      subtext: 'Active design & dev sprints',
      icon: <Clock className="w-4 h-4 text-blue-600" />,
    },
    {
      label: 'Pipeline / Proposals',
      value: contractedOrProposal,
      subtext: 'Proposals & signed contracts',
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Total Contract Value',
      value: formatINR(totalValue),
      subtext: 'Aggregated in INR',
      icon: <IndianRupee className="w-4 h-4 text-slate-600" />,
    },
  ];

  // Filtering
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const client = getClientById(p.clientId);
      const service = getServiceById(p.serviceId);

      const matchesSearch =
        p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.clientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.clientName && p.clientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (client && client.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (service && service.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.projectManager && p.projectManager.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.paymentMode && p.paymentMode.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.proposalDocument?.name && p.proposalDocument.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.contractDocument?.name && p.contractDocument.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter, getClientById, getServiceById]);

  // Export CSV with all 19 fields + Docs & Phases
  const handleExportCsv = () => {
    exportToCsv(
      filteredProjects,
      [
        { key: 'id', header: 'Project ID' },
        { key: 'clientId', header: 'Client ID' },
        {
          key: 'clientName',
          header: 'Client Name',
          format: (r) => r.clientName || getClientById(r.clientId)?.name || r.clientId,
        },
        {
          key: 'serviceType',
          header: 'Service Type',
          format: (r) => getServiceById(r.serviceId)?.name || r.serviceId,
        },
        { key: 'proposalDate', header: 'Proposal Date' },
        { key: 'contractDate', header: 'Contract/Agreement Date' },
        { key: 'startDate', header: 'Project Start Date' },
        { key: 'committedDays', header: 'Committed Days' },
        { key: 'committedEndDate', header: 'Committed End Date' },
        { key: 'actualEndDate', header: 'Actual End Date', format: (r) => r.actualEndDate || 'N/A' },
        { key: 'status', header: 'Status' },
        { key: 'paymentMode', header: 'Payment Mode' },
        { key: 'currency', header: 'Currency' },
        { key: 'contract', header: 'Contract Amount' },
        { key: 'exchangeRate', header: 'Exchange Rate' },
        { key: 'contractValue', header: 'Contract Value (INR)' },
        { key: 'totalReceived', header: 'Total Received (INR)', format: (r) => r.totalReceived || 0 },
        {
          key: 'balance',
          header: 'Remaining Balance (INR)',
          format: (r) =>
            r.balance !== undefined
              ? r.balance
              : Math.max(0, (r.contractValue || 0) - (r.totalReceived || 0)),
        },
        {
          key: 'proposalDoc',
          header: 'Proposal Document',
          format: (r) => (r.proposalDocument ? r.proposalDocument.name : 'N/A'),
        },
        {
          key: 'contractDoc',
          header: 'Contract Document',
          format: (r) => (r.contractDocument ? r.contractDocument.name : 'N/A'),
        },
        {
          key: 'paymentPhasesSummary',
          header: 'Payment Phases Breakdown',
          format: (r) =>
            (r.paymentPhases || [])
              .map((ph) => `${ph.name}: ${ph.percentage}% (${formatINR(ph.amountINR)}) [${ph.status}]`)
              .join(' | ') || 'None',
        },
        {
          key: 'projectExpenses',
          header: 'Project Expenses (INR)',
          format: (r) => getProjectExpensesTotalINR(r.id),
        },
        {
          key: 'netProfit',
          header: 'Net Profit / Margin (INR)',
          format: (r) => (r.totalReceived || 0) - getProjectExpensesTotalINR(r.id),
        },
        { key: 'projectManager', header: 'Project Manager' },
        { key: 'notes', header: 'Notes', format: (r) => r.notes || '' },
      ],
      `${brandPrefix}_Projects_${new Date().toISOString().slice(0, 10)}`
    );
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Projects & Client Engagements"
        moduleSubtitle="Client contract setup, delivery milestones, proposal/contract documents, and team governance"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS}
        onAddNew={openAddProjectModal}
        addNewLabel="Add Project"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredProjects.length}
      />

      {/* Projects Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Project ID</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Service Type</th>
                <th className="py-3 px-4">Schedule & Timeline</th>
                <th className="py-3 px-4">Contract Value (INR)</th>
                <th className="py-3 px-4">Docs & Phases</th>
                <th className="py-3 px-4">Payment Mode</th>
                <th className="py-3 px-4">Project Manager</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No projects found matching criteria.</p>
                    <p className="text-xs mt-1">Click "Add Project" to set up a new client engagement.</p>
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => {
                  const client = getClientById(project.clientId);
                  const service = getServiceById(project.serviceId);
                  const isPastCommitted =
                    project.status !== 'Completed' &&
                    project.status !== 'Cancelled' &&
                    isPastDate(project.committedEndDate);

                  const phases = project.paymentPhases || [];
                  const receivedPhasesCount = phases.filter((p) => p.status === 'Received').length;

                  let statusBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (project.status === 'Completed') {
                    statusBadge =
                      'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60';
                  } else if (project.status === 'In Progress') {
                    statusBadge =
                      'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-900/60';
                  } else if (project.status === 'Contracted') {
                    statusBadge =
                      'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/60';
                  } else if (project.status === 'Proposal') {
                    statusBadge =
                      'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60';
                  } else if (project.status === 'On Hold') {
                    statusBadge =
                      'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/60';
                  } else if (project.status === 'Cancelled') {
                    statusBadge =
                      'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60';
                  }

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectForDetail(project);
                            setIsDetailDrawerOpen(true);
                          }}
                          className="hover:underline text-left"
                          title="Click to view Project Details & Payment Milestones"
                        >
                          {project.id}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {project.clientName || client?.name || `Client #${project.clientId}`}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          ID: {project.clientId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {service ? (
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {service.name}
                          </div>
                        ) : (
                          <span className="text-slate-400">Service #{project.serviceId}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="tabular-nums text-slate-800 dark:text-slate-200">
                          Start: {formatDate(project.startDate)}
                        </div>
                        <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>Committed: {formatDate(project.committedEndDate)}</span>
                          <span className="text-slate-400">({project.committedDays || 0}d)</span>
                          {isPastCommitted && (
                            <span className="text-[10px] text-rose-500 font-semibold">Overdue</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        <div className="font-bold">{formatINR(project.contractValue || 0)}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Rec: {formatINR(project.totalReceived || 0)}
                          </span>
                          <span>·</span>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Bal:{' '}
                            {formatINR(
                              project.balance !== undefined
                                ? project.balance
                                : Math.max(
                                    0,
                                    (project.contractValue || 0) - (project.totalReceived || 0)
                                  )
                            )}
                          </span>
                        </div>
                        {project.currency !== 'INR' && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {project.currency} {Number(project.contract || 0).toLocaleString()} @ {project.exchangeRate}
                          </div>
                        )}
                      </td>

                      {/* Docs & Phases Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          {/* Document Badges */}
                          <div className="flex items-center gap-1.5">
                            {project.proposalDocument ? (
                              project.proposalDocument.url ? (
                                <a
                                  href={project.proposalDocument.url}
                                  download={project.proposalDocument.name}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 transition-colors"
                                  title={`Download Proposal: ${project.proposalDocument.name}`}
                                >
                                  <FileText className="w-3 h-3 text-cyan-600" />
                                  <span>Proposal</span>
                                </a>
                              ) : project.proposalDocument.externalUrl ? (
                                <a
                                  href={project.proposalDocument.externalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 transition-colors"
                                  title="Open Proposal Link"
                                >
                                  <FileText className="w-3 h-3 text-cyan-600" />
                                  <span>Proposal</span>
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-cyan-50 text-cyan-700 border border-cyan-200">
                                  <FileText className="w-3 h-3 text-cyan-600" />
                                  <span>Proposal</span>
                                </span>
                              )
                            ) : null}

                            {project.contractDocument ? (
                              project.contractDocument.url ? (
                                <a
                                  href={project.contractDocument.url}
                                  download={project.contractDocument.name}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                                  title={`Download Signed Contract: ${project.contractDocument.name}`}
                                >
                                  <FileCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Contract</span>
                                </a>
                              ) : project.contractDocument.externalUrl ? (
                                <a
                                  href={project.contractDocument.externalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                                  title="Open Contract Link"
                                >
                                  <FileCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Contract</span>
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <FileCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Contract</span>
                                </span>
                              )
                            ) : null}

                            {!project.proposalDocument && !project.contractDocument && (
                              <button
                                type="button"
                                onClick={() => openEditProjectModal(project)}
                                className="text-[10px] text-slate-400 hover:text-cyan-600 italic"
                              >
                                + Attach Docs
                              </button>
                            )}
                          </div>

                          {/* Payment Phases Quick Badge */}
                          <div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectForDetail(project);
                                setIsDetailDrawerOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                              title="Click to view Payment Milestones Schedule"
                            >
                              <Layers className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              <span>
                                {phases.length > 0
                                  ? `Phases (${receivedPhasesCount}/${phases.length} Paid)`
                                  : 'Setup Phases'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {project.paymentMode}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        {project.projectManager}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${statusBadge}`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedProjectForDetail(project);
                              setIsDetailDrawerOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="View Project Details & Milestones Overview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditProjectModal(project)}
                            className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Project"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteProject(project.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Project (Protected if payments exist)"
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

      {/* Project Details Modal / Drawer */}
      <ProjectDetailDrawer
        project={selectedProjectForDetail}
        isOpen={isDetailDrawerOpen}
        onClose={() => {
          setIsDetailDrawerOpen(false);
          setSelectedProjectForDetail(null);
        }}
        onEdit={(proj) => {
          setIsDetailDrawerOpen(false);
          openEditProjectModal(proj);
        }}
      />
    </div>
  );
};
