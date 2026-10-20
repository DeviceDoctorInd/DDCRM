/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CrmProvider, useCrm } from './context/CrmContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginScreen } from './components/auth/LoginScreen';
import { ToastContainer } from './components/common/ToastContainer';
import { ReferentialIntegrityModal } from './components/common/ReferentialIntegrityModal';
import { ProjectModal } from './components/modules/ProjectModal';

// Module Components
import { DashboardModule } from './components/modules/DashboardModule';
import { ClientsModule } from './components/modules/ClientsModule';
import { ServiceCategoriesModule } from './components/modules/ServiceCategoriesModule';
import { ServicesModule } from './components/modules/ServicesModule';
import { ProjectsModule } from './components/modules/ProjectsModule';
import { PaymentsModule } from './components/modules/PaymentsModule';
import { EmployeeRolesModule } from './components/modules/EmployeeRolesModule';
import { EmployeesModule } from './components/modules/EmployeesModule';
import { AssignmentsModule } from './components/modules/AssignmentsModule';
import { EmployeePaymentsModule } from './components/modules/EmployeePaymentsModule';
import { ExpenseCategoriesModule } from './components/modules/ExpenseCategoriesModule';
import { ExpensesModule } from './components/modules/ExpensesModule';
import { GstInvoicesModule } from './components/modules/GstInvoicesModule';
import { ReportsModule } from './components/modules/ReportsModule';
import { UsersModule } from './components/modules/UsersModule';
import { BankAccountsModule } from './components/modules/BankAccountsModule';

const MainLayout: React.FC = () => {
  const { authUser, activeModule, hasConfirmedWorkspace } = useCrm();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // If user is not logged in or has not selected brand workspace for this session, render LoginScreen
  if (!authUser || !hasConfirmedWorkspace) {
    return <LoginScreen />;
  }

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardModule />;
      case 'clients':
        return <ClientsModule />;
      case 'categories':
        return <ServiceCategoriesModule />;
      case 'services':
        return <ServicesModule />;
      case 'projects':
        return <ProjectsModule />;
      case 'payments':
        return <PaymentsModule />;
      case 'bank-accounts':
        return <BankAccountsModule />;
      case 'gst-invoices':
        return <GstInvoicesModule />;
      case 'roles':
        return <EmployeeRolesModule />;
      case 'employees':
        return <EmployeesModule />;
      case 'assignments':
        return <AssignmentsModule />;
      case 'employee-payments':
        return <EmployeePaymentsModule />;
      case 'expense-categories':
        return <ExpenseCategoriesModule />;
      case 'expenses':
        return <ExpensesModule />;
      case 'reports':
        return <ReportsModule />;
      case 'users':
        return <UsersModule />;
      default:
        return <DashboardModule />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      <div className="flex flex-1 min-h-screen">
        {/* Collapsible Sidebar */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {renderActiveModule()}
          </main>

          <footer className="py-4 px-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 dark:text-slate-500">
            Device Doctor India CRM · Enterprise Hardware & IT Asset Operations · All modules active
          </footer>
        </div>
      </div>

      {/* Global Modals & Notifications */}
      <ProjectModal />
      <ReferentialIntegrityModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <CrmProvider>
      <MainLayout />
    </CrmProvider>
  );
}
