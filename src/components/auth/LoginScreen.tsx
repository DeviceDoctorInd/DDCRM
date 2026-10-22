import React, { useState, useEffect } from 'react';
import { useCrm } from '../../context/CrmContext';
import { BrandName, BRAND_CONFIG } from '../../types/crm';
import {
  Wrench,
  Shield,
  Lock,
  User,
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
  KeyRound,
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const res = await login(email, password);
      if (!res.success) {
        setErrorMessage(res.error || 'Authentication failed. Please verify your credentials or Azure SQL whitelist.');
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
      const res = await login(userEmail, userPass);
      if (!res.success) {
        setErrorMessage(res.error || 'Authentication failed for the selected role.');
      }
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
        activeBorder: 'border-slate-900 ring-2 ring-slate-900/20 dark:border-white dark:ring-white/20',
        activeBg: 'bg-slate-100/90 dark:bg-slate-800/80',
        badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700',
        avatarBg: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
      },
    },
    {
      name: 'Codestro',
      prefix: 'CDS',
      icon: <Code2 className="w-5 h-5" />,
      tagline: 'Web Applications, Cloud Architecture & DevOps',
      capabilities: ['SaaS Product Development', 'Cloud Microservices & APIs', 'DevOps & Scalable Cloud Deployments'],
      colorScheme: {
        activeBorder: 'border-slate-900 ring-2 ring-slate-900/20 dark:border-white dark:ring-white/20',
        activeBg: 'bg-slate-100/90 dark:bg-slate-800/80',
        badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700',
        avatarBg: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
      },
    },
    {
      name: 'FX Launch Pad',
      prefix: 'FXL',
      icon: <TrendingUp className="w-5 h-5" />,
      tagline: 'FinTech, Trading Systems & High-Frequency Algorithms',
      capabilities: ['Algorithmic Trading Engines', 'Crypto & Forex Broker Platforms', 'Risk Management & Analytics'],
      colorScheme: {
        activeBorder: 'border-slate-900 ring-2 ring-slate-900/20 dark:border-white dark:ring-white/20',
        activeBg: 'bg-slate-100/90 dark:bg-slate-800/80',
        badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700',
        avatarBg: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
      },
    },
    {
      name: 'DUNS',
      prefix: 'DUNS',
      icon: <Globe className="w-5 h-5" />,
      tagline: 'Global Business Intelligence & Corporate Risk Audits',
      capabilities: ['Global Entity Verification', 'D-U-N-S® Compliance Data', 'Cross-Border Risk Assessment'],
      colorScheme: {
        activeBorder: 'border-slate-900 ring-2 ring-slate-900/20 dark:border-white dark:ring-white/20',
        activeBg: 'bg-slate-100/90 dark:bg-slate-800/80',
        badge: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700',
        avatarBg: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
      },
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-slate-900 selection:text-white">
      {/* Top Bar with Brand Badge & Controls */}
      <div className="w-full max-w-xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center font-bold text-sm shadow-xs">
            DD
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
              Device Doctor India
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Enterprise Multi-Brand CRM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Azure SQL Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
              databaseStatus.connected
                ? 'bg-slate-50 text-slate-900 border-slate-300 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700'
                : 'bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
            }`}
            title={`Azure SQL Database: ${databaseStatus.database} on ${databaseStatus.server} (${databaseStatus.authType})`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{databaseStatus.connected ? 'Azure SQL Live' : 'Azure SQL Pending'}</span>
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white dark:bg-slate-900 transition-colors cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="w-full max-w-xl">
        {authUser ? (
          /* ========================================================================= */
          /* STEP 2: WORKSPACE PARTITION SELECTION (SESSION LOCK)                      */
          /* ========================================================================= */
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 sm:p-7">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-slate-900 dark:text-white" />
                  <span>Authenticated · Step 2 of 2</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Select Brand Workspace
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Confirm workspace partition for this session
                </p>
              </div>

              {/* Operator info pill */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start sm:self-auto shrink-0">
                <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-xs font-bold shrink-0">
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
                  className="p-1 rounded-md text-slate-400 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Sign in with a different account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Brand Selection Cards */}
            <div className="space-y-3 mb-6">
              {brands.map((b) => {
                const isSelected = selectedBrand === b.name;
                const isAssigned = authUser?.brand === b.name;

                return (
                  <div
                    key={b.name}
                    onClick={() => setSelectedBrand(b.name)}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer flex items-start sm:items-center justify-between gap-4 ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800/80 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shrink-0">
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
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white">
                              Your Assigned Brand
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                          {b.tagline}
                        </p>

                        <div className="hidden sm:flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
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
                        className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900'
                            : 'border-slate-300 dark:border-slate-600 bg-transparent'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Session Lock Security Notice */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-6 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-3">
              <Lock className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  Strict Session Partitioning:
                </span>{' '}
                The CRM session will be scoped to{' '}
                <span className="font-bold text-slate-900 dark:text-white underline decoration-slate-400">{selectedBrand}</span>.
                All client on-boardings, project codes, contracts, and GST invoices will be recorded under this brand partition.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={logout}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Sign Out / Switch User
              </button>

              <button
                type="button"
                onClick={handleConfirmWorkspace}
                className="w-full sm:flex-1 py-2.5 px-6 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 sm:p-7">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 mb-1">
                  <span>Step 1 of 2</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Operator Sign In
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Validates credentials live against <span className="font-mono text-[11px] font-semibold">app_users</span> in Azure SQL
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            {/* Diagnostic Monochrome Alert Banner */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-lg bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-white text-xs text-slate-900 dark:text-slate-100 flex items-start gap-2.5 shadow-xs">
                <AlertCircle className="w-4 h-4 text-slate-900 dark:text-slate-100 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[11px] uppercase tracking-wider mb-0.5 text-slate-900 dark:text-white">
                    Authentication Failure
                  </div>
                  <div className="leading-relaxed text-slate-700 dark:text-slate-300">
                    {errorMessage}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Work Email Address / Admin ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter Work Email or Admin ID (e.g. USR-001)"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Security Password
                  </label>
                  <span className="text-[10px] text-slate-400">bcrypt verified</span>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security password"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 dark:focus:ring-white dark:focus:border-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <span>{isLoading ? 'Verifying Azure SQL app_users...' : 'Authenticate & Continue to Workspace Selection'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Reference Accounts Grid */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="mb-2.5">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Standard Initial Accounts:</span>
                  <span className="text-[10px] text-slate-400">1-Click Live Test</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  If you updated your Admin ID or password in User Settings, type your updated credentials above.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectRole('rathorehemant114@gmail.com', 'Admin@2026')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Shield className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>Super Admin</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    rathorehemant114@gmail.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('devicedoctorindia.in@gmail.com', 'Admin@2026')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Building2 className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>DDI Primary Admin</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    devicedoctorindia.in@gmail.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('admin@codestro.com', 'Codestro@2026')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <UserCheck className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>Brand Admin (Codestro)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    admin@codestro.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('admin@duns.com', 'Duns@2026')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Globe className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>Brand Admin (DUNS)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    admin@duns.com
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('karthik.pm@devicedoctor.in', 'Project@2026')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Briefcase className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>Project Manager</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    karthik.pm@devicedoctor.in
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('finance@devicedoctor.in', 'Finance@2026')}
                  className="p-2.5 text-left rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                    <Calculator className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
                    <span>Accountant</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    finance@devicedoctor.in
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
