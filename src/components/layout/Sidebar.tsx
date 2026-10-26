import React, { useState } from 'react';
import { useCrm } from '../../context/CrmContext';
import { ActiveModule, ReportsSubTab } from '../../types/crm';
import {
  LayoutDashboard,
  Users,
  Layers,
  Cpu,
  Briefcase,
  CreditCard,
  FileCheck,
  ShieldCheck,
  UserCheck,
  ClipboardCheck,
  Wallet,
  Tags,
  Receipt,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Wrench,
  X,
  BarChart3,
  TrendingUp,
  PieChart,
  UserCog,
  Lock,
  Code2,
  Building2,
  Globe,
  Database,
  Landmark,
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const {
    activeModule,
    setActiveModule,
    activeReportsTab,
    setActiveReportsTab,
    clients,
    categories,
    services,
    projects,
    payments,
    bankAccounts,
    gstInvoices,
    roles,
    employees,
    assignments,
    employeePayments,
    expenseCategories,
    expenses,
    users,
    authUser,
    logout,
    activeBrand,
    brandPrefix,
    brandMeta,
    databaseStatus,
  } = useCrm();

  const getBrandIcon = (name: string, className: string = 'w-4 h-4') => {
    switch (name) {
      case 'Device Doctor India':
        return <Wrench className={className} />;
      case 'Codestro':
        return <Code2 className={className} />;
      case 'FX Launch Pad':
        return <TrendingUp className={className} />;
      case 'DUNS':
        return <Globe className={className} />;
      default:
        return <Building2 className={className} />;
    }
  };

  const [isReportsExpanded, setIsReportsExpanded] = useState(true);

  const reportsSubItems: {
    id: ReportsSubTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'business',
      label: '1. Business Report',
      icon: <TrendingUp className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'client',
      label: '2. Client Report',
      icon: <Users className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'employee',
      label: '3. Employee Report',
      icon: <UserCheck className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'overview',
      label: '4. Business Overview',
      icon: <PieChart className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'bank-accounts',
      label: '5. Bank Account Report',
      icon: <Landmark className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'payment-modes',
      label: '6. Payment Mode Report',
      icon: <CreditCard className="w-3.5 h-3.5 shrink-0" />,
    },
  ];

  const navItems: {
    id: ActiveModule;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      count: 6,
    },
    {
      id: 'clients',
      label: 'Clients',
      icon: <Users className="w-4 h-4 shrink-0" />,
      count: clients.length,
    },
    {
      id: 'categories',
      label: 'Service Categories',
      icon: <Layers className="w-4 h-4 shrink-0" />,
      count: categories.length,
    },
    {
      id: 'services',
      label: 'Services',
      icon: <Cpu className="w-4 h-4 shrink-0" />,
      count: services.length,
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: <Briefcase className="w-4 h-4 shrink-0" />,
      count: projects.length,
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCard className="w-4 h-4 shrink-0" />,
      count: payments.length,
    },
    {
      id: 'bank-accounts',
      label: 'Bank Accounts',
      icon: <Landmark className="w-4 h-4 shrink-0" />,
      count: bankAccounts.length,
    },
    {
      id: 'gst-invoices',
      label: 'GST Invoice',
      icon: <FileCheck className="w-4 h-4 shrink-0" />,
      count: gstInvoices.length,
    },
    {
      id: 'roles',
      label: 'Employee Roles',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
      count: roles.length,
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: <UserCheck className="w-4 h-4 shrink-0" />,
      count: employees.length,
    },
    {
      id: 'assignments',
      label: 'Assignments',
      icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
      count: assignments.length,
    },
    {
      id: 'employee-payments',
      label: 'Employee Payments',
      icon: <Wallet className="w-4 h-4 shrink-0" />,
      count: employeePayments.length,
    },
    {
      id: 'expense-categories',
      label: 'Expense Categories',
      icon: <Tags className="w-4 h-4 shrink-0" />,
      count: expenseCategories.length,
    },
    {
      id: 'expenses',
      label: 'Other Expenses',
      icon: <Receipt className="w-4 h-4 shrink-0" />,
      count: expenses.length,
    },
    {
      id: 'users',
      label: 'Admin & Users',
      icon: <UserCog className="w-4 h-4 shrink-0" />,
      count: users.length,
    },
  ];

  const handleNavClick = (id: ActiveModule) => {
    setActiveModule(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 border-r border-slate-800">
      {/* Session-Locked Brand Workspace Header (Non-clickable, no switcher) */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${brandMeta.avatarBg} flex items-center justify-center text-white shadow-sm shrink-0`}
            title={`Session strictly locked to ${activeBrand}`}
          >
            {getBrandIcon(activeBrand, 'w-4 h-4')}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white tracking-tight truncate">
                  {activeBrand}
                </span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-200 border border-slate-700 shrink-0">
                  {brandPrefix}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate mt-0.5">
                <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                <span>Locked Workspace</span>
              </div>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden text-slate-400 hover:text-white p-1 rounded-md shrink-0"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          const isReports = item.id === 'reports';

          if (isReports) {
            return (
              <div key="reports-group" className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (activeModule !== 'reports') {
                      setActiveModule('reports');
                    }
                    setIsReportsExpanded(!isReportsExpanded);
                    if (isCollapsed) {
                      onCloseMobile();
                    }
                  }}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                    isActive
                      ? 'bg-white/10 text-white font-semibold shadow-xs border border-white/10'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <span
                    className={`${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    {item.icon}
                  </span>

                  {!isCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left font-semibold">{item.label}</span>
                      <span
                        className={`font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded ${
                          isActive
                            ? 'bg-white/20 text-white font-semibold'
                            : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'
                        }`}
                      >
                        5
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isReportsExpanded ? 'rotate-180 text-slate-200' : 'text-slate-500'
                        }`}
                      />
                    </>
                  )}
                </button>

                {!isCollapsed && isReportsExpanded && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-slate-800 ml-4 my-0.5">
                    {reportsSubItems.map((sub) => {
                      const isSubActive = activeModule === 'reports' && activeReportsTab === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setActiveModule('reports');
                            setActiveReportsTab(sub.id);
                            onCloseMobile();
                          }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                            isSubActive
                              ? 'bg-white/10 text-white font-semibold border-l-2 border-white pl-2'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                          }`}
                        >
                          <span className={isSubActive ? 'text-white' : 'text-slate-500'}>
                            {sub.icon}
                          </span>
                          <span className="truncate flex-1 text-left">{sub.label}</span>
                          {isSubActive && <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                isActive
                  ? 'bg-white/10 text-white font-semibold shadow-xs border border-white/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <span
                className={`${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {item.icon}
              </span>

              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={`font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded ${
                        isActive
                          ? 'bg-white/20 text-white font-semibold'
                          : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / User Details */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        {!isCollapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-200 truncate">
                {authUser?.name || 'Admin'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {authUser?.email || 'admin@devicedoctor.in'}
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            title="Sign Out"
            className="w-full flex justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {/* Azure SQL Live Database Status Widget */}
        {!isCollapsed ? (
          <div className="mt-2 p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px]">
            <div className="flex items-center justify-between text-slate-300 font-semibold mb-0.5">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Database className="w-3 h-3 text-slate-400" />
                <span>Azure SQL Cloud DB</span>
              </div>
              <span className="flex h-1.5 w-1.5 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${databaseStatus.connected ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${databaseStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
            </div>
            <div className="text-[9px] text-slate-400 font-mono truncate">
              {databaseStatus.server || (databaseStatus.connected ? 'Live Connection' : 'Protected Cloud DB')}
            </div>
            {databaseStatus.user && (
              <div className="text-[9px] text-slate-300 font-mono truncate">
                {databaseStatus.user}
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center my-1.5" title={`Azure SQL Cloud DB (${databaseStatus.connected ? 'Connected' : 'Offline'})`}>
            <Database className="w-3.5 h-3.5 text-slate-400 hover:text-white transition-colors" />
          </div>
        )}

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:block mt-2 pt-2 border-t border-slate-800/80">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center gap-2 py-1.5 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800/50 transition-colors"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 ease-in-out ${
          isCollapsed ? 'w-18' : 'w-64'
        }`}
      >
        <div className={`fixed top-0 bottom-0 left-0 z-30 transition-all duration-200 ${
          isCollapsed ? 'w-18' : 'w-64'
        }`}>
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
