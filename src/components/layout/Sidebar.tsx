import React from 'react';
import { useCrm } from '../../context/CrmContext';
import { ActiveModule } from '../../types/crm';
import {
  LayoutDashboard,
  Users,
  Layers,
  Cpu,
  Briefcase,
  CreditCard,
  ShieldCheck,
  UserCheck,
  ClipboardCheck,
  Wallet,
  Tags,
  Receipt,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Wrench,
  X,
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
    clients,
    categories,
    services,
    projects,
    payments,
    roles,
    employees,
    assignments,
    employeePayments,
    expenseCategories,
    expenses,
    authUser,
    logout,
  } = useCrm();

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
  ];

  const handleNavClick = (id: ActiveModule) => {
    setActiveModule(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 border-r border-slate-800">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shrink-0">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-white truncate">
                Device Doctor India
              </div>
              <div className="text-[11px] text-cyan-400 font-medium truncate">
                Enterprise CRM Portal
              </div>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden text-slate-400 hover:text-white p-1 rounded-md"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-sm'
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
                          ? 'bg-cyan-700/80 text-cyan-100'
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
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            title="Sign Out"
            className="w-full flex justify-center p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
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
