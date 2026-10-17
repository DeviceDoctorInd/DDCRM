import React, { useState } from 'react';
import { useCrm } from '../../context/CrmContext';
import { AppUser, UserRole, BrandName } from '../../types/crm';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Database,
  RefreshCw,
  KeyRound,
  Shield,
  Layers,
  Info,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';

export const UsersModule: React.FC = () => {
  const {
    users,
    saveUser,
    deleteUser,
    authUser,
    hasPermission,
    databaseStatus,
    syncWithDatabase,
    clearDemoData,
    refreshDatabaseStatus,
    showToast,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearingDemo, setIsClearingDemo] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const [formData, setFormData] = useState<{
    id?: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    brand: BrandName | 'All';
    status: 'Active' | 'Inactive';
  }>({
    name: '',
    email: '',
    password: '',
    role: 'Project Manager',
    brand: 'All',
    status: 'Active',
  });

  const isSuperAdmin = authUser?.role === 'Super Admin' || authUser?.role === 'Super Administrator';

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: 'Admin@2026',
      role: 'Project Manager',
      brand: 'All',
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password || 'Admin@2026',
      role: user.role,
      brand: user.brand || 'All',
      status: user.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      showToast('Name and email are required.', 'error');
      return;
    }

    const payload: AppUser = {
      id: formData.id || '',
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password || 'Admin@2026',
      role: formData.role,
      brand: formData.brand,
      status: formData.status,
      createdAt: editingUser?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveUser(payload);
    setIsModalOpen(false);
  };

  const handleDelete = (userId: string, userName: string) => {
    if (userId === authUser?.id || formData.email === authUser?.email) {
      showToast('You cannot delete your own active session.', 'error');
      return;
    }
    if (window.confirm(`Are you sure you want to delete user "${userName}" from Azure SQL app_users?`)) {
      deleteUser(userId);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncWithDatabase();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearDemo = async () => {
    const confirmed = window.confirm(
      '⚠️ WARNING: Are you sure you want to remove all demo data?\n\n' +
      '• This will permanently delete demo clients, projects, invoices, expenses, services, and staff records from Azure SQL Database and server cache.\n' +
      '• Main admin accounts ("rathorehemant114@gmail.com" & "devicedoctorindia.in@gmail.com") will be strictly protected.\n\n' +
      'Click OK to proceed with demo data cleanup.'
    );
    if (!confirmed) return;

    setIsClearingDemo(true);
    try {
      await clearDemoData();
    } finally {
      setIsClearingDemo(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole | string) => {
    switch (role) {
      case 'Super Admin':
      case 'Super Administrator':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'Brand Admin':
        return 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300 border-violet-300 dark:border-violet-800';
      case 'Project Manager':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Accountant':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Azure SQL Integration Status & Admin Overview */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Database className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin & User Management</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
              live app_users
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Role-Based Access Control (RBAC) backed by Microsoft Azure SQL Database (
            <span className="font-mono text-cyan-300">{databaseStatus.server} / {databaseStatus.database}</span>) using <span className="font-semibold text-slate-200">{databaseStatus.authType}</span> as <span className="font-mono text-cyan-300">{databaseStatus.user}</span>.
            {databaseStatus.connected ? (
              <span className="ml-2 text-emerald-400 font-semibold">● Connected</span>
            ) : (
              <span className="ml-2 text-amber-400 font-semibold" title={databaseStatus.error || undefined}>
                ○ Disconnected (Live Azure SQL Required)
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex-1 md:flex-none px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            title="Synchronize live state with Azure SQL Database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync with Azure SQL'}</span>
          </button>

          <button
            onClick={handleClearDemo}
            disabled={isClearingDemo}
            className="flex-1 md:flex-none px-3.5 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-xs font-semibold text-rose-200 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
            title="Purge all demo data from Azure SQL and server cache while preserving main admin accounts"
          >
            <Trash2 className={`w-3.5 h-3.5 text-rose-400 ${isClearingDemo ? 'animate-spin' : ''}`} />
            <span>{isClearingDemo ? 'Clearing...' : 'Remove Demo Data'}</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add App User</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Azure SQL Diagnostics / Firewall Banner */}
      {!databaseStatus.connected && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <span>Azure SQL Direct Connection Pending</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-mono">
                  Strict Live SQL Mode
                </span>
              </div>
              <p className="text-amber-700 dark:text-amber-300 mt-1 leading-relaxed max-w-3xl">
                {databaseStatus.error || 'Connection to Azure SQL Database could not be established.'}
              </p>
              <div className="mt-2 text-[11px] text-amber-800 dark:text-amber-300/90 font-medium">
                💡 <span className="font-semibold">Quick Fix:</span> In the Azure Portal, open SQL server <span className="font-mono font-semibold">{databaseStatus.server.split('.')[0]}</span> &rarr; <span className="font-semibold">Networking</span> &rarr; Add Firewall rule for the server IP or check <span className="font-semibold">"Allow Azure services and resources to access this server"</span>.
              </div>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>
        </div>
      )}

      {/* Role Privileges Reference Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-400 mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>Super Admin</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Unrestricted access across all 3 brands, user CRUD, financial audit, and system configs.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-violet-700 dark:text-violet-400 mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Brand Admin</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Full management scoped to their designated workspace (DDI, Codestro, or FX Launch Pad).
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-blue-700 dark:text-blue-400 mb-1">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Project Manager</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Project delivery, client communications, service milestones, and task assignments.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-700 dark:text-emerald-400 mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Accountant</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Client payments, GST invoices, expenses, contractor payouts, and tax tracking.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 dark:text-slate-300 mb-1">
            <Info className="w-3.5 h-3.5" />
            <span>Viewer</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Read-only visibility for executive auditors, client reviewers, and stakeholders.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search operator name or email address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Roles ({users.length})</option>
            <option value="Super Admin">Super Admin</option>
            <option value="Brand Admin">Brand Admin</option>
            <option value="Project Manager">Project Manager</option>
            <option value="Accountant">Accountant</option>
            <option value="Viewer">Viewer</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Operator Name & ID</th>
                <th className="py-3 px-4">Entra / Work Email</th>
                <th className="py-3 px-4">RBAC Role</th>
                <th className="py-3 px-4">Brand Scope</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No operator accounts matching the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isCurrent = user.id === authUser?.id || user.email === authUser?.email;
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 font-bold flex items-center justify-center text-xs">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400">{user.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {user.email}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${getRoleBadgeColor(
                            user.role
                          )}`}
                        >
                          {user.role}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {user.brand || 'All Brands'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {user.status === 'Active' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isSuperAdmin && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="p-1 rounded text-slate-400 hover:text-cyan-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Edit user details and role"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.name)}
                              disabled={isCurrent}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isCurrent ? 'Cannot delete current session' : 'Delete user'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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

      {/* Modal: Add / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-600" />
                <span>{editingUser ? 'Edit App User & Role' : 'Create Azure SQL App User'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Hemant Rathore"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Entra / Work Email Address
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="rathorehemant114@gmail.com"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Security Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Leave as Admin@2026 or set custom"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-[11px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    RBAC Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Brand Admin">Brand Admin</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Brand Scope
                  </label>
                  <select
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value as BrandName | 'All' })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="All">All Brands</option>
                    <option value="Device Doctor India">Device Doctor India</option>
                    <option value="Codestro">Codestro</option>
                    <option value="FX Launch Pad">FX Launch Pad</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Account Status
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="status"
                      checked={formData.status === 'Active'}
                      onChange={() => setFormData({ ...formData, status: 'Active' })}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>Active</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="status"
                      checked={formData.status === 'Inactive'}
                      onChange={() => setFormData({ ...formData, status: 'Inactive' })}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <span>Inactive</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
