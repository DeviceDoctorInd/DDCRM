import React, { useState, useEffect } from 'react';
import { useCrm } from '../../context/CrmContext';
import { BrandName, BRAND_CONFIG } from '../../types/crm';
import {
  Wrench,
  Shield,
  Lock,
  Mail,
  ArrowRight,
  Sun,
  Moon,
  Database,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Briefcase,
  Calculator,
  Eye,
  Code2,
  TrendingUp,
  Building2,
  Check,
  LogOut,
  Layers,
  Sparkles,
  Globe,
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const {
    login,
    logout,
    selectBrandWorkspace,
    authUser,
    hasConfirmedWorkspace,
    theme,
    toggleTheme,
    databaseStatus,
  } = useCrm();

  const [email, setEmail] = useState('rathorehemant114@gmail.com');
  const [password, setPassword] = useState('Admin@2026');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Default brand selection in Step 2
  const [selectedBrand, setSelectedBrand] = useState<BrandName>('Device Doctor India');

  // When authUser updates, default selected brand to user's assigned brand if set
  useEffect(() => {
    if (authUser?.brand && (authUser.brand === 'Device Doctor India' || authUser.brand === 'Codestro' || authUser.brand === 'FX Launch Pad' || authUser.brand === 'DUNS')) {
      setSelectedBrand(authUser.brand as BrandName);
    }
  }, [authUser]);

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const success = await login(email, password);
      if (!success) {
        setErrorMessage('Authentication failed. Please verify your credentials or Azure SQL whitelist.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to connect to Azure SQL app_users.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRole = async (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await login(userEmail, userPass);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmWorkspace = () => {
    selectBrandWorkspace(selectedBrand, false, true);
  };

  const brands: {
    name: BrandName;
    prefix: string;
    icon: React.ReactNode;
    tagline: string;
    capabilities: string[];
    colorScheme: {
      activeBorder: string;
      activeBg: string;
      badge: string;
      avatarBg: string;
    };
  }[] = [
    {
      name: 'Device Doctor India',
      prefix: 'DDI',
      icon: <Wrench className="w-5 h-5" />,
      tagline: 'Custom Software, Mobile Apps & Enterprise Systems',
      capabilities: ['Enterprise ERP & Web Portals', 'Mobile Apps (iOS & Android)', 'Annual Maintenance & IT Operations'],
      colorScheme: {
        activeBorder: 'border-cyan-500 ring-2 ring-cyan-500/20',
        activeBg: 'bg-cyan-50/70 dark:bg-cyan-950/30',
        badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
        avatarBg: 'from-cyan-600 to-blue-600',
      },
    },
    {
      name: 'Codestro',
      prefix: 'CDS',
      icon: <Code2 className="w-5 h-5" />,
      tagline: 'Web Applications, Cloud Architecture & DevOps',
      capabilities: ['SaaS Product Development', 'Cloud Microservices & APIs', 'DevOps & Scalable Cloud Deployments'],
      colorScheme: {
        activeBorder: 'border-violet-500 ring-2 ring-violet-500/20',
        activeBg: 'bg-violet-50/70 dark:bg-violet-950/30',
        badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-violet-300 dark:border-violet-800',
        avatarBg: 'from-violet-600 to-indigo-600',
      },
    },
    {
      name: 'FX Launch Pad',
      prefix: 'FXL',
      icon: <TrendingUp className="w-5 h-5" />,
      tagline: 'FinTech, Trading Systems & High-Frequency Algorithms',
      capabilities: ['Algorithmic Trading Engines', 'Crypto & Forex Broker Platforms', 'Risk Management & Analytics'],
      colorScheme: {
        activeBorder: 'border-amber-500 ring-2 ring-emerald-500/20',
        activeBg: 'bg-amber-50/70 dark:bg-amber-950/30',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        avatarBg: 'from-amber-600 to-emerald-600',
      },
    },
    {
      name: 'DUNS',
      prefix: 'DNS',
      icon: <Globe className="w-5 h-5" />,
      tagline: 'Global Business Verification, Corporate Intelligence & Regulatory Compliance',
      capabilities: ['Entity Verification & D&B Ratings', 'KYC & Cross-Border Compliance', 'Corporate Credit Intelligence & Risk'],
      colorScheme: {
        activeBorder: 'border-indigo-500 ring-2 ring-indigo-500/20',
        activeBg: 'bg-indigo-50/70 dark:bg-indigo-950/30',
        badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
        avatarBg: 'from-indigo-600 to-sky-600',
      },
    },
  ];

  // Determine current step:
  // Step 1: User is not authenticated (!authUser)
  // Step 2: User is authenticated, but workspace not yet locked/confirmed (!hasConfirmedWorkspace)
  const isStep2 = Boolean(authUser && !hasConfirmedWorkspace);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 relative py-12">
      {/* Top right theme switch */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>
      </div>

      <div className={`w-full transition-all duration-300 ${isStep2 ? 'max-w-2xl' : 'max-w-lg'}`}>
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg mb-3">
            {isStep2 ? <Layers className="w-7 h-7" /> : <Wrench className="w-7 h-7" />}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Device Doctor India CRM
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Multi-Brand Enterprise IT & Software Agency CRM · Device Doctor · Codestro · FX Launch Pad · DUNS
          </p>
        </div>

        {/* Live Azure SQL Connection Badge (Always visible for auditability) */}
        <div className="mb-4 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                <span>Azure SQL:</span>
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                  {databaseStatus.server} [{databaseStatus.database}]
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Auth: {databaseStatus.authType} · User: {databaseStatus.user}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-[11px] font-medium">
            {databaseStatus.connected ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold" title={databaseStatus.error || undefined}>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Pending Whitelist</span>
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 2: MANDATORY BRAND SELECTION SCREEN (Post-Authentication)             */}
        {/* ========================================================================= */}
        {isStep2 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Step Indicator & Title */}
            <div className="pb-4 mb-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-50 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/80 mb-1.5">
                  <Shield className="w-3 h-3" />
                  <span>Step 2 of 2 · Mandatory Workspace Selection</span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Select Active Brand Workspace
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose the workspace to operate in. All records and operations will be strictly locked to this brand.
                </p>
              </div>

              {/* Operator info pill */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 self-start sm:self-auto shrink-0">
                <div className="w-7 h-7 rounded-lg bg-cyan-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {authUser?.name?.[0] || 'U'}
                </div>
                <div className="text-left pr-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                    {authUser?.name}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {authUser?.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Sign in with a different account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 3 Brand Selection Cards */}
            <div className="space-y-3 mb-6">
              {brands.map((b) => {
                const isSelected = selectedBrand === b.name;
                const isAssigned = authUser?.brand === b.name;

                return (
                  <div
                    key={b.name}
                    onClick={() => setSelectedBrand(b.name)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start sm:items-center justify-between gap-4 ${
                      isSelected
                        ? `${b.colorScheme.activeBorder} ${b.colorScheme.activeBg} shadow-md`
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${b.colorScheme.avatarBg} text-white flex items-center justify-center shadow-md shrink-0`}
                      >
                        {b.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {b.name}
                          </span>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {b.prefix}
                          </span>
                          {isAssigned && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              Your Assigned Brand
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                          {b.tagline}
                        </p>

                        <div className="hidden sm:flex items-center gap-2 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                          {b.capabilities.map((cap, idx) => (
                            <span key={idx} className="flex items-center gap-1">
                              {idx > 0 && <span className="text-slate-300 dark:text-slate-700">·</span>}
                              <span>{cap}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 pt-1 sm:pt-0">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
                          isSelected
                            ? 'bg-cyan-600 border-cyan-600 text-white'
                            : 'border-slate-300 dark:border-slate-600 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Session Lock Security Notice */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 mb-6 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  Strict Session Lock & Data Partitioning:
                </span>{' '}
                Once confirmed, the entire CRM is strictly locked to{' '}
                <span className="font-bold text-cyan-600 dark:text-cyan-400">{selectedBrand}</span>.
                All client on-boardings, project IDs, contracts, and GST invoices will be tagged with this brand context. Dynamic switching inside the CRM has been permanently removed to protect data integrity.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={logout}
                className="w-full sm:w-auto px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Sign Out / Switch Account
              </button>

              <button
                type="button"
                onClick={handleConfirmWorkspace}
                className="w-full sm:flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:from-cyan-700 active:to-blue-700 text-white text-xs font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Confirm & Enter {selectedBrand} Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* STEP 1: OPERATOR SIGN IN SCREEN                                            */
          /* ========================================================================= */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-7">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 mb-1">
                  <span>Step 1 of 2</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Operator Sign In
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Authenticates against live <span className="font-mono text-[11px]">app_users</span> in Azure SQL
                </p>
              </div>
              <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAuth} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Work Email Address / Entra ID
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rathorehemant114@gmail.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Security Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span>{isLoading ? 'Verifying Azure SQL Entra Session...' : 'Authenticate & Continue to Workspace Selection'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick RBAC Role Access Grid */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center justify-between">
                <span>Quick Sign-In by RBAC Role:</span>
                <span className="text-[10px] text-slate-400">1-Click Live Test</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectRole('rathorehemant114@gmail.com', 'Admin@2026')}
                  className="p-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-cyan-600">
                    <Shield className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Entra Super Admin</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    rathorehemant114@gmail.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('admin@codestro.com', 'Codestro@2026')}
                  className="p-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-violet-600">
                    <UserCheck className="w-3.5 h-3.5 text-violet-500" />
                    <span>Brand Admin (Codestro)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    admin@codestro.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('admin@duns.com', 'Duns@2026')}
                  className="p-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-indigo-600">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Brand Admin (DUNS)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    admin@duns.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('karthik.pm@devicedoctor.in', 'Project@2026')}
                  className="p-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-blue-600">
                    <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                    <span>Project Manager</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    karthik.pm@devicedoctor.in
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('finance@devicedoctor.in', 'Finance@2026')}
                  className="p-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-600">
                    <Calculator className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Accountant</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    finance@devicedoctor.in
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('viewer@devicedoctor.in', 'Viewer@2026')}
                  className="col-span-2 p-2 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-slate-600">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>Read-Only Viewer Role</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    viewer@devicedoctor.in (Audits & Client Review)
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Device Doctor India CRM · Microsoft Azure SQL Database · Active Directory Password Authentication
        </div>
      </div>
    </div>
  );
};
