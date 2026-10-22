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
  Lock,
} from 'lucide-react';

export const UsersModule: React.FC = () => {
  const {
    users,
    saveUser,
    deleteUser,
    updateCredentials,
    confirmDelete,
    authUser,
    hasPermission,
    databaseStatus,
    syncWithDatabase,
    clearDemoData,
    refreshDatabaseStatus,
    showToast,
    activeBrand,
    brandPrefix,
  } = useCrm();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [isUpdatingCreds, setIsUpdatingCreds] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearingDemo, setIsClearingDemo] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const [credsFormData, setCredsFormData] = useState({
    id: '',
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    role: 'Super Admin' as UserRole,
    brand: 'All' as BrandName | 'All',
  });

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
    const term = (searchTerm || '').toLowerCase().trim();
    const matchesSearch =
      !term ||
      (u.name || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.id || '').toLowerCase().includes(term);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
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
      password: '', // Blank by default so existing password hash is preserved in Azure SQL
      role: user.role,
      brand: user.brand || 'All',
      status: user.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      showToast('Name and email are required.', 'error');
      return;
    }

    const payload: AppUser = {
      id: formData.id || '',
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password && formData.password.trim() ? formData.password.trim() : undefined,
      role: formData.role,
      brand: formData.brand,
      status: formData.status,
      createdAt: editingUser?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await saveUser(payload);
    if (res.success) {
      setIsModalOpen(false);
    }
  };

  const handleOpenCredentialsModal = (targetUser?: AppUser | null) => {
    const userToEdit = targetUser || (authUser ? users.find((u) => u.email.toLowerCase() === authUser.email.toLowerCase()) : null) || users[0];
    if (userToEdit) {
      setCredsFormData({
        id: userToEdit.id || '',
        name: userToEdit.name || '',
        email: userToEdit.email || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        role: userToEdit.role || 'Super Admin',
        brand: userToEdit.brand || 'All',
      });
    } else {
      setCredsFormData({
        id: authUser?.id || 'USR-001',
        name: authUser?.name || 'Administrator',
        email: authUser?.email || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        role: 'Super Admin',
        brand: 'All',
      });
    }
    setIsCredsModalOpen(true);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credsFormData.email) {
      showToast('Email address is required.', 'error');
      return;
    }
    if (!credsFormData.currentPassword) {
      showToast('Current password is required to update credentials.', 'error');
      return;
    }
    if (credsFormData.newPassword && credsFormData.newPassword.length < 4) {
      showToast('New password must be at least 4 characters long.', 'error');
      return;
    }
    if (credsFormData.newPassword !== credsFormData.confirmPassword) {
      showToast('New password and confirmation password do not match.', 'error');
      return;
    }

    setIsUpdatingCreds(true);
    try {
      const res = await updateCredentials({
        id: credsFormData.id,
        email: credsFormData.email.trim().toLowerCase(),
        name: credsFormData.name.trim(),
        currentPassword: credsFormData.currentPassword,
        newPassword: credsFormData.newPassword ? credsFormData.newPassword.trim() : undefined,
        role: credsFormData.role,
        brand: credsFormData.brand,
      });

      if (res.success) {
        setIsCredsModalOpen(false);
      }
    } finally {
      setIsUpdatingCreds(false);
    }
  };

  const handleDelete = (userId: string, userName: string) => {
    if (userId === authUser?.id) {
      showToast('You cannot delete your own active session.', 'error');
      return;
    }
    confirmDelete({
      moduleName: 'User',
      recordTitle: `${userName} (${userId})`,
      recordId: userId,
      warningNote: `Deleting user account "${userName}" will revoke all role-based CRM access permissions and purge user credentials from Azure SQL app_users.`,
      onConfirm: async () => {
        await deleteUser(userId);
      },
    });
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncWithDatabase();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearDemo = () => {
    confirmDelete({
      moduleName: 'Demo Data',
      recordTitle: 'All Demo Clients, Projects, and Financial Records',
      warningNote: 'This will permanently purge demo records from Azure SQL Database and server cache. Primary admin accounts rathorehemant114@gmail.com and devicedoctorindia.in@gmail.com will remain strictly protected.',
      confirmLabel: 'Purge Demo Data',
      onConfirm: async () => {
        setIsClearingDemo(true);
        try {
          await clearDemoData();
        } finally {
          setIsClearingDemo(false);
        }
      },
    });
  };

  const getRoleBadgeColor = (role: UserRole | string) => {
    switch (role) {
      case 'Super Admin':
      case 'Super Administrator':
        return 'bg-slate-100 text-slate-800 dark:text-slate-200 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700';
      case 'Brand Admin':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700';
      case 'Project Manager':
        return 'bg-slate-100 text-slate-800 dark:text-slate-200 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700';
      case 'Accountant':
        return 'bg-slate-100 text-slate-800 dark:text-slate-200 dark:bg-slate-800 dark:text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Azure SQL Integration Status & Admin Overview */}
      <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-lg bg-slate-500/20 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              <Database className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin & User Management</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-500/20 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              live app_users
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Role-Based Access Control (RBAC) backed by Microsoft Azure SQL Database (
            <span className="font-mono text-slate-800 dark:text-slate-200">{databaseStatus.server} / {databaseStatus.database}</span>) using <span className="font-semibold text-slate-200">{databaseStatus.authType}</span> as <span className="font-mono text-slate-800 dark:text-slate-200">{databaseStatus.user}</span>.
            {databaseStatus.connected ? (
              <span className="ml-2 text-slate-800 dark:text-slate-200 font-semibold">● Connected</span>
            ) : (
              <span className="ml-2 text-slate-800 dark:text-slate-200 font-semibold" title={databaseStatus.error || undefined}>
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
            className="flex-1 md:flex-none px-3.5 py-2 rounded-lg bg-black hover:bg-neutral-800 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
            title="Purge all demo data from Azure SQL and server cache while preserving main admin accounts"
          >
            <Trash2 className={`w-3.5 h-3.5 text-slate-800 dark:text-slate-200 ${isClearingDemo ? 'animate-spin' : ''}`} />
            <span>{isClearingDemo ? 'Clearing...' : 'Remove Demo Data'}</span>
          </button>

          {isSuperAdmin && (
            <>
              <button
                onClick={() => handleOpenCredentialsModal(null)}
                className="px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                title="Update Admin ID, email, or security password live in Azure SQL"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                <span>Update Admin Password</span>
              </button>

              <button
                onClick={handleOpenAdd}
                className="px-3.5 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add App User</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Azure SQL Diagnostics / Firewall Banner */}
      {!databaseStatus.connected && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-500/10 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span>Azure SQL Direct Connection Pending</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 font-mono">
                  Strict Live SQL Mode
                </span>
              </div>
              <p className="text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mt-1 leading-relaxed max-w-3xl">
                {databaseStatus.error || 'Connection to Azure SQL Database could not be established.'}
              </p>
              <div className="mt-2 text-[11px] text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200/90 font-medium">
                💡 <span className="font-semibold">Quick Fix:</span> In the Azure Portal, open SQL server <span className="font-mono font-semibold">{databaseStatus.server.split('.')[0]}</span> &rarr; <span className="font-semibold">Networking</span> &rarr; Add Firewall rule for the server IP or check <span className="font-semibold">"Allow Azure services and resources to access this server"</span>.
              </div>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Test Connection</span>
          </button>
        </div>
      )}

      {/* Brand Workspace Isolation & Session Settings */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 shrink-0 mt-0.5">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Brand Workspace & Data Isolation
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 dark:border-slate-300 dark:border-slate-700 font-bold">
                Session Locked
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Current active workspace: <span className="font-semibold text-slate-900 dark:text-white">{activeBrand}</span> (<span className="font-mono text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 font-bold">{brandPrefix}</span>). Top header switcher has been permanently removed to eliminate accidental cross-brand data contamination.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 select-none">
          <Lock className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />
          <span>Session Locked · Log out to change workspace</span>
        </div>
      </div>

      {/* Role Privileges Reference Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>Super Admin</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Unrestricted access across all 3 brands, user CRUD, financial audit, and system configs.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Brand Admin</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Full management scoped to their designated workspace (DDI, Codestro, or FX Launch Pad).
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mb-1">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Project Manager</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Project delivery, client communications, service milestones, and task assignments.
          </p>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 mb-1">
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
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center text-xs">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 font-medium">
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
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-800 dark:text-slate-200 dark:text-slate-800 dark:text-slate-200 font-medium">
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
                              onClick={() => handleOpenCredentialsModal(user)}
                              className="p-1 rounded text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Update password and security credentials"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="p-1 rounded text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Edit user details and role"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.name)}
                              disabled={isCurrent}
                              className="p-1 rounded text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
                <KeyRound className="w-4 h-4 text-slate-800 dark:text-slate-200" />
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
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-[11px]"
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
                  placeholder={editingUser ? "Leave blank to preserve current password, or enter new password" : "Enter account password (or leave blank for Admin@2026)"}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-[11px]"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {editingUser ? "Leave blank to keep existing password intact. Entered passwords are automatically hashed with bcrypt before saving to Azure SQL." : "New accounts are hashed with bcrypt before persisting to Azure SQL app_users."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    RBAC Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                      className="text-slate-800 dark:text-slate-200 focus:ring-slate-900"
                    />
                    <span>Active</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="status"
                      checked={formData.status === 'Inactive'}
                      onChange={() => setFormData({ ...formData, status: 'Inactive' })}
                      className="text-slate-800 dark:text-slate-200 focus:ring-slate-900"
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
                  className="px-4 py-2 rounded-lg bg-black hover:bg-neutral-800 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Update Admin Security Credentials & Password */}
      {isCredsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl max-w-md w-full p-6 shadow-xl animate-modal-scale-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Update Security Credentials
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Direct live commit to Azure SQL <span className="font-mono font-semibold">app_users</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCredsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    User / Admin ID
                  </label>
                  <input
                    type="text"
                    required
                    value={credsFormData.id}
                    onChange={(e) => setCredsFormData({ ...credsFormData, id: e.target.value })}
                    placeholder="e.g. USR-001"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={credsFormData.name}
                    onChange={(e) => setCredsFormData({ ...credsFormData, name: e.target.value })}
                    placeholder="e.g. Administrator"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Work Email Address
                </label>
                <input
                  type="email"
                  required
                  value={credsFormData.email}
                  onChange={(e) => setCredsFormData({ ...credsFormData, email: e.target.value })}
                  placeholder="admin@devicedoctor.in"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={credsFormData.currentPassword}
                  onChange={(e) => setCredsFormData({ ...credsFormData, currentPassword: e.target.value })}
                  placeholder="Enter current security password"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    New Security Password
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">bcrypt (rounds=10)</span>
                </div>
                <input
                  type="password"
                  value={credsFormData.newPassword}
                  onChange={(e) => setCredsFormData({ ...credsFormData, newPassword: e.target.value })}
                  placeholder="Leave blank to keep existing password, or enter new"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                />
              </div>

              {credsFormData.newPassword && (
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={credsFormData.confirmPassword}
                    onChange={(e) => setCredsFormData({ ...credsFormData, confirmPassword: e.target.value })}
                    placeholder="Repeat new security password"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono text-[11px]"
                  />
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-900 dark:text-white">Note:</span> Submitting updates executes a parameterized <span className="font-mono">UPDATE app_users</span> in Azure SQL. A fresh session token will be issued and synchronized with request headers.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCredsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingCreds}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{isUpdatingCreds ? 'Committing to Azure SQL...' : 'Save & Commit Credentials'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
