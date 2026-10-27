import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  ActiveModule,
  BrandName,
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
  Expense,
  GstInvoice,
  AppUser,
  AuthUser,
  UserRole,
  ExpenseCategoryStatus,
  ToastMessage,
  ReferentialBlockState,
  DeleteConfirmState,
  DeleteConfirmOptions,
  BrandMeta,
  BrandPrefix,
  BRAND_CONFIG,
  getBrandPrefix,
  ReportsSubTab,
  BankAccount,
} from '../types/crm';
import { storageService, DatabaseStatus } from '../services/storageService';

interface CrmContextType {
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;
  activeBrand: BrandName;
  setActiveBrand: (brand: BrandName) => void;
  brandPrefix: BrandPrefix;
  brandMeta: BrandMeta;
  isConsolidatedView: boolean;
  setIsConsolidatedView: (val: boolean) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Session & Authentication
  authUser: AuthUser | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateCredentials: (data: {
    id?: string;
    adminId?: string;
    email?: string;
    name?: string;
    currentPassword?: string;
    newPassword?: string;
    password?: string;
    role?: string;
    brand?: string;
  }) => Promise<{ success: boolean; message?: string; error?: string }>;

  // Filtered views scoped to activeBrand (or all if consolidated)
  clients: Client[];
  categories: ServiceCategory[];
  services: Service[];
  projects: Project[];
  payments: Payment[];
  bankAccounts: BankAccount[];
  roles: EmployeeRole[];
  employees: Employee[];
  assignments: Assignment[];
  employeePayments: EmployeePayment[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  gstInvoices: GstInvoice[];

  // Unfiltered Master Collections (for consolidated analytics)
  allProjects: Project[];
  allPayments: Payment[];
  allClients: Client[];

  // Reports navigation
  activeReportsTab: ReportsSubTab;
  setActiveReportsTab: (tab: ReportsSubTab) => void;

  // Direct entity getters by ID
  getClientById: (id: string) => Client | undefined;
  getCategoryById: (id?: string | null) => ServiceCategory | undefined;
  getServiceById: (id: string) => Service | undefined;
  getRoleById: (id: string) => EmployeeRole | undefined;
  getProjectById: (id: string) => Project | undefined;
  getEmployeeById: (id: string) => Employee | undefined;
  getAssignmentById: (id: string) => Assignment | undefined;
  getEmployeePaymentById: (id: string) => EmployeePayment | undefined;
  getExpenseCategoryById: (id: string) => ExpenseCategory | undefined;
  getExpenseById: (id: string) => Expense | undefined;
  getGstInvoiceById: (id: string) => GstInvoice | undefined;
  getGstInvoiceByPaymentId: (paymentId: string) => GstInvoice | undefined;
  getBankAccountById: (id: string) => BankAccount | undefined;
  getProjectExpenses: (projectId: string) => Expense[];
  getProjectExpensesTotalINR: (projectId: string) => number;

  // Auto-calculated relational counts
  getCategoryServicesCount: (categoryId: string) => number;
  getClientProjectsCount: (clientId: string) => number;
  getServiceProjectsCount: (serviceId: string) => number;
  getRoleEmployeesCount: (roleId: string) => number;

  // Actions (Direct Live Azure SQL operations)
  saveClient: (client: Client) => Promise<{ success: boolean; error?: string }>;
  deleteClient: (clientId: string) => Promise<{ success: boolean; error?: string }>;
  setClientStatus: (clientId: string, status: Client['status']) => Promise<void>;

  saveCategory: (category: ServiceCategory) => Promise<{ success: boolean; error?: string }>;
  deleteCategory: (categoryId: string) => Promise<{ success: boolean; error?: string }>;
  setCategoryStatus: (categoryId: string, status: ServiceCategory['status']) => Promise<void>;

  saveService: (service: Service) => Promise<{ success: boolean; error?: string }>;
  deleteService: (serviceId: string) => Promise<{ success: boolean; error?: string }>;
  setServiceStatus: (serviceId: string, status: Service['status']) => Promise<void>;

  saveProject: (project: Project) => Promise<{ success: boolean; error?: string }>;
  deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  setProjectStatus: (projectId: string, status: Project['status']) => Promise<void>;

  savePayment: (payment: Payment) => Promise<{
    success: boolean;
    payment?: Payment;
    gstInvoice?: GstInvoice;
    gstInvoiceSynced?: boolean;
    warning?: string;
    gstSyncError?: string;
    error?: string;
  }>;
  deletePayment: (paymentId: string) => Promise<{ success: boolean; error?: string }>;

  saveBankAccount: (account: BankAccount) => Promise<{ success: boolean; error?: string }>;
  deleteBankAccount: (id: string) => Promise<{ success: boolean; error?: string }>;
  setBankAccountStatus: (id: string, status: BankAccount['status']) => Promise<void>;

  saveRole: (role: EmployeeRole) => Promise<{ success: boolean; error?: string }>;
  deleteRole: (roleId: string) => Promise<{ success: boolean; error?: string }>;

  saveEmployee: (employee: Employee, isUpdate?: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteEmployee: (employeeId: string) => Promise<{ success: boolean; error?: string }>;

  saveAssignment: (assignment: Assignment) => Promise<{ success: boolean; error?: string }>;
  deleteAssignment: (assignmentId: string) => Promise<{ success: boolean; error?: string }>;

  saveEmployeePayment: (payment: EmployeePayment) => Promise<{ success: boolean; error?: string }>;
  deleteEmployeePayment: (paymentId: string) => Promise<{ success: boolean; error?: string }>;

  saveExpenseCategory: (category: ExpenseCategory) => Promise<{ success: boolean; error?: string }>;
  deleteExpenseCategory: (categoryId: string) => Promise<{ success: boolean; error?: string }>;
  setExpenseCategoryStatus: (categoryId: string, status: ExpenseCategoryStatus) => Promise<void>;

  saveExpense: (expense: Expense) => Promise<{ success: boolean; error?: string }>;
  deleteExpense: (expenseId: string) => Promise<{ success: boolean; error?: string }>;

  saveGstInvoice: (invoice: GstInvoice) => Promise<{ success: boolean; error?: string }>;
  deleteGstInvoice: (invoiceId: string) => Promise<{ success: boolean; error?: string }>;
  refreshGstInvoices: () => Promise<GstInvoice[]>;
  syncGstInvoicesFromPayments: () => Promise<{ success: boolean; count: number; error?: string }>;

  // Users & RBAC
  users: AppUser[];
  saveUser: (user: AppUser) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean }>;
  hasPermission: (allowedRoles: (UserRole | string)[]) => boolean;

  // Live Azure SQL Database Connection
  databaseStatus: DatabaseStatus;
  refreshDatabaseStatus: () => Promise<void>;
  syncWithDatabase: () => Promise<void>;
  clearDemoData: () => Promise<{ success: boolean; message: string; remainingUsers?: AppUser[]; error?: string }>;

  // Referential Deletion Protection Modal
  referentialModal: ReferentialBlockState;
  closeReferentialModal: () => void;
  openReferentialBlock: (options: Omit<ReferentialBlockState, 'isOpen'>) => void;

  // Global Delete Confirmation Modal
  deleteConfirmModal: DeleteConfirmState;
  confirmDelete: (options: DeleteConfirmOptions) => void;
  closeDeleteConfirm: () => void;

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

  // Workspace Enforcement Modal & Brand Workspace Selection
  isWorkspaceModalOpen: boolean;
  isWorkspaceMandatory: boolean;
  hasConfirmedWorkspace: boolean;
  openWorkspaceModal: (mandatory?: boolean) => void;
  closeWorkspaceModal: () => void;
  selectBrandWorkspace: (brand: BrandName, isConsolidated?: boolean, remember?: boolean) => void;

  // Live Refresh
  refreshData: () => Promise<void>;
}

const CrmContext = createContext<CrmContextType | undefined>(undefined);

export const CrmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModule] = useState<ActiveModule>('dashboard');
  const [activeBrand, setActiveBrandState] = useState<BrandName>('Device Doctor India');
  const [isConsolidatedView, setIsConsolidatedView] = useState(false);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [activeReportsTab, setActiveReportsTab] = useState<ReportsSubTab>('business');

  const brandPrefix: BrandPrefix = useMemo(() => getBrandPrefix(activeBrand), [activeBrand]);
  const brandMeta: BrandMeta = useMemo(() => BRAND_CONFIG[activeBrand] || BRAND_CONFIG['Device Doctor India'], [activeBrand]);

  // Master Raw State loaded strictly from live Azure SQL Database
  const [rawClients, setRawClients] = useState<Client[]>([]);
  const [rawCategories, setRawCategories] = useState<ServiceCategory[]>([]);
  const [rawServices, setRawServices] = useState<Service[]>([]);
  const [rawProjects, setRawProjects] = useState<Project[]>([]);
  const [rawPayments, setRawPayments] = useState<Payment[]>([]);
  const [rawBankAccounts, setRawBankAccounts] = useState<BankAccount[]>([]);
  const [rawRoles, setRawRoles] = useState<EmployeeRole[]>([]);
  const [rawEmployees, setRawEmployees] = useState<Employee[]>([]);
  const [rawAssignments, setRawAssignments] = useState<Assignment[]>([]);
  const [rawEmployeePayments, setRawEmployeePayments] = useState<EmployeePayment[]>([]);
  const [rawExpenseCategories, setRawExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [rawExpenses, setRawExpenses] = useState<Expense[]>([]);
  const [rawGstInvoices, setRawGstInvoices] = useState<GstInvoice[]>([]);
  const [rawUsers, setRawUsers] = useState<AppUser[]>([]);

  // Authentication State
  const [authUser, setAuthUserState] = useState<AuthUser | null>(null);

  // Live Azure SQL Database Connection Diagnostics
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>({
    connected: false,
    isMock: true,
    error: 'Connecting to Azure SQL Database...',
    timestamp: new Date().toISOString(),
    tables: {},
  });

  // Global Toast State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Referential Integrity Modal State
  const [referentialModal, setReferentialModal] = useState<ReferentialBlockState>({
    isOpen: false,
    title: '',
    message: '',
    entityName: '',
    entityType: '',
    entityId: '',
    linkedCount: 0,
  });

  // Global Delete Confirmation Modal State
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<DeleteConfirmState>({
    isOpen: false,
    recordTitle: '',
    moduleName: 'Record',
    onConfirm: () => {},
  });

  // Global Project Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isProjectModalEditing, setIsProjectModalEditing] = useState(false);
  const [projectModalData, setProjectModalData] = useState<Partial<Project> | null>(null);

  // Workspace Enforcement Modal State
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isWorkspaceMandatory, setIsWorkspaceMandatory] = useState(false);
  const [hasConfirmedWorkspace, setHasConfirmedWorkspaceState] = useState(() => storageService.getHasConfirmedWorkspace());

  const openWorkspaceModal = (mandatory = false) => {
    setIsWorkspaceMandatory(mandatory);
    setIsWorkspaceModalOpen(true);
  };

  const closeWorkspaceModal = () => {
    if (!isWorkspaceMandatory) {
      setIsWorkspaceModalOpen(false);
    }
  };

  const selectBrandWorkspace = (brand: BrandName, isConsolidated: boolean = false, remember: boolean = true) => {
    setActiveBrandState(brand);
    setIsConsolidatedView(isConsolidated);
    storageService.setIsConsolidated(isConsolidated);
    if (remember) {
      storageService.setActiveBrand(brand);
    }
    storageService.setHasConfirmedWorkspace(true);
    setHasConfirmedWorkspaceState(true);
    setIsWorkspaceModalOpen(false);
    setIsWorkspaceMandatory(false);
    showToast(`Active workspace set to ${isConsolidated ? 'All Brands (Consolidated Enterprise View)' : brand}`, 'success');
    loadAll();
  };

  const setActiveBrand = (brand: BrandName) => {
    setActiveBrandState(brand);
    storageService.setActiveBrand(brand);
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
    setReferentialModal((prev: ReferentialBlockState) => ({ ...prev, isOpen: false }));
  };

  const openReferentialBlock = (options: Omit<ReferentialBlockState, 'isOpen'>) => {
    setReferentialModal({
      ...options,
      isOpen: true,
    });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const confirmDelete = (options: DeleteConfirmOptions) => {
    setDeleteConfirmModal({
      ...options,
      isOpen: true,
    });
  };

  // --- Strict Live SQL Loader ---
  const loadAll = async () => {
    try {
      storageService.init();
      setActiveBrandState(storageService.getActiveBrand());
      const currentTheme = storageService.getTheme();
      setThemeState(currentTheme);
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      const currentAuthUser = storageService.getAuthUser();
      const currentToken = storageService.getAuthToken();
      if (currentAuthUser && currentToken) {
        setAuthUserState(currentAuthUser);
        storageService.verifySession().then((verifiedUser) => {
          if (verifiedUser) {
            setAuthUserState(verifiedUser);
          } else {
            setAuthUserState(null);
            setHasConfirmedWorkspaceState(false);
          }
        }).catch(() => {});
      } else if (!currentToken) {
        setAuthUserState(null);
        storageService.setAuthUser(null);
      }

      const [
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
        status,
      ] = await Promise.all([
        storageService.fetchClients().catch((err) => {
          console.warn('[Fetch Clients]', err);
          return [] as Client[];
        }),
        storageService.fetchCategories().catch((err) => {
          console.warn('[Fetch Categories]', err);
          return [] as ServiceCategory[];
        }),
        storageService.fetchServices().catch((err) => {
          console.warn('[Fetch Services]', err);
          return [] as Service[];
        }),
        storageService.fetchProjects().catch((err) => {
          console.warn('[Fetch Projects]', err);
          return [] as Project[];
        }),
        storageService.fetchPayments().catch((err) => {
          console.warn('[Fetch Payments]', err);
          return [] as Payment[];
        }),
        storageService.fetchBankAccounts().catch((err) => {
          console.warn('[Fetch Bank Accounts]', err);
          return [] as BankAccount[];
        }),
        storageService.fetchGstInvoices().catch((err) => {
          console.warn('[Fetch GST Invoices]', err);
          return [] as GstInvoice[];
        }),
        storageService.fetchRoles().catch((err) => {
          console.warn('[Fetch Roles]', err);
          return [] as EmployeeRole[];
        }),
        storageService.fetchEmployees().catch((err) => {
          console.warn('[Fetch Employees]', err);
          return [] as Employee[];
        }),
        storageService.fetchAssignments().catch((err) => {
          console.warn('[Fetch Assignments]', err);
          return [] as Assignment[];
        }),
        storageService.fetchEmployeePayments().catch((err) => {
          console.warn('[Fetch Employee Payments]', err);
          return [] as EmployeePayment[];
        }),
        storageService.fetchExpenseCategories().catch((err) => {
          console.warn('[Fetch Expense Categories]', err);
          return [] as ExpenseCategory[];
        }),
        storageService.fetchExpenses().catch((err) => {
          console.warn('[Fetch Expenses]', err);
          return [] as Expense[];
        }),
        storageService.fetchAppUsers().catch((err) => {
          console.warn('[Fetch Users]', err);
          return [] as AppUser[];
        }),
        storageService.getDatabaseStatus(),
      ]);

      setRawClients(clients);
      setRawCategories(categories);
      setRawServices(services);
      setRawProjects(projects);
      setRawPayments(payments);
      setRawBankAccounts(bankAccounts);
      setRawGstInvoices(gstInvoices);
      setRawRoles(roles);
      setRawEmployees(employees);
      setRawAssignments(assignments);
      setRawEmployeePayments(employeePayments);
      setRawExpenseCategories(expenseCategories);
      setRawExpenses(expenses);
      setRawUsers(users);
      setDatabaseStatus(status);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Azure SQL Connection Notice: ${msg}`, 'warning');
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

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    const res = await storageService.login(email, pass);
    if (res.success && res.user) {
      setAuthUserState(res.user);
      storageService.setHasConfirmedWorkspace(false);
      setHasConfirmedWorkspaceState(false);

      let defaultBrand: BrandName = 'Device Doctor India';
      if (res.user.brand && res.user.brand !== 'All') {
        defaultBrand = res.user.brand as BrandName;
      } else {
        defaultBrand = storageService.getActiveBrand();
      }
      setActiveBrandState(defaultBrand);
      setIsConsolidatedView(false);

      showToast(`Welcome back, ${res.user.name}! Please select your active brand workspace.`, 'info');
      return { success: true };
    }
    const errMessage = res.error || 'Authentication failed against live Azure SQL app_users.';
    showToast(errMessage, 'error');
    return { success: false, error: errMessage };
  };

  const logout = () => {
    storageService.apiCall('/api/auth/logout', 'POST').catch(() => {});
    storageService.setAuthToken(null);
    storageService.setAuthUser(null);
    storageService.setHasConfirmedWorkspace(false);
    setHasConfirmedWorkspaceState(false);
    setAuthUserState(null);
    setIsWorkspaceModalOpen(false);
    setIsWorkspaceMandatory(false);
    showToast('Logged out securely.', 'info');
  };

  const hasPermission = (allowedRoles: (UserRole | string)[]): boolean => {
    if (!authUser) return false;
    if (authUser.role === 'Super Admin' || authUser.role === 'Super Administrator') return true;
    return allowedRoles.includes(authUser.role);
  };

  const refreshDatabaseStatus = async () => {
    const st = await storageService.reconnectDatabase();
    setDatabaseStatus(st);
    await loadAll();
    if (st.connected) {
      showToast('Successfully connected to Azure SQL Database!', 'success');
    } else {
      showToast(`Azure SQL Status: ${st.error || 'Connection pending firewall approval'}`, 'warning');
    }
  };

  const syncWithDatabase = async () => {
    await refreshDatabaseStatus();
  };

  const clearDemoData = async () => {
    showToast('Purging demo data from Azure SQL Database...', 'info');
    const res = await storageService.clearDemoData();
    await loadAll();
    if (res.success) {
      showToast(res.message, 'success');
    } else {
      showToast(`Database clear error: ${res.error || res.message}`, 'error');
    }
    return res;
  };

  // Relational entity lookup maps with case-insensitive and multi-key indexing
  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    rawClients.forEach((c) => {
      if (c.id) {
        map.set(c.id, c);
        map.set(c.id.toLowerCase(), c);
      }
      if ((c as any).client_id) {
        map.set((c as any).client_id, c);
        map.set(String((c as any).client_id).toLowerCase(), c);
      }
      if ((c as any).client_id_code) {
        map.set((c as any).client_id_code, c);
        map.set(String((c as any).client_id_code).toLowerCase(), c);
      }
    });
    return map;
  }, [rawClients]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, ServiceCategory>();
    rawCategories.forEach((c) => {
      if (c.id) {
        map.set(c.id, c);
        map.set(c.id.toLowerCase(), c);
      }
      if (c.guid) {
        map.set(c.guid, c);
        map.set(c.guid.toLowerCase(), c);
      }
      if (c.category_id_code) {
        map.set(c.category_id_code, c);
        map.set(c.category_id_code.toLowerCase(), c);
      }
    });
    return map;
  }, [rawCategories]);

  const serviceMap = useMemo(() => {
    const map = new Map<string, Service>();
    rawServices.forEach((s) => {
      if (s.id) {
        map.set(s.id, s);
        map.set(s.id.toLowerCase(), s);
      }
      if ((s as any).service_id_code) {
        map.set((s as any).service_id_code, s);
        map.set(String((s as any).service_id_code).toLowerCase(), s);
      }
      if ((s as any).guid) {
        map.set((s as any).guid, s);
        map.set(String((s as any).guid).toLowerCase(), s);
      }
    });
    return map;
  }, [rawServices]);

  const roleMap = useMemo(() => {
    const map = new Map<string, EmployeeRole>();
    rawRoles.forEach((r) => {
      if (r.id) {
        map.set(r.id, r);
        map.set(r.id.toLowerCase(), r);
      }
      if ((r as any).role_id_code) {
        map.set((r as any).role_id_code, r);
        map.set(String((r as any).role_id_code).toLowerCase(), r);
      }
    });
    return map;
  }, [rawRoles]);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    rawProjects.forEach((p) => {
      if (p.id) {
        map.set(p.id, p);
        map.set(p.id.toLowerCase(), p);
      }
      if ((p as any).project_id_code) {
        map.set((p as any).project_id_code, p);
        map.set(String((p as any).project_id_code).toLowerCase(), p);
      }
    });
    return map;
  }, [rawProjects]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    rawEmployees.forEach((e) => {
      if (e.id) {
        map.set(e.id, e);
        map.set(e.id.toLowerCase(), e);
      }
      if ((e as any).employee_id_code) {
        map.set((e as any).employee_id_code, e);
        map.set(String((e as any).employee_id_code).toLowerCase(), e);
      }
    });
    return map;
  }, [rawEmployees]);

  const assignmentMap = useMemo(() => new Map(rawAssignments.map((a) => [a.id, a])), [rawAssignments]);
  const employeePaymentMap = useMemo(() => new Map(rawEmployeePayments.map((p) => [p.id, p])), [rawEmployeePayments]);
  const expenseCategoryMap = useMemo(() => {
    const map = new Map<string, ExpenseCategory>();
    rawExpenseCategories.forEach((c) => {
      if (c.id) {
        map.set(c.id, c);
        map.set(c.id.toLowerCase(), c);
      }
      if ((c as any).exp_category_id_code) {
        map.set((c as any).exp_category_id_code, c);
        map.set(String((c as any).exp_category_id_code).toLowerCase(), c);
      }
    });
    return map;
  }, [rawExpenseCategories]);
  const expenseMap = useMemo(() => new Map(rawExpenses.map((e) => [e.id, e])), [rawExpenses]);
  const gstInvoiceMap = useMemo(() => new Map(rawGstInvoices.map((g) => [g.id, g])), [rawGstInvoices]);
  const gstInvoicePaymentMap = useMemo(() => new Map(rawGstInvoices.map((g) => [g.paymentId, g])), [rawGstInvoices]);
  const bankAccountMap = useMemo(() => {
    const map = new Map<string, BankAccount>();
    rawBankAccounts.forEach((b) => {
      if (b.id) {
        map.set(b.id, b);
        map.set(b.id.toLowerCase(), b);
      }
      if ((b as any).account_id_code) {
        map.set((b as any).account_id_code, b);
        map.set(String((b as any).account_id_code).toLowerCase(), b);
      }
    });
    return map;
  }, [rawBankAccounts]);

  const getClientById = (id?: string | null) => {
    if (!id) return undefined;
    return clientMap.get(id) || clientMap.get(id.toLowerCase());
  };
  const getCategoryById = (id?: string | null) => {
    if (!id || id === 'NA' || id === 'undefined' || id === 'null') return undefined;
    return categoryMap.get(id) || categoryMap.get(id.toLowerCase());
  };
  const getServiceById = (id?: string | null) => {
    if (!id) return undefined;
    return serviceMap.get(id) || serviceMap.get(id.toLowerCase());
  };
  const getRoleById = (id?: string | null) => {
    if (!id) return undefined;
    return roleMap.get(id) || roleMap.get(id.toLowerCase());
  };
  const getProjectById = (id?: string | null) => {
    if (!id) return undefined;
    return projectMap.get(id) || projectMap.get(id.toLowerCase());
  };
  const getEmployeeById = (id?: string | null) => {
    if (!id) return undefined;
    return employeeMap.get(id) || employeeMap.get(id.toLowerCase());
  };
  const getAssignmentById = (id?: string | null) => {
    if (!id) return undefined;
    return assignmentMap.get(id) || assignmentMap.get(id.toLowerCase());
  };
  const getEmployeePaymentById = (id?: string | null) => {
    if (!id) return undefined;
    return employeePaymentMap.get(id) || employeePaymentMap.get(id.toLowerCase());
  };
  const getExpenseCategoryById = (id?: string | null) => {
    if (!id) return undefined;
    return expenseCategoryMap.get(id) || expenseCategoryMap.get(id.toLowerCase());
  };
  const getExpenseById = (id?: string | null) => {
    if (!id) return undefined;
    return expenseMap.get(id);
  };
  const getGstInvoiceById = (id?: string | null) => {
    if (!id) return undefined;
    return gstInvoiceMap.get(id);
  };
  const getGstInvoiceByPaymentId = (paymentId?: string | null) => {
    if (!paymentId) return undefined;
    return gstInvoicePaymentMap.get(paymentId);
  };
  const getBankAccountById = (id?: string | null) => {
    if (!id) return undefined;
    return bankAccountMap.get(id) || bankAccountMap.get(id.toLowerCase());
  };
  const getProjectExpenses = (projectId: string) => {
    if (!projectId || projectId === 'NA') return [];
    return rawExpenses.filter((e) => e.projectId === projectId);
  };
  const getProjectExpensesTotalINR = (projectId: string) => {
    return getProjectExpenses(projectId).reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  };

  // Filtered lists scoped to workspace
  const clients = useMemo(() => {
    if (isConsolidatedView) return rawClients;
    return rawClients.filter((c) => c.brand === activeBrand);
  }, [rawClients, activeBrand, isConsolidatedView]);

  const categories = useMemo(() => {
    if (isConsolidatedView) return rawCategories;
    return rawCategories.filter((c) => c.brand === activeBrand);
  }, [rawCategories, activeBrand, isConsolidatedView]);

  const services = useMemo(() => {
    if (isConsolidatedView) return rawServices;
    return rawServices.filter((s) => s.brand === activeBrand);
  }, [rawServices, activeBrand, isConsolidatedView]);

  const projects = useMemo(() => {
    if (isConsolidatedView) return rawProjects;
    return rawProjects.filter((p) => p.brand === activeBrand);
  }, [rawProjects, activeBrand, isConsolidatedView]);

  const payments = useMemo(() => {
    if (isConsolidatedView) return rawPayments;
    return rawPayments.filter((p) => p.brand === activeBrand);
  }, [rawPayments, activeBrand, isConsolidatedView]);

  const bankAccounts = useMemo(() => {
    if (isConsolidatedView) return rawBankAccounts;
    return rawBankAccounts.filter((b) => b.brand === activeBrand);
  }, [rawBankAccounts, activeBrand, isConsolidatedView]);

  const roles = useMemo(() => {
    if (isConsolidatedView) return rawRoles;
    return rawRoles.filter((r) => r.brand === activeBrand);
  }, [rawRoles, activeBrand, isConsolidatedView]);

  const employees = useMemo(() => {
    if (isConsolidatedView) return rawEmployees;
    return rawEmployees.filter((e) => e.brand === activeBrand);
  }, [rawEmployees, activeBrand, isConsolidatedView]);

  const assignments = useMemo(() => {
    if (isConsolidatedView) return rawAssignments;
    return rawAssignments.filter((a) => a.brand === activeBrand);
  }, [rawAssignments, activeBrand, isConsolidatedView]);

  const employeePayments = useMemo(() => {
    if (isConsolidatedView) return rawEmployeePayments;
    return rawEmployeePayments.filter((p) => p.brand === activeBrand);
  }, [rawEmployeePayments, activeBrand, isConsolidatedView]);

  const expenseCategories = useMemo(() => {
    if (isConsolidatedView) return rawExpenseCategories;
    return rawExpenseCategories.filter((c) => c.brand === activeBrand);
  }, [rawExpenseCategories, activeBrand, isConsolidatedView]);

  const expenses = useMemo(() => {
    if (isConsolidatedView) return rawExpenses;
    return rawExpenses.filter((e) => e.brand === activeBrand);
  }, [rawExpenses, activeBrand, isConsolidatedView]);

  const gstInvoices = useMemo(() => {
    if (isConsolidatedView) return rawGstInvoices;
    return rawGstInvoices.filter((g) => g.brand === activeBrand);
  }, [rawGstInvoices, activeBrand, isConsolidatedView]);

  const users = useMemo(() => {
    if (isConsolidatedView) return rawUsers;
    return rawUsers.filter((u) => u.brand === 'All' || u.brand === activeBrand);
  }, [rawUsers, activeBrand, isConsolidatedView]);

  const getCategoryServicesCount = (catId: string) => {
    const targetCat = getCategoryById(catId);
    return services.filter((s) => {
      if (s.categoryId === catId) return true;
      if (targetCat && (s.categoryId === targetCat.id || s.categoryId === targetCat.guid || s.categoryId === targetCat.category_id_code)) return true;
      if (targetCat && (s.categoryName === targetCat.name || s.category_name === targetCat.name)) return true;
      return false;
    }).length;
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

  // --- Strict Live SQL Entity Actions ---
  const saveClientAction = async (client: Client) => {
    if (!client.brand || (client.brand as string) === 'All' || (client.brand as string) === 'All Brands') {
      client.brand = activeBrand;
    }
    if (client.brand !== 'Device Doctor India' && client.brand !== 'Codestro' && client.brand !== 'FX Launch Pad' && client.brand !== 'DUNS') {
      client.brand = 'Device Doctor India';
    }
    if (!client.id || /^([A-Z]+-)?CL-\d+/i.test(client.id) || /^[0-9a-f-]{36}$/i.test(client.id)) {
      client.id = storageService.generateSemanticClientId(client.brand, client.name, rawClients);
    }
    const res = await storageService.saveClient(client);
    if (res.success) {
      const savedClient = res.client || client;
      setRawClients((prev) => {
        const idx = prev.findIndex((c) => c.id === savedClient.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedClient;
          return updated;
        }
        return [savedClient, ...prev];
      });
      showToast(`Client "${client.name}" saved under ${client.brand} workspace.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveClient]', err));
    } else {
      showToast(res.error || 'Failed to save client to Azure SQL.', 'error');
    }
    return res;
  };

  const deleteClientAction = async (clientId: string) => {
    const client = getClientById(clientId);
    const clientName = client?.name || clientId;
    const check = storageService.canDeleteClient(clientId, rawProjects);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Client Has Active Projects',
        message: `Client "${clientName}" is currently linked to ${check.linkedCount} Project record(s) in Azure SQL. Deletion blocked to preserve database integrity.`,
        entityName: clientName,
        entityType: 'Client',
        entityId: clientId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          await setClientStatus(clientId, 'Inactive');
          showToast(`Client "${clientName}" marked as Inactive in Azure SQL.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteClient(clientId);
    if (res.success) {
      setRawClients((prev) => prev.filter((c) => c.id !== clientId && (c as any).client_id_code !== clientId));
      showToast(`Client "${clientName}" deleted successfully.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteClient]', err));
    } else {
      showToast(res.error || 'Failed to delete client from Azure SQL.', 'error');
    }
    return res;
  };

  const setClientStatus = async (clientId: string, status: Client['status']) => {
    const client = getClientById(clientId);
    if (!client) return;
    await saveClientAction({ ...client, status });
  };

  const saveCategoryAction = async (category: ServiceCategory) => {
    if (!category.brand) category.brand = activeBrand;
    if (!category.id) {
      category.id = storageService.generateId('CAT', category.brand, rawCategories);
    }
    const res = await storageService.saveCategory(category);
    if (res.success) {
      const savedCategory = res.category || category;
      setRawCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === savedCategory.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedCategory;
          return updated;
        }
        return [savedCategory, ...prev];
      });
      showToast(`Category "${category.name}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveCategory]', err));
    } else {
      showToast(res.error || 'Failed to save category to Azure SQL.', 'error');
    }
    return res;
  };

  const deleteCategoryAction = async (categoryId: string) => {
    const cat = getCategoryById(categoryId);
    const catName = cat?.name || categoryId;
    const check = storageService.canDeleteCategory(categoryId, rawServices);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Category Contains Linked Services',
        message: `Category "${catName}" contains ${check.linkedCount} linked Service item(s). Reassign or delete them first.`,
        entityName: catName,
        entityType: 'Category',
        entityId: categoryId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          await setCategoryStatus(categoryId, 'Inactive');
          showToast(`Category "${catName}" marked as Inactive in Azure SQL.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteCategory(categoryId);
    if (res.success) {
      setRawCategories((prev) => prev.filter((c) => c.id !== categoryId && (c as any).category_id_code !== categoryId && (c as any).guid !== categoryId));
      showToast(`Category "${catName}" deleted successfully.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteCategory]', err));
    } else {
      showToast(res.error || 'Failed to delete category.', 'error');
    }
    return res;
  };

  const setCategoryStatus = async (categoryId: string, status: ServiceCategory['status']) => {
    const cat = getCategoryById(categoryId);
    if (!cat) return;
    await saveCategoryAction({ ...cat, status });
  };

  const saveServiceAction = async (service: Service) => {
    if (!service.brand) service.brand = activeBrand;
    if (!service.id) {
      service.id = storageService.generateId('SRV', service.brand, rawServices);
    }
    const res = await storageService.saveService(service);
    if (res.success) {
      const savedService = res.service || service;
      setRawServices((prev) => {
        const idx = prev.findIndex((s) => s.id === savedService.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedService;
          return updated;
        }
        return [savedService, ...prev];
      });
      showToast(`Service "${service.name}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveService]', err));
    } else {
      showToast(res.error || 'Failed to save service.', 'error');
    }
    return res;
  };

  const deleteServiceAction = async (serviceId: string) => {
    const srv = getServiceById(serviceId);
    const srvName = srv?.name || serviceId;
    const check = storageService.canDeleteService(serviceId, rawProjects);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Service Used in Active Projects',
        message: `Service "${srvName}" is referenced in ${check.linkedCount} active Project record(s). Deletion blocked.`,
        entityName: srvName,
        entityType: 'Service',
        entityId: serviceId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          await setServiceStatus(serviceId, 'Inactive');
          showToast(`Service "${srvName}" marked as Inactive in Azure SQL.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteService(serviceId);
    if (res.success) {
      setRawServices((prev) => prev.filter((s) => s.id !== serviceId && (s as any).service_id_code !== serviceId && (s as any).guid !== serviceId));
      showToast(`Service "${srvName}" deleted successfully.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteService]', err));
    } else {
      showToast(res.error || 'Failed to delete service.', 'error');
    }
    return res;
  };

  const setServiceStatus = async (serviceId: string, status: Service['status']) => {
    const srv = getServiceById(serviceId);
    if (!srv) return;
    await saveServiceAction({ ...srv, status });
  };

  const saveProjectAction = async (project: Project) => {
    if (!project.brand || (project.brand as string) === 'All' || (project.brand as string) === 'All Brands') {
      project.brand = activeBrand;
    }
    if (project.brand !== 'Device Doctor India' && project.brand !== 'Codestro' && project.brand !== 'FX Launch Pad' && project.brand !== 'DUNS') {
      project.brand = 'Device Doctor India';
    }
    if (!project.id || /^([A-Z]+-)?PRJ-\d+/i.test(project.id) || /^[0-9a-f-]{36}$/i.test(project.id) || project.id.includes(' - ')) {
      const client = getClientById(project.clientId);
      const service = getServiceById(project.serviceId);
      project.id = storageService.generateSemanticProjectId(
        project.brand,
        client?.name || project.clientName || 'CLIENT',
        service?.name || 'SERVICE',
        rawProjects,
        undefined,
        project.clientId,
        project.serviceId
      );
    }
    const res = await storageService.saveProject(project);
    if (res.success) {
      const savedProject = res.project || project;
      setRawProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === savedProject.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedProject;
          return updated;
        }
        return [savedProject, ...prev];
      });
      showToast(`Project "${project.id}" saved under ${project.brand} workspace.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveProject]', err));
    } else {
      showToast(res.error || 'Failed to save project.', 'error');
    }
    return res;
  };

  const deleteProjectAction = async (projectId: string) => {
    const check = storageService.canDeleteProject(
      projectId,
      rawPayments,
      rawAssignments,
      rawExpenses,
      rawGstInvoices
    );

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Project Contains Child Records',
        message: check.reason || 'This Project contains linked payments, assignments, or invoices.',
        entityName: projectId,
        entityType: 'Project',
        entityId: projectId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          await setProjectStatus(projectId, 'Cancelled');
          showToast(`Project "${projectId}" marked as Cancelled in Azure SQL.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteProject(projectId);
    if (res.success) {
      setRawProjects((prev) => prev.filter((p) => p.id !== projectId && (p as any).project_id_code !== projectId));
      showToast(`Project "${projectId}" deleted successfully.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteProject]', err));
    } else {
      showToast(res.error || 'Failed to delete project.', 'error');
    }
    return res;
  };

  const setProjectStatus = async (projectId: string, status: Project['status']) => {
    const proj = getProjectById(projectId);
    if (!proj) return;
    await saveProjectAction({ ...proj, status });
  };

  const savePaymentAction = async (payment: Payment) => {
    if (!payment.brand) payment.brand = activeBrand;
    if (!payment.id) {
      payment.id = storageService.generateId('PAY', payment.brand, rawPayments);
    }
    const res = await storageService.savePayment(payment);
    if (res.success) {
      const savedPayment = res.payment || payment;
      setRawPayments((prev) => {
        const idx = prev.findIndex((p) => p.id === savedPayment.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedPayment;
          return updated;
        }
        return [savedPayment, ...prev];
      });

      // Real-time synchronization into GST Invoices state
      if (res.gstInvoice) {
        setRawGstInvoices((prev) => {
          const idx = prev.findIndex(
            (g) => g.id === res.gstInvoice!.id || g.paymentId === res.gstInvoice!.paymentId
          );
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = res.gstInvoice!;
            return updated;
          }
          return [res.gstInvoice!, ...prev];
        });
      } else if (savedPayment.paymentMode === 'GST Invoice') {
        storageService
          .fetchGstInvoices()
          .then((invoices) => {
            if (Array.isArray(invoices)) {
              setRawGstInvoices(invoices);
            }
          })
          .catch((err) => console.warn('[Auto-sync GST Invoices re-fetch]', err));
      }

      if (savedPayment.paymentMode === 'GST Invoice' && res.gstInvoiceSynced === false) {
        const warnMsg =
          res.warning ||
          `Payment voucher "${savedPayment.id}" recorded in Azure SQL, but GST Invoice synchronization is pending.`;
        showToast(warnMsg, 'warning');
      } else {
        showToast(`Payment voucher "${savedPayment.id}" recorded in Azure SQL.`, 'success');
      }
      loadAll().catch((err) => console.warn('[Background refresh after savePayment]', err));
    } else {
      showToast(res.error || 'Failed to record payment in Azure SQL.', 'error');
    }
    return res;
  };

  const deletePaymentAction = async (paymentId: string) => {
    const res = await storageService.deletePayment(paymentId);
    if (res.success) {
      setRawPayments((prev) => prev.filter((p) => p.id !== paymentId && (p as any).payment_id_code !== paymentId));
      showToast(`Payment "${paymentId}" removed from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deletePayment]', err));
    } else {
      showToast(res.error || 'Failed to remove payment.', 'error');
    }
    return res;
  };

  const saveBankAccountAction = async (account: BankAccount) => {
    if (!account.brand) account.brand = activeBrand;
    if (!account.id) {
      account.id = storageService.generateId('ACC', account.brand, rawBankAccounts);
    }
    const res = await storageService.saveBankAccount(account);
    if (res.success) {
      const savedAccount = res.bankAccount || account;
      setRawBankAccounts((prev) => {
        const idx = prev.findIndex((b) => b.id === savedAccount.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedAccount;
          return updated;
        }
        return [savedAccount, ...prev];
      });
      showToast(`Bank account "${account.accountName}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveBankAccount]', err));
    } else {
      showToast(res.error || 'Failed to save bank account to Azure SQL.', 'error');
    }
    return res;
  };

  const deleteBankAccountAction = async (bankAccountId: string) => {
    const bnk = getBankAccountById(bankAccountId);
    const bnkName = bnk?.accountName || bankAccountId;
    const check = storageService.canDeleteBankAccount(bankAccountId, rawPayments);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Bank Account Linked to Payments',
        message: check.reason || `Cannot delete bank account "${bnkName}" because payments are tagged with it.`,
        entityName: bnkName,
        entityType: 'Bank Account',
        entityId: bankAccountId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          await setBankAccountStatus(bankAccountId, 'Inactive');
          showToast(`Bank account "${bnkName}" marked as Inactive.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteBankAccount(bankAccountId);
    if (res.success) {
      setRawBankAccounts((prev) => prev.filter((b) => b.id !== bankAccountId && (b as any).account_id_code !== bankAccountId));
      showToast(`Bank account "${bnkName}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteBankAccount]', err));
    } else {
      showToast(res.error || 'Failed to delete bank account.', 'error');
    }
    return res;
  };

  const setBankAccountStatus = async (bankAccountId: string, status: BankAccount['status']) => {
    const bnk = getBankAccountById(bankAccountId);
    if (!bnk) return;
    await saveBankAccountAction({ ...bnk, status });
  };

  const saveRoleAction = async (role: EmployeeRole) => {
    if (!role.brand) role.brand = activeBrand;
    if (!role.id) {
      role.id = storageService.generateId('ROL', role.brand, rawRoles);
    }
    const res = await storageService.saveRole(role);
    if (res.success) {
      const savedRole = res.role || role;
      setRawRoles((prev) => {
        const idx = prev.findIndex((r) => r.id === savedRole.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedRole;
          return updated;
        }
        return [savedRole, ...prev];
      });
      showToast(`Role "${role.roleName}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveRole]', err));
    } else {
      showToast(res.error || 'Failed to save role.', 'error');
    }
    return res;
  };

  const deleteRoleAction = async (roleId: string) => {
    const role = getRoleById(roleId);
    const roleName = role?.roleName || roleId;
    const check = storageService.canDeleteRole(roleId, rawEmployees);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Role Assigned to Employees',
        message: `Role "${roleName}" is held by ${check.linkedCount} active employee(s). Reassign them before deleting this role.`,
        entityName: roleName,
        entityType: 'Role',
        entityId: roleId,
        linkedCount: check.linkedCount,
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteRole(roleId);
    if (res.success) {
      setRawRoles((prev) => prev.filter((r) => r.id !== roleId && (r as any).role_id_code !== roleId));
      showToast(`Role "${roleName}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteRole]', err));
    } else {
      showToast(res.error || 'Failed to delete role.', 'error');
    }
    return res;
  };

  const saveEmployeeAction = async (employee: Employee, isUpdate?: boolean) => {
    if (!employee.brand) employee.brand = activeBrand;
    if (!employee.id) {
      employee.id = storageService.generateId('EMP', employee.brand, rawEmployees);
    }
    const updateMode = isUpdate !== undefined ? isUpdate : rawEmployees.some((e) => e.id === employee.id);
    const res = await storageService.saveEmployee(employee, updateMode);
    if (res.success) {
      const savedEmployee = res.employee || employee;
      setRawEmployees((prev) => {
        const idx = prev.findIndex((e) => e.id === savedEmployee.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedEmployee;
          return updated;
        }
        return [savedEmployee, ...prev];
      });
      showToast(`Staff profile for "${employee.name}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveEmployee]', err));
    } else {
      showToast(res.error || 'Failed to save staff profile.', 'error');
    }
    return res;
  };

  const deleteEmployeeAction = async (employeeId: string) => {
    const emp = getEmployeeById(employeeId);
    const empName = emp?.name || employeeId;
    const check = storageService.canDeleteEmployee(employeeId, rawAssignments, rawEmployeePayments);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Staff Member Has Active History',
        message: `Employee "${empName}" has ${check.linkedCount} recorded Project Assignment(s) and/or Payout disbursement(s).`,
        entityName: empName,
        entityType: 'Employee',
        entityId: employeeId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          if (emp) {
            await saveEmployeeAction({ ...emp, status: 'Inactive' });
            showToast(`Employee "${empName}" marked as Inactive in Azure SQL.`, 'info');
            closeReferentialModal();
          }
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteEmployee(employeeId);
    if (res.success) {
      setRawEmployees((prev) => prev.filter((e) => e.id !== employeeId && (e as any).employee_id_code !== employeeId));
      showToast(`Employee "${empName}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteEmployee]', err));
    } else {
      showToast(res.error || 'Failed to delete employee.', 'error');
    }
    return res;
  };

  const saveAssignmentAction = async (assignment: Assignment) => {
    if (!assignment.brand) assignment.brand = activeBrand;
    if (!assignment.id) {
      assignment.id = storageService.generateId('ASN', assignment.brand, rawAssignments);
    }
    const res = await storageService.saveAssignment(assignment);
    if (res.success) {
      const savedAssignment = res.assignment || assignment;
      setRawAssignments((prev) => {
        const idx = prev.findIndex((a) => a.id === savedAssignment.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedAssignment;
          return updated;
        }
        return [savedAssignment, ...prev];
      });
      showToast(`Assignment "${assignment.id}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveAssignment]', err));
    } else {
      showToast(res.error || 'Failed to save assignment.', 'error');
    }
    return res;
  };

  const deleteAssignmentAction = async (assignmentId: string) => {
    const check = storageService.canDeleteAssignment(assignmentId, rawEmployeePayments);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Assignment Has Payout Disbursements',
        message: `Assignment "${assignmentId}" has ${check.linkedCount} payout record(s) logged against it. Delete the payout vouchers first.`,
        entityName: assignmentId,
        entityType: 'Assignment',
        entityId: assignmentId,
        linkedCount: check.linkedCount,
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteAssignment(assignmentId);
    if (res.success) {
      setRawAssignments((prev) => prev.filter((a) => a.id !== assignmentId && (a as any).assignment_id_code !== assignmentId));
      showToast(`Assignment "${assignmentId}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteAssignment]', err));
    } else {
      showToast(res.error || 'Failed to delete assignment.', 'error');
    }
    return res;
  };

  const saveEmployeePaymentAction = async (payment: EmployeePayment) => {
    if (!payment.brand) payment.brand = activeBrand;
    if (!payment.id) {
      payment.id = storageService.generateId('EPAY', payment.brand, rawEmployeePayments);
    }
    const res = await storageService.saveEmployeePayment(payment);
    if (res.success) {
      const savedPayment = res.payment || payment;
      setRawEmployeePayments((prev) => {
        const idx = prev.findIndex((p) => p.id === savedPayment.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedPayment;
          return updated;
        }
        return [savedPayment, ...prev];
      });
      showToast(`Staff payout "${payment.id}" recorded in Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveEmployeePayment]', err));
    } else {
      showToast(res.error || 'Failed to record payout.', 'error');
    }
    return res;
  };

  const deleteEmployeePaymentAction = async (paymentId: string) => {
    const res = await storageService.deleteEmployeePayment(paymentId);
    if (res.success) {
      setRawEmployeePayments((prev) => prev.filter((p) => p.id !== paymentId && (p as any).payment_id_code !== paymentId));
      showToast(`Payout "${paymentId}" removed from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteEmployeePayment]', err));
    } else {
      showToast(res.error || 'Failed to remove payout.', 'error');
    }
    return res;
  };

  const saveExpenseCategoryAction = async (category: ExpenseCategory) => {
    if (!category.brand) category.brand = activeBrand;
    if (!category.id) {
      category.id = storageService.generateId('EXC', category.brand, rawExpenseCategories);
    }
    const res = await storageService.saveExpenseCategory(category);
    if (res.success) {
      const savedCat = res.category || category;
      setRawExpenseCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === savedCat.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedCat;
          return updated;
        }
        return [savedCat, ...prev];
      });
      showToast(`Expense category "${category.name}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveExpenseCategory]', err));
    } else {
      showToast(res.error || 'Failed to save expense category.', 'error');
    }
    return res;
  };

  const deleteExpenseCategoryAction = async (categoryId: string) => {
    const cat = getExpenseCategoryById(categoryId);
    const catName = cat?.name || categoryId;
    const check = storageService.canDeleteExpenseCategory(categoryId, rawExpenses);

    if (!check.allowed) {
      openReferentialBlock({
        title: 'Referential Integrity Block: Expense Category In Use',
        message: `Category "${catName}" has ${check.linkedCount} expense voucher(s) recorded in Azure SQL.`,
        entityName: catName,
        entityType: 'Expense Category',
        entityId: categoryId,
        linkedCount: check.linkedCount,
        onSetInactive: async () => {
          await setExpenseCategoryStatus(categoryId, 'Inactive');
          showToast(`Expense Category "${catName}" marked as Inactive in Azure SQL.`, 'info');
          closeReferentialModal();
        },
      });
      return { success: false, error: check.reason };
    }

    const res = await storageService.deleteExpenseCategory(categoryId);
    if (res.success) {
      setRawExpenseCategories((prev) => prev.filter((c) => c.id !== categoryId && (c as any).category_id_code !== categoryId));
      showToast(`Expense category "${catName}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteExpenseCategory]', err));
    } else {
      showToast(res.error || 'Failed to delete expense category.', 'error');
    }
    return res;
  };

  const setExpenseCategoryStatus = async (categoryId: string, status: ExpenseCategoryStatus) => {
    const cat = getExpenseCategoryById(categoryId);
    if (!cat) return;
    await saveExpenseCategoryAction({ ...cat, status });
  };

  const saveExpenseAction = async (expense: Expense) => {
    if (!expense.brand) expense.brand = activeBrand;
    if (!expense.id) {
      expense.id = storageService.generateId('EXP', expense.brand, rawExpenses);
    }
    const res = await storageService.saveExpense(expense);
    if (res.success) {
      const savedExpense = res.expense || expense;
      setRawExpenses((prev) => {
        const idx = prev.findIndex((e) => e.id === savedExpense.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedExpense;
          return updated;
        }
        return [savedExpense, ...prev];
      });
      showToast(`Expense "${expense.id}" recorded in Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveExpense]', err));
    } else {
      showToast(res.error || 'Failed to save expense.', 'error');
    }
    return res;
  };

  const deleteExpenseAction = async (expenseId: string) => {
    const res = await storageService.deleteExpense(expenseId);
    if (res.success) {
      setRawExpenses((prev) => prev.filter((e) => e.id !== expenseId && (e as any).expense_id_code !== expenseId));
      showToast(`Expense "${expenseId}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteExpense]', err));
    } else {
      showToast(res.error || 'Failed to delete expense.', 'error');
    }
    return res;
  };

  const saveGstInvoiceAction = async (invoice: GstInvoice) => {
    if (!invoice.brand) invoice.brand = activeBrand;
    if (!invoice.id) {
      invoice.id = storageService.generateId('GST', invoice.brand, rawGstInvoices);
    }
    const res = await storageService.saveGstInvoice(invoice);
    if (res.success) {
      const savedInv = res.invoice || invoice;
      setRawGstInvoices((prev) => {
        const idx = prev.findIndex((g) => g.id === savedInv.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = savedInv;
          return updated;
        }
        return [savedInv, ...prev];
      });
      showToast(`GST Invoice "${invoice.id}" saved to Azure SQL.`, 'success');
      loadAll().catch((err) => console.warn('[Background refresh after saveGstInvoice]', err));
    } else {
      showToast(res.error || 'Failed to save GST invoice.', 'error');
    }
    return res;
  };

  const deleteGstInvoiceAction = async (invoiceId: string) => {
    const res = await storageService.deleteGstInvoice(invoiceId);
    if (res.success) {
      setRawGstInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId && (inv as any).invoice_id_code !== invoiceId));
      showToast(`GST Invoice "${invoiceId}" deleted from Azure SQL.`, 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteGstInvoice]', err));
    } else {
      showToast(res.error || 'Failed to delete GST invoice.', 'error');
    }
    return res;
  };

  const refreshGstInvoicesAction = async (): Promise<GstInvoice[]> => {
    try {
      const invoices = await storageService.fetchGstInvoices();
      if (Array.isArray(invoices)) {
        setRawGstInvoices(invoices);
      }
      return invoices;
    } catch (err) {
      console.warn('[refreshGstInvoicesAction] Error fetching GST invoices:', err);
      return rawGstInvoices;
    }
  };

  const syncGstInvoicesFromPaymentsAction = async (): Promise<{
    success: boolean;
    count: number;
    error?: string;
  }> => {
    try {
      const res = await storageService.syncGstInvoicesFromPayments();
      if (res.success) {
        if (Array.isArray(res.invoices)) {
          setRawGstInvoices(res.invoices);
        }
        showToast(
          `Successfully synchronized ${res.count} GST Invoice record(s) from Payments module.`,
          'success'
        );
        return { success: true, count: res.count };
      } else {
        showToast(res.error || 'Failed to sync GST invoices.', 'error');
        return { success: false, count: 0, error: res.error };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Sync error: ${msg}`, 'error');
      return { success: false, count: 0, error: msg };
    }
  };

  const saveUserAction = async (user: AppUser) => {
    if (!user.brand) user.brand = activeBrand;
    if (!user.id) {
      user.id = storageService.generateId('USR', 'Device Doctor India', rawUsers as any);
    }
    const res = await storageService.saveAppUser(user);
    if (res.success) {
      showToast(`User account for "${user.name}" saved to Azure SQL.`, 'success');
      await loadAll();
    } else {
      showToast(res.error || 'Failed to save user account.', 'error');
    }
    return res;
  };

  const deleteUserAction = async (userId: string) => {
    const res = await storageService.deleteAppUser(userId);
    if (res.success) {
      setRawUsers((prev) => prev.filter((u) => u.id !== userId && (u as any).user_id_code !== userId && (u as any).adminId !== userId));
      showToast('User account deleted from Azure SQL.', 'info');
      loadAll().catch((err) => console.warn('[Background refresh after deleteUser]', err));
    } else {
      showToast(res.error || 'Failed to delete user account.', 'error');
    }
    return res;
  };

  const updateCredentialsAction = async (data: {
    id?: string;
    adminId?: string;
    email?: string;
    name?: string;
    currentPassword?: string;
    newPassword?: string;
    password?: string;
    role?: string;
    brand?: string;
  }) => {
    const res = await storageService.updateCredentials(data);
    if (res.success) {
      if (res.user) {
        setAuthUserState(res.user);
      }
      showToast(res.message || 'Credentials successfully updated in Azure SQL.', 'success');
      await loadAll();
      return { success: true, message: res.message };
    }
    showToast(res.error || 'Failed to update credentials in Azure SQL.', 'error');
    return { success: false, error: res.error };
  };

  const openAddProjectModal = () => {
    setIsProjectModalEditing(false);
    const today = new Date().toISOString().split('T')[0];
    const committedDays = 30;
    const end = new Date();
    end.setDate(end.getDate() + committedDays);
    const endDate = end.toISOString().split('T')[0];
    const currency = 'INR';
    const contract = 100000;
    const rate = 1;

    // Filter clients and services for active brand context
    const brandClients = isConsolidatedView
      ? rawClients
      : rawClients.filter((c) => (c.brand || 'Device Doctor India') === activeBrand);
    const defaultClient = brandClients.length > 0 ? brandClients[0] : null;

    const brandServices = isConsolidatedView
      ? rawServices
      : rawServices.filter((s) => (s.brand || 'Device Doctor India') === activeBrand);
    const defaultService = brandServices.length > 0 ? brandServices[0] : null;

    const clientId = defaultClient ? defaultClient.id : '';
    const clientName = defaultClient ? (defaultClient.name || defaultClient.client_name || '') : '';
    const serviceId = defaultService ? defaultService.id : '';

    setProjectModalData({
      brand: activeBrand,
      clientId,
      clientName,
      serviceId,
      proposalDate: today,
      contractDate: today,
      startDate: today,
      committedDays,
      committedEndDate: endDate,
      actualEndDate: '',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: defaultClient?.preferredCurrency || currency,
      contract,
      exchangeRate: rate,
      contractValue: Math.round(contract * rate),
      projectManager: '',
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

  return (
    <CrmContext.Provider
      value={{
        activeModule,
        setActiveModule,
        activeBrand,
        setActiveBrand,
        brandPrefix,
        brandMeta,
        isConsolidatedView,
        setIsConsolidatedView,
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
        bankAccounts,
        allProjects: rawProjects,
        allPayments: rawPayments,
        allClients: rawClients,
        activeReportsTab,
        setActiveReportsTab,
        roles,
        employees,
        assignments,
        employeePayments,
        expenseCategories,
        expenses,
        gstInvoices,
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
        getGstInvoiceById,
        getGstInvoiceByPaymentId,
        getBankAccountById,
        getProjectExpenses,
        getProjectExpensesTotalINR,
        getCategoryServicesCount,
        getClientProjectsCount,
        getServiceProjectsCount,
        getRoleEmployeesCount,
        saveClient: saveClientAction,
        deleteClient: deleteClientAction,
        setClientStatus,
        saveCategory: saveCategoryAction,
        deleteCategory: deleteCategoryAction,
        setCategoryStatus,
        saveService: saveServiceAction,
        deleteService: deleteServiceAction,
        setServiceStatus,
        saveProject: saveProjectAction,
        deleteProject: deleteProjectAction,
        setProjectStatus,
        savePayment: savePaymentAction,
        deletePayment: deletePaymentAction,
        saveBankAccount: saveBankAccountAction,
        deleteBankAccount: deleteBankAccountAction,
        setBankAccountStatus,
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
        setExpenseCategoryStatus,
        saveExpense: saveExpenseAction,
        deleteExpense: deleteExpenseAction,
        saveGstInvoice: saveGstInvoiceAction,
        deleteGstInvoice: deleteGstInvoiceAction,
        refreshGstInvoices: refreshGstInvoicesAction,
        syncGstInvoicesFromPayments: syncGstInvoicesFromPaymentsAction,
        users,
        saveUser: saveUserAction,
        deleteUser: deleteUserAction,
        updateCredentials: updateCredentialsAction,
        hasPermission,
        databaseStatus,
        refreshDatabaseStatus,
        syncWithDatabase,
        clearDemoData,
        referentialModal,
        closeReferentialModal,
        openReferentialBlock,
        deleteConfirmModal,
        confirmDelete,
        closeDeleteConfirm,
        isProjectModalOpen,
        isProjectModalEditing,
        projectModalData,
        openAddProjectModal,
        openEditProjectModal,
        closeProjectModal,
        isWorkspaceModalOpen,
        isWorkspaceMandatory,
        hasConfirmedWorkspace,
        openWorkspaceModal,
        closeWorkspaceModal,
        selectBrandWorkspace,
        toasts,
        showToast,
        removeToast,
        refreshData: loadAll,
      }}
    >
      {children}
    </CrmContext.Provider>
  );
};

export const useCrm = (): CrmContextType => {
  const context = useContext(CrmContext);
  if (!context) {
    throw new Error('useCrm must be used within a CrmProvider');
  }
  return context;
};
