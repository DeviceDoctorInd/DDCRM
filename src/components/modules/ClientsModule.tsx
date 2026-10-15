import React, { useState, useMemo } from 'react';
import { useCrm } from '../../context/CrmContext';
import { Client, CurrencyCode, ClientStatus } from '../../types/crm';
import { CommonModuleToolbar, KpiCardItem } from '../common/CommonModuleToolbar';
import { exportToCsv } from '../../utils/csvExport';
import { formatDate } from '../../utils/formatters';
import {
  Users,
  CheckCircle,
  Clock,
  Ban,
  Edit2,
  Trash2,
  X,
  FileSpreadsheet,
} from 'lucide-react';

const CURRENCIES: CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'USDT', 'BTC'];
const STATUS_OPTIONS: ClientStatus[] = ['Active', 'Prospect', 'Inactive', 'Blocked'];

export const ClientsModule: React.FC = () => {
  const { clients, saveClient, deleteClient, getClientProjectsCount } = useCrm();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // KPIs
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === 'Active').length;
  const prospects = clients.filter((c) => c.status === 'Prospect').length;
  const inactiveOrBlocked = clients.filter((c) => c.status === 'Inactive' || c.status === 'Blocked').length;

  const kpis: KpiCardItem[] = [
    {
      label: 'Total Accounts',
      value: totalClients,
      subtext: 'Registered client entities',
      icon: <Users className="w-4 h-4 text-cyan-600" />,
    },
    {
      label: 'Active Contracts',
      value: activeClients,
      subtext: 'Operational hardware SLAs',
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    },
    {
      label: 'Prospects',
      value: prospects,
      subtext: 'Under SLA pilot / proposal',
      icon: <Clock className="w-4 h-4 text-blue-600" />,
    },
    {
      label: 'Inactive / Blocked',
      value: inactiveOrBlocked,
      subtext: 'Archived or restricted',
      icon: <Ban className="w-4 h-4 text-rose-500" />,
    },
  ];

  // Filtered rows
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.gstNumber && c.gstNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        c.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [clients, searchTerm, statusFilter]);

  // Export CSV
  const handleExportCsv = () => {
    exportToCsv(
      filteredClients,
      [
        { key: 'id', header: 'Client ID' },
        { key: 'name', header: 'Client Name' },
        { key: 'contactPerson', header: 'Contact Person' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'city', header: 'City' },
        { key: 'country', header: 'Country' },
        { key: 'gstNumber', header: 'GST Number', format: (r) => r.gstNumber || 'N/A' },
        { key: 'preferredCurrency', header: 'Currency' },
        { key: 'clientSince', header: 'Client Since' },
        { key: 'status', header: 'Status' },
        {
          key: 'linkedProjects',
          header: 'Linked Projects',
          format: (r) => getClientProjectsCount(r.id),
        },
      ],
      'DeviceDoctorIndia_Clients'
    );
  };

  const handleOpenAdd = () => {
    setFormError(null);
    setEditingClient({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      city: 'Mumbai',
      country: 'India',
      gstNumber: '',
      preferredCurrency: 'INR',
      clientSince: new Date().toISOString().slice(0, 10),
      status: 'Active',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setFormError(null);
    setEditingClient({ ...client });
    setIsModalOpen(true);
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    if (!editingClient.name?.trim()) {
      setFormError('Client Name is required.');
      return;
    }

    // GST Validation: If provided, must be strictly 15 alphanumeric characters
    if (editingClient.gstNumber && editingClient.gstNumber.trim().length > 0) {
      const cleanGST = editingClient.gstNumber.trim().toUpperCase();
      if (!/^[0-9A-Z]{15}$/.test(cleanGST)) {
        setFormError('GST Number must be strictly 15 alphanumeric characters (e.g., 27AABCZ8493K1Z2).');
        return;
      }
    }

    const res = saveClient(editingClient as Client);
    if (res.success) {
      setIsModalOpen(false);
      setEditingClient(null);
      setFormError(null);
    } else {
      setFormError(res.error || 'Failed to save client');
    }
  };

  return (
    <div className="space-y-6">
      <CommonModuleToolbar
        moduleTitle="Clients & Corporate Accounts"
        moduleSubtitle="Client onboarding, GST compliance data, and enterprise account management"
        kpis={kpis}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={[
          { label: 'All Statuses', value: 'ALL' },
          { label: 'Active', value: 'Active' },
          { label: 'Prospect', value: 'Prospect' },
          { label: 'Inactive', value: 'Inactive' },
          { label: 'Blocked', value: 'Blocked' },
        ]}
        onAddNew={handleOpenAdd}
        addNewLabel="Onboard New Client"
        onExportCsv={handleExportCsv}
        totalFilteredCount={filteredClients.length}
      />

      {/* Clients Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Client ID</th>
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Contact Person</th>
                <th className="py-3 px-4">GST Number</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Currency</th>
                <th className="py-3 px-4">Client Since</th>
                <th className="py-3 px-4">Projects</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium">No clients matching your search criteria.</p>
                    <p className="text-xs mt-1">Try adjusting the search query or status filter.</p>
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const projectCount = getClientProjectsCount(client.id);

                  let statusBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  if (client.status === 'Active') {
                    statusBadge = 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60';
                  } else if (client.status === 'Prospect') {
                    statusBadge = 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/60';
                  } else if (client.status === 'Blocked') {
                    statusBadge = 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60';
                  }

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                        {client.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {client.name}
                        </div>
                        {client.notes && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                            {client.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {client.contactPerson}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {client.email} · {client.phone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums">
                        {client.gstNumber ? (
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {client.gstNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Provided</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {client.city}, {client.country}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {client.preferredCurrency}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatDate(client.clientSince)}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            projectCount > 0
                              ? 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300'
                              : 'text-slate-400'
                          }`}
                        >
                          {projectCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${statusBadge}`}>
                          {client.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(client)}
                            className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Client"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteClient(client.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Delete Client (Protected if projects exist)"
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

      {/* Add / Edit Client Modal */}
      {isModalOpen && editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingClient.id ? `Edit Client: ${editingClient.name}` : 'Onboard New Corporate Client'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Client ID: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">{editingClient.id || 'Auto-generated (e.g. CL-007)'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 text-xs rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Name */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Client / Enterprise Company Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingClient.name || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                    placeholder="e.g. Infosys Infrastructure Support Services"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={editingClient.contactPerson || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, contactPerson: e.target.value })}
                    placeholder="e.g. Rajesh Nair"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={editingClient.phone || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                    placeholder="+91 98201 44521"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Billing / Communication Email
                  </label>
                  <input
                    type="email"
                    value={editingClient.email || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                    placeholder="billing@company.in"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* GST Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    GST Number (Strict 15 Chars, Unique)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={editingClient.gstNumber || ''}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        gstNumber: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''),
                      })
                    }
                    placeholder="e.g. 27AABCZ8493K1Z2"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Must be 15 alphanumeric characters if provided.
                  </span>
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={editingClient.city || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, city: e.target.value })}
                    placeholder="Mumbai / Bengaluru"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Country */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={editingClient.country || 'India'}
                    onChange={(e) => setEditingClient({ ...editingClient, country: e.target.value })}
                    placeholder="India"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Preferred Currency */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Preferred Currency
                  </label>
                  <select
                    value={editingClient.preferredCurrency || 'INR'}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        preferredCurrency: e.target.value as CurrencyCode,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {CURRENCIES.map((curr) => (
                      <option key={curr} value={curr}>
                        {curr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Client Since Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Client Since (Agreement Date)
                  </label>
                  <input
                    type="date"
                    value={editingClient.clientSince || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, clientSince: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Status
                  </label>
                  <select
                    value={editingClient.status || 'Active'}
                    onChange={(e) =>
                      setEditingClient({
                        ...editingClient,
                        status: e.target.value as ClientStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account SLA Details / Notes
                  </label>
                  <textarea
                    rows={2}
                    value={editingClient.notes || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })}
                    placeholder="Enter warranty notes, dispatch instructions, or account specifications..."
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-sm transition-colors"
                >
                  Save Client Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
