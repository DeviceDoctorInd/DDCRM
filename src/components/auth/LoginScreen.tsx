import React, { useState } from 'react';
import { useCrm } from '../../context/CrmContext';
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
} from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { login, theme, toggleTheme, databaseStatus } = useCrm();
  const [email, setEmail] = useState('rathorehemant114@gmail.com');
  const [password, setPassword] = useState('Admin@2026');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      login(email, password);
      setIsLoading(false);
    }, 300);
  };

  const handleSelectRole = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    login(userEmail, userPass);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 relative">
      {/* Top right theme switch */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-lg">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg mb-3">
            <Wrench className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Device Doctor India CRM
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Multi-Brand Enterprise IT & Software Agency CRM · Device Doctor · Codestro · FX Launch Pad
          </p>
        </div>

        {/* Live Azure SQL Connection Badge */}
        <div className="mb-4 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                <span>Azure SQL:</span>
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">ddcrm.database.windows.net [DDCRM]</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Auth: Microsoft Entra Password · User: rathorehemant114@gmail.com
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Configured</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-7">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
            <div>
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

          <form onSubmit={handleSubmit} className="space-y-3.5">
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
              <span>{isLoading ? 'Verifying Azure SQL Entra Session...' : 'Sign In to Workspace'}</span>
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

        {/* Footer info */}
        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Device Doctor India CRM · Microsoft Azure SQL Database · Active Directory Password Authentication
        </div>
      </div>
    </div>
  );
};
