import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import {
  Client,
  ServiceCategory,
  Service,
  Project,
  Payment,
  EmployeeRole,
  Employee,
  Assignment,
  EmployeePayment,
  ExpenseCategory,
  ExpenseCategoryStatus,
  Expense,
  AuthUser,
  ActiveModule,
} from '../types/crm';
import { storageService } from '../services/storageService';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface ReferentialBlockState {
  isOpen: boolean;
  title: string;
  message: string;
  entityName: string;
  entityType: 'Client' | 'Category' | 'Service' | 'Role' | 'Project' | 'Employee' | 'Assignment' | 'Expense Category' | 'Expense' | string;
  entityId: string;
  linkedCount: number;
  onSetInactive?: () => void;
}

interface CrmContextType {
  // Navigation & Theme
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Auth
  authUser: AuthUser | null;
  login: (email: string, pass: string) => boolean;
  logout: () => void;

  // Relational Entities
  clients: Client[];
  categories: ServiceCategory[];
  services: Service[];
  projects: Project[];
  payments: Payment[];
  roles: EmployeeRole[];
  employees: Employee[];
  assignments: Assignment[];
  employeePayments: EmployeePayment[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];

  // Entity Finders (Relational ID Linking)
  getClientById: (id: string) => Client | undefined;
  getCategoryById: (id: string) => ServiceCategory | undefined;
  getServiceById: (id: string) => Service | undefined;
  getRoleById: (id: string) => EmployeeRole | undefined;
  getProjectById: (id: string) => Project | undefined;
  getEmployeeById: (id: string) => Employee | undefined;
  getAssignmentById: (id: string) => Assignment | undefined;
  getEmployeePaymentById: (id: string) => EmployeePayment | undefined;
  getExpenseCategoryById: (id: string) => ExpenseCategory | undefined;
  getExpenseById: (id: string) => Expense | undefined;
  getProjectExpenses: (projectId: string) => Expense[];
  getProjectExpensesTotalINR: (projectId: string) => number;

  // Auto-calculated relational counts
  getCategoryServicesCount: (categoryId: string) => number;
  getClientProjectsCount: (clientId: string) => number;
  getServiceProjectsCount: (serviceId: string) => number;
  getRoleEmployeesCount: (roleId: string) => number;

  // Actions
  saveClient: (client: Client) => { success: boolean; error?: string };
  deleteClient: (clientId: string) => { success: boolean; error?: string };
  setClientStatus: (clientId: string, status: Client['status']) => void;

  saveCategory: (category: ServiceCategory) => { success: boolean; error?: string };
  deleteCategory: (categoryId: string) => { success: boolean; error?: string };
  setCategoryStatus: (categoryId: string, status: ServiceCategory['status']) => void;

  saveService: (service: Service) => { success: boolean; error?: string };
  deleteService: (serviceId: string) => { success: boolean; error?: string };
  setServiceStatus: (serviceId: string, status: Service['status']) => void;

  saveProject: (project: Project) => { success: boolean; error?: string };
  deleteProject: (projectId: string) => { success: boolean; error?: string };
  setProjectStatus: (projectId: string, status: Project['status']) => void;

  savePayment: (payment: Payment) => { success: boolean; error?: string };
  deletePayment: (paymentId: string) => { success: boolean; error?: string };

  saveRole: (role: EmployeeRole) => { success: boolean; error?: string };
  deleteRole: (roleId: string) => { success: boolean; error?: string };

  saveEmployee: (employee: Employee) => { success: boolean; error?: string };
  deleteEmployee: (employeeId: string) => { success: boolean; error?: string };

  saveAssignment: (assignment: Assignment) => { success: boolean; error?: string };
  deleteAssignment: (assignmentId: string) => { success: boolean; error?: string };

  saveEmployeePayment: (payment: EmployeePayment) => { success: boolean; error?: string };
  deleteEmployeePayment: (paymentId: string) => { success: boolean; error?: string };

  saveExpenseCategory: (category: ExpenseCategory) => { success: boolean; error?: string };
  deleteExpenseCategory: (categoryId: string) => { success: boolean; error?: string };
  setExpenseCategoryStatus: (categoryId: string, status: ExpenseCategoryStatus) => void;

  saveExpense: (expense: Expense) => { success: boolean; error?: string };
  deleteExpense: (expenseId: string) => { success: boolean; error?: string };

  // Referential Deletion Protection Modal
  referentialModal: ReferentialBlockState;
  closeReferentialModal: () => void;
  openReferentialBlock: (options: Omit<ReferentialBlockState, 'isOpen'>) => void;

  // Global Project Modal
  isProjectModalOpen: boolean;
  isProjectModalEditing: boolean;
  projectModalData: Partial<Project> | null;
  openAddProjectModal: () => void;
  openEditProjectModal: (project: Project) => void;
  closeProjectModal: () => void;

  // Toasts
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;

  // Reset to default sample dataset
  resetData: () => void;
}

const CrmContext = createContext<CrmContextType | undefined>(undefined);

export const CrmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard');
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [authUser, setAuthUserState] = useState<AuthUser | null>(null);

  // Entities state
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Modals & Feedback
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [referentialModal, setReferentialModal] = useState<ReferentialBlockState>({
    isOpen: false,
    title: '',
    message: '',
    entityName: '',
    entityType: 'Client',
    entityId: '',
    linkedCount: 0,
  });

  // Project Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isProjectModalEditing, setIsProjectModalEditing] = useState(false);
  const [projectModalData, setProjectModalData] = useState<Partial<Project> | null>(null);

  const openAddProjectModal = () => {
    setIsProjectModalEditing(false);
    const freshClients = storageService.getClients();
    const freshServices = storageService.getServices();
    const defaultClient = freshClients.length > 0 ? freshClients[0] : undefined;
    const defaultService = freshServices.length > 0 ? freshServices[0] : undefined;
    const autoId = storageService.generateSmartProjectId(
      defaultClient?.name || 'CLIENT',
      defaultService?.name || 'SERVICE',
      defaultClient?.id,
      defaultService?.id
    );
    const today = new Date().toISOString().slice(0, 10);
    const committedDays = 30;
    const endD = new Date();
    endD.setDate(endD.getDate() + committedDays);
    const endDate = endD.toISOString().slice(0, 10);
    const currency = defaultClient?.preferredCurrency || 'INR';
    const rate = currency === 'INR' ? 1 : 84.5;
    const contract = 150000;

    setProjectModalData({
      id: autoId,
      clientId: defaultClient?.id || '',
      clientName: defaultClient?.name || '',
      serviceId: defaultService?.id || '',
      proposalDate: today,
      contractDate: today,
      startDate: today,
      committedDays,
      committedEndDate: endDate,
      actualEndDate: '',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency,
      contract,
      exchangeRate: rate,
      contractValue: Math.round(contract * rate),
      projectManager: 'Karthik Ramanathan',
      notes: '',
    });
    setIsProjectModalOpen(true);
  };

  const openEditProjectModal = (proj: Project) => {
    setIsProjectModalEditing(true);
    setProjectModalData({ ...proj });
    setIsProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    setIsProjectModalOpen(false);
    setIsProjectModalEditing(false);
    setProjectModalData(null);
  };

  const loadAll = () => {
    storageService.init();
    setClients(storageService.getClients());
    setCategories(storageService.getCategories());
    setServices(storageService.getServices());
    setProjects(storageService.getProjects());
    setPayments(storageService.getPayments());
    setRoles(storageService.getRoles());
    setEmployees(storageService.getEmployees());
    setAssignments(storageService.getAssignments());
    setEmployeePayments(storageService.getEmployeePayments());
    setExpenseCategories(storageService.getExpenseCategories());
    setExpenses(storageService.getExpenses());
    setAuthUserState(storageService.getAuthUser());
    const currentTheme = storageService.getTheme();
    setThemeState(currentTheme);
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    loadAll();

    const handleUpdate = () => {
      loadAll();
    };

    window.addEventListener('ddi_crm_store_updated', handleUpdate);
    return () => {
      window.removeEventListener('ddi_crm_store_updated', handleUpdate);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(nextTheme);
    storageService.setTheme(nextTheme);
  };

  const showToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const closeReferentialModal = () => {
    setReferentialModal((prev) => ({ ...prev, isOpen: false }));
  };

  const openReferentialBlock = (options: Omit<ReferentialBlockState, 'isOpen'>) => {
    setReferentialModal({
      ...options,
      isOpen: true,
    });
  };

  const login = (email: string, pass: string): boolean => {
    // Local mock auth check: accepts default admin or any valid email
    if (email && pass.length >= 4) {
      const user: AuthUser = {
        id: 'USR-001',
        name: 'Device Doctor Admin',
        email: email.trim().toLowerCase(),
        role: 'Super Administrator',
      };
      storageService.setAuthUser(user);
      setAuthUserState(user);
      showToast('Logged in successfully. Welcome back!', 'success');
      return true;
    }
    showToast('Invalid credentials. Password must be at least 4 characters.', 'error');
    return false;
  };

  const logout = () => {
    storageService.setAuthUser(null);
    setAuthUserState(null);
    showToast('Logged out securely.', 'info');
  };

  // Relational entity lookup maps
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const assignmentMap = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);
  const employeePaymentMap = useMemo(() => new Map(employeePayments.map((p) => [p.id, p])), [employeePayments]);
  const expenseCategoryMap = useMemo(() => new Map(expenseCategories.map((c) => [c.id, c])), [expenseCategories]);
  const expenseMap = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses]);

  const getClientById = (id: string) => clientMap.get(id);
  const getCategoryById = (id: string) => categoryMap.get(id);
  const getServiceById = (id: string) => serviceMap.get(id);
  const getRoleById = (id: string) => roleMap.get(id);
  const getProjectById = (id: string) => projectMap.get(id);
  const getEmployeeById = (id: string) => employeeMap.get(id);
  const getAssignmentById = (id: string) => assignmentMap.get(id);
  const getEmployeePaymentById = (id: string) => employeePaymentMap.get(id);
  const getExpenseCategoryById = (id: string) => expenseCategoryMap.get(id);
  const getExpenseById = (id: string) => expenseMap.get(id);
  const getProjectExpenses = (projectId: string) => {
    if (!projectId || projectId === 'NA') return [];
    return expenses.filter((e) => e.projectId === projectId);
  };
  const getProjectExpensesTotalINR = (projectId: string) => {
    return getProjectExpenses(projectId).reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  };

  // Auto-calculated counts
  const getCategoryServicesCount = (catId: string) => {
    return services.filter((s) => s.categoryId === catId).length;
  };

  const getClientProjectsCount = (clientId: string) => {
    return projects.filter((p) => p.clientId === clientId).length;
  };

  const getServiceProjectsCount = (serviceId: string) => {
    return projects.filter((p) => p.serviceId === serviceId).length;
  };

  const getRoleEmployeesCount = (roleId: string) => {
    return employees.filter((e) => e.roleId === roleId).length;
  };

  // --- Strict Enforcement Actions ---
  const saveClientAction = (client: Client) => {
    const res = storageService.saveClient(client);
    if (res.success) {
      showToast(`Client "${client.name}" saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save client.', 'error');
    }
    return res;
  };

  const deleteClientAction = (clientId: string) => {
    const client = getClientById(clientId);
    const clientName = client?.name || clientId;
    const check = storageService.canDeleteClient(clientId);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Client Has Active Projects',
        message: `Client "${clientName}" is currently linked to ${check.linkedCount} Project record(s). In order to maintain relational integrity, deleting this client is prohibited.`,
        entityName: clientName,
        entityType: 'Client',
        entityId: clientId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          storageService.setClientStatus(clientId, 'Inactive');
          showToast(`Client "${clientName}" marked as Inactive.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteClient(clientId);
    if (res.success) {
      showToast(`Client "${clientName}" deleted successfully.`, 'success');
    }
    return res;
  };

  const saveCategoryAction = (category: ServiceCategory) => {
    const res = storageService.saveCategory(category);
    if (res.success) {
      showToast(`Category "${category.name}" saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save category.', 'error');
    }
    return res;
  };

  const deleteCategoryAction = (categoryId: string) => {
    const cat = getCategoryById(categoryId);
    const catName = cat?.name || categoryId;
    const check = storageService.canDeleteCategory(categoryId);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Category Has Linked Services',
        message: `Category "${catName}" is assigned to ${check.linkedCount} active Service(s). To maintain relational data integrity, deleting this category is blocked.`,
        entityName: catName,
        entityType: 'Category',
        entityId: categoryId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          storageService.setCategoryStatus(categoryId, 'Inactive');
          showToast(`Category "${catName}" marked as Inactive.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteCategory(categoryId);
    if (res.success) {
      showToast(`Category "${catName}" deleted.`, 'success');
    }
    return res;
  };

  const saveServiceAction = (service: Service) => {
    const res = storageService.saveService(service);
    if (res.success) {
      showToast(`Service "${service.name}" saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save service.', 'error');
    }
    return res;
  };

  const deleteServiceAction = (serviceId: string) => {
    const srv = getServiceById(serviceId);
    const srvName = srv?.name || serviceId;
    const check = storageService.canDeleteService(serviceId);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Service Has Linked Projects',
        message: `Service "${srvName}" is actively used by ${check.linkedCount} Project(s). Deletion is prohibited to preserve project audit trails.`,
        entityName: srvName,
        entityType: 'Service',
        entityId: serviceId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          storageService.setServiceStatus(serviceId, 'Inactive');
          showToast(`Service "${srvName}" marked as Inactive.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteService(serviceId);
    if (res.success) {
      showToast(`Service "${srvName}" deleted.`, 'success');
    }
    return res;
  };

  const saveProjectAction = (project: Project) => {
    const res = storageService.saveProject(project);
    if (res.success) {
      showToast(`Project ${project.id} for "${project.clientName}" saved successfully.`, 'success');
    }
    return res;
  };

  const deleteProjectAction = (projectId: string) => {
    const prj = getProjectById(projectId);
    const prjName = prj ? `${prj.clientName} (${prj.id})` : projectId;
    const check = storageService.canDeleteProject(projectId);

    if (!check.allowed) {
      const isAssignment = check.blockType === 'assignments';
      openReferentialBlock({
        title: isAssignment
          ? 'Referential Integrity Block: Project Has Active Assignments'
          : 'Referential Integrity Block: Project Has Payments',
        message:
          check.reason ||
          (isAssignment
            ? `Project "${prjName}" is linked to ${check.linkedCount} Employee Assignment record(s). Deletion is blocked to preserve project assignment history.`
            : `Project "${prjName}" is linked to ${check.linkedCount} financial Payment record(s). Deletion is blocked to preserve accounting integrity.`),
        entityName: prjName,
        entityType: 'Project',
        entityId: projectId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          storageService.setProjectStatus(projectId, 'Cancelled');
          showToast(`Project "${prjName}" marked as Cancelled.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteProject(projectId);
    if (res.success) {
      showToast(`Project "${prjName}" deleted.`, 'success');
    }
    return res;
  };

  const savePaymentAction = (payment: Payment) => {
    const res = storageService.savePayment(payment);
    if (res.success) {
      showToast(`Payment ${payment.id} saved.`, 'success');
    }
    return res;
  };

  const deletePaymentAction = (paymentId: string) => {
    const res = storageService.deletePayment(paymentId);
    if (res.success) {
      showToast(`Payment ${paymentId} deleted.`, 'success');
    }
    return res;
  };

  const saveRoleAction = (role: EmployeeRole) => {
    const res = storageService.saveRole(role);
    if (res.success) {
      showToast(`Role "${role.roleName}" saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save role.', 'error');
    }
    return res;
  };

  const deleteRoleAction = (roleId: string) => {
    const role = getRoleById(roleId);
    const roleName = role?.roleName || roleId;
    const check = storageService.canDeleteRole(roleId);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Role Assigned to Employees',
        message: `Role "${roleName}" is assigned to ${check.linkedCount} Employee(s). You cannot delete a role with active employees assigned.`,
        entityName: roleName,
        entityType: 'Role',
        entityId: roleId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          if (role) {
            storageService.saveRole({ ...role, status: 'Inactive' });
            showToast(`Role "${roleName}" has been marked as Inactive.`, 'info');
          }
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteRole(roleId);
    if (res.success) {
      showToast(`Role "${roleName}" deleted.`, 'success');
    }
    return res;
  };

  const saveEmployeeAction = (employee: Employee) => {
    const res = storageService.saveEmployee(employee);
    if (res.success) {
      showToast(`Employee "${employee.name}" saved.`, 'success');
    } else {
      showToast(res.error || 'Failed to save employee.', 'error');
    }
    return res;
  };

  const deleteEmployeeAction = (empId: string) => {
    const emp = getEmployeeById(empId);
    const empName = emp?.name || empId;
    const check = storageService.canDeleteEmployee(empId);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Employee Has Assignments',
        message: `Employee "${empName}" is allocated to ${check.linkedCount} Project Assignment(s). Deletion is blocked to preserve assignment history. You can mark this employee as Inactive instead.`,
        entityName: empName,
        entityType: 'Employee',
        entityId: empId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          if (emp) {
            storageService.saveEmployee({ ...emp, status: 'Inactive' });
            showToast(`Employee "${empName}" marked as Inactive.`, 'info');
          }
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteEmployee(empId);
    if (res.success) {
      showToast(`Employee "${empName}" removed.`, 'success');
    }
    return res;
  };

  const saveAssignmentAction = (assignment: Assignment) => {
    const res = storageService.saveAssignment(assignment);
    if (res.success) {
      showToast(`Assignment ${assignment.id} saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save assignment.', 'error');
    }
    return res;
  };

  const deleteAssignmentAction = (assignmentId: string) => {
    const check = storageService.canDeleteAssignment(assignmentId);
    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Assignment Linked to Employee Payments',
        message: `Assignment "${assignmentId}" has ${check.linkedCount} linked Employee Payment record(s). Deletion is prohibited to preserve financial transaction logs. You can mark this assignment as Cancelled or On Hold instead.`,
        entityName: assignmentId,
        entityType: 'Assignment',
        entityId: assignmentId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          const asn = getAssignmentById(assignmentId);
          if (asn) {
            storageService.saveAssignment({ ...asn, paymentStatus: 'Cancelled' });
            showToast(`Assignment "${assignmentId}" marked as Cancelled.`, 'info');
          }
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteAssignment(assignmentId);
    if (res.success) {
      showToast(`Assignment ${assignmentId} deleted.`, 'success');
    }
    return res;
  };

  const saveEmployeePaymentAction = (payment: EmployeePayment) => {
    const res = storageService.saveEmployeePayment(payment);
    if (res.success) {
      showToast(`Employee Payment ${payment.id} saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save employee payment.', 'error');
    }
    return res;
  };

  const deleteEmployeePaymentAction = (paymentId: string) => {
    const res = storageService.deleteEmployeePayment(paymentId);
    if (res.success) {
      showToast(`Employee Payment ${paymentId} removed.`, 'success');
    } else {
      showToast(res.error || 'Failed to delete employee payment.', 'error');
    }
    return res;
  };

  const saveExpenseCategoryAction = (category: ExpenseCategory) => {
    const res = storageService.saveExpenseCategory(category);
    if (res.success) {
      showToast(`Expense Category "${category.name}" saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save expense category.', 'error');
    }
    return res;
  };

  const deleteExpenseCategoryAction = (categoryId: string) => {
    const cat = getExpenseCategoryById(categoryId);
    const catName = cat?.name || categoryId;
    const check = storageService.canDeleteExpenseCategory(categoryId);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Expense Category in Use',
        message: `Expense Category "${catName}" is assigned to ${check.linkedCount} expense record(s). Deletion is prohibited to preserve financial expense logs. You can mark this category as Inactive instead.`,
        entityName: catName,
        entityType: 'Expense Category',
        entityId: categoryId,
        linkedCount: check.linkedCount,
        onSetInactive: () => {
          if (cat) {
            storageService.setExpenseCategoryStatus(categoryId, 'Inactive');
            showToast(`Expense Category "${catName}" marked as Inactive.`, 'info');
          }
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = storageService.deleteExpenseCategory(categoryId);
    if (res.success) {
      showToast(`Expense Category "${catName}" deleted.`, 'success');
    }
    return res;
  };

  const saveExpenseAction = (expense: Expense) => {
    const res = storageService.saveExpense(expense);
    if (res.success) {
      showToast(`Expense record "${expense.id}" saved successfully.`, 'success');
    } else {
      showToast(res.error || 'Failed to save expense record.', 'error');
    }
    return res;
  };

  const deleteExpenseAction = (expenseId: string) => {
    const res = storageService.deleteExpense(expenseId);
    if (res.success) {
      showToast(`Expense record "${expenseId}" deleted.`, 'success');
    } else {
      showToast(res.error || 'Failed to delete expense record.', 'error');
    }
    return res;
  };

  const resetData = () => {
    storageService.resetToSampleData();
    showToast('Reset all CRM data to initial sample dataset.', 'info');
  };

  return (
    <CrmContext.Provider
      value={{
        activeModule,
        setActiveModule,
        theme,
        toggleTheme,
        authUser,
        login,
        logout,
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
        getClientById,
        getCategoryById,
        getServiceById,
        getRoleById,
        getProjectById,
        getEmployeeById,
        getAssignmentById,
        getEmployeePaymentById,
        getExpenseCategoryById,
        getExpenseById,
        getProjectExpenses,
        getProjectExpensesTotalINR,
        getCategoryServicesCount,
        getClientProjectsCount,
        getServiceProjectsCount,
        getRoleEmployeesCount,
        saveClient: saveClientAction,
        deleteClient: deleteClientAction,
        setClientStatus: (id, status) => storageService.setClientStatus(id, status),
        saveCategory: saveCategoryAction,
        deleteCategory: deleteCategoryAction,
        setCategoryStatus: (id, status) => storageService.setCategoryStatus(id, status),
        saveService: saveServiceAction,
        deleteService: deleteServiceAction,
        setServiceStatus: (id, status) => storageService.setServiceStatus(id, status),
        saveProject: saveProjectAction,
        deleteProject: deleteProjectAction,
        setProjectStatus: (id, status) => storageService.setProjectStatus(id, status),
        savePayment: savePaymentAction,
        deletePayment: deletePaymentAction,
        saveRole: saveRoleAction,
        deleteRole: deleteRoleAction,
        saveEmployee: saveEmployeeAction,
        deleteEmployee: deleteEmployeeAction,
        saveAssignment: saveAssignmentAction,
        deleteAssignment: deleteAssignmentAction,
        saveEmployeePayment: saveEmployeePaymentAction,
        deleteEmployeePayment: deleteEmployeePaymentAction,
        saveExpenseCategory: saveExpenseCategoryAction,
        deleteExpenseCategory: deleteExpenseCategoryAction,
        setExpenseCategoryStatus: (id, status) => storageService.setExpenseCategoryStatus(id, status),
        saveExpense: saveExpenseAction,
        deleteExpense: deleteExpenseAction,
        referentialModal,
        closeReferentialModal,
        openReferentialBlock,
        isProjectModalOpen,
        isProjectModalEditing,
        projectModalData,
        openAddProjectModal,
        openEditProjectModal,
        closeProjectModal,
        toasts,
        showToast,
        removeToast,
        resetData,
      }}
    >
      {children}
    </CrmContext.Provider>
  );
};

export const useCrm = () => {
  const context = useContext(CrmContext);
  if (!context) {
    throw new Error('useCrm must be used within a CrmProvider');
  }
  return context;
};
