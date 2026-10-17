import {
  Client,
  ServiceCategory,
  Service,
  Project,
  Payment,
  PaymentMode,
  GstInvoice,
  EmployeeRole,
  Employee,
  Assignment,
  EmployeePayment,
  ExpenseCategory,
  Expense,
  AppUser,
  AuthUser,
  BrandName,
  getBrandPrefix,
} from '../types/crm';

export interface DatabaseStatus {
  connected: boolean;
  server: string;
  database: string;
  authType: string;
  user: string;
  error?: string | null;
  timestamp: string;
  tables?: Record<string, number>;
}

// Local storage is ONLY retained for local client UI preferences (active brand, theme, and current session user)
const PREFERENCE_KEYS = {
  ACTIVE_BRAND: 'ddi_crm_active_brand',
  THEME: 'ddi_crm_theme',
  AUTH_USER: 'ddi_crm_auth_user',
};

export const normalizePaymentMode = (mode: unknown): PaymentMode => {
  if (mode === 'GST Invoice' || mode === 'Non GST Online' || mode === 'Cash' || mode === 'Crypto') {
    return mode;
  }
  if (mode === 'UPI' || mode === 'Card') {
    return 'Non GST Online';
  }
  if (mode === 'Cash') {
    return 'Cash';
  }
  if (mode === 'Crypto') {
    return 'Crypto';
  }
  return 'GST Invoice';
};

class StorageService {
  private notifyListeners() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ddi_crm_store_updated'));
    }
  }

  // --- Initializer (UI Preferences Only - Zero Mock Seeding) ---
  public init() {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(PREFERENCE_KEYS.ACTIVE_BRAND)) {
      localStorage.setItem(PREFERENCE_KEYS.ACTIVE_BRAND, 'Device Doctor India');
    }
    if (!localStorage.getItem(PREFERENCE_KEYS.THEME)) {
      localStorage.setItem(PREFERENCE_KEYS.THEME, 'light');
    }
  }

  // --- Strict Live API Call Helper ---
  public async apiCall<T = any>(url: string, method: string = 'GET', body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg = data?.error || data?.message || `HTTP ${res.status}: Request to ${url} failed.`;
      throw new Error(errMsg);
    }

    return data as T;
  }

  // --- Live Azure SQL Database Diagnostics & Actions ---
  public async getDatabaseStatus(): Promise<DatabaseStatus> {
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        return {
          connected: data.connected ?? false,
          server: data.server || 'ddrcm.database.windows.net',
          database: data.database || 'DDCRM',
          authType: data.authType || 'SQL Server Authentication (Native)',
          user: data.user || 'CloudSA995f9e29',
          error: data.error,
          timestamp: data.lastChecked || new Date().toISOString(),
          tables: data.tableCounts || {},
        };
      }
    } catch {
      // Ignored
    }
    return {
      connected: false,
      server: 'ddrcm.database.windows.net',
      database: 'DDCRM',
      authType: 'SQL Server Authentication (Native)',
      user: 'CloudSA995f9e29',
      error: 'Connecting to Azure SQL Database...',
      timestamp: new Date().toISOString(),
      tables: {},
    };
  }

  public async reconnectDatabase(): Promise<DatabaseStatus> {
    try {
      const res = await this.apiCall<{ success: boolean; status: DatabaseStatus }>('/api/db/reconnect', 'POST');
      return res.status;
    } catch {
      return this.getDatabaseStatus();
    }
  }

  public async clearDemoData(): Promise<{ success: boolean; message: string; remainingUsers?: AppUser[]; error?: string }> {
    const res = await this.apiCall<{ success: boolean; message: string; remainingUsers?: AppUser[]; error?: string }>('/api/db/clear-demo', 'POST');
    this.notifyListeners();
    return res;
  }

  // --- Live Azure SQL Authentication ---
  public async login(email: string, pass: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; user: AuthUser }>('/api/auth/login', 'POST', {
        email,
        password: pass,
      });
      if (res.success && res.user) {
        this.setAuthUser(res.user);
        return { success: true, user: res.user };
      }
      return { success: false, error: 'Login verification failed.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // --- Strict Live Entity Queries (Direct from Azure SQL) ---
  public async fetchClients(): Promise<Client[]> {
    return this.apiCall<Client[]>('/api/clients');
  }

  public async saveClient(client: Client): Promise<{ success: boolean; client?: Client; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; client: Client }>('/api/clients', 'POST', client);
      this.notifyListeners();
      return { success: true, client: res.client };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteClient(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/clients/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchCategories(): Promise<ServiceCategory[]> {
    return this.apiCall<ServiceCategory[]>('/api/categories');
  }

  public async saveCategory(cat: ServiceCategory): Promise<{ success: boolean; category?: ServiceCategory; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; category: ServiceCategory }>('/api/categories', 'POST', cat);
      this.notifyListeners();
      return { success: true, category: res.category };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/categories/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchServices(): Promise<Service[]> {
    return this.apiCall<Service[]>('/api/services');
  }

  public async saveService(srv: Service): Promise<{ success: boolean; service?: Service; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; service: Service }>('/api/services', 'POST', srv);
      this.notifyListeners();
      return { success: true, service: res.service };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteService(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/services/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchProjects(): Promise<Project[]> {
    return this.apiCall<Project[]>('/api/projects');
  }

  public async saveProject(proj: Project): Promise<{ success: boolean; project?: Project; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; project: Project }>('/api/projects', 'POST', proj);
      this.notifyListeners();
      return { success: true, project: res.project };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/projects/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchPayments(): Promise<Payment[]> {
    return this.apiCall<Payment[]>('/api/payments');
  }

  public async savePayment(payment: Payment): Promise<{ success: boolean; payment?: Payment; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; payment: Payment }>('/api/payments', 'POST', payment);
      this.notifyListeners();
      return { success: true, payment: res.payment };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deletePayment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/payments/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchGstInvoices(): Promise<GstInvoice[]> {
    return this.apiCall<GstInvoice[]>('/api/gst-invoices');
  }

  public async saveGstInvoice(inv: GstInvoice): Promise<{ success: boolean; invoice?: GstInvoice; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; invoice: GstInvoice }>('/api/gst-invoices', 'POST', inv);
      this.notifyListeners();
      return { success: true, invoice: res.invoice };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteGstInvoice(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/gst-invoices/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchRoles(): Promise<EmployeeRole[]> {
    return this.apiCall<EmployeeRole[]>('/api/roles');
  }

  public async saveRole(role: EmployeeRole): Promise<{ success: boolean; role?: EmployeeRole; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; role: EmployeeRole }>('/api/roles', 'POST', role);
      this.notifyListeners();
      return { success: true, role: res.role };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteRole(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/roles/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchEmployees(): Promise<Employee[]> {
    return this.apiCall<Employee[]>('/api/employees');
  }

  public async saveEmployee(emp: Employee): Promise<{ success: boolean; employee?: Employee; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; employee: Employee }>('/api/employees', 'POST', emp);
      this.notifyListeners();
      return { success: true, employee: res.employee };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteEmployee(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/employees/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchAssignments(): Promise<Assignment[]> {
    return this.apiCall<Assignment[]>('/api/assignments');
  }

  public async saveAssignment(asn: Assignment): Promise<{ success: boolean; assignment?: Assignment; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; assignment: Assignment }>('/api/assignments', 'POST', asn);
      this.notifyListeners();
      return { success: true, assignment: res.assignment };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteAssignment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/assignments/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchEmployeePayments(): Promise<EmployeePayment[]> {
    return this.apiCall<EmployeePayment[]>('/api/employee-payments');
  }

  public async saveEmployeePayment(epay: EmployeePayment): Promise<{ success: boolean; payment?: EmployeePayment; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; payment: EmployeePayment }>('/api/employee-payments', 'POST', epay);
      this.notifyListeners();
      return { success: true, payment: res.payment };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteEmployeePayment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/employee-payments/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchExpenseCategories(): Promise<ExpenseCategory[]> {
    return this.apiCall<ExpenseCategory[]>('/api/expense-categories');
  }

  public async saveExpenseCategory(cat: ExpenseCategory): Promise<{ success: boolean; category?: ExpenseCategory; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; category: ExpenseCategory }>('/api/expense-categories', 'POST', cat);
      this.notifyListeners();
      return { success: true, category: res.category };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteExpenseCategory(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/expense-categories/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchExpenses(): Promise<Expense[]> {
    return this.apiCall<Expense[]>('/api/expenses');
  }

  public async saveExpense(exp: Expense): Promise<{ success: boolean; expense?: Expense; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; expense: Expense }>('/api/expenses', 'POST', exp);
      this.notifyListeners();
      return { success: true, expense: res.expense };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/expenses/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchAppUsers(): Promise<AppUser[]> {
    return this.apiCall<AppUser[]>('/api/users');
  }

  public async saveAppUser(user: AppUser): Promise<{ success: boolean; user?: AppUser; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; user: AppUser }>('/api/users', 'POST', user);
      this.notifyListeners();
      return { success: true, user: res.user };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteAppUser(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/users/${id}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // --- Dynamic Brand-Aware ID Generation ---
  public generateId(type: string, brand: BrandName, existingItems: Array<{ id: string; brand?: BrandName }> = []): string {
    const prefix = getBrandPrefix(brand);
    const cleanType = type.replace(/^(DDI|CDS|FXL)-/, '');

    const brandItems = existingItems.filter(
      (item) => item.brand === brand || (item.id && item.id.startsWith(prefix))
    );

    const numbers = brandItems.map((item) => {
      const parts = (item.id || '').split('-');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      return isNaN(num) ? 0 : num;
    });

    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = max + 1;
    return `${prefix}-${cleanType}-${String(nextNum).padStart(3, '0')}`;
  }

  // --- Smart Dynamic Project ID Generator ---
  public generateSmartProjectId(
    clientName: string,
    serviceName: string,
    clientId?: string,
    serviceId?: string,
    currentProjectId?: string,
    brand?: BrandName,
    existingProjects: Project[] = []
  ): string {
    const currentBrand = brand || this.getActiveBrand();
    const prefix = getBrandPrefix(currentBrand);
    const cleanClient = (clientName || 'CLIENT').trim().toUpperCase();
    const cleanService = (serviceName || 'SERVICE').trim().toUpperCase();

    const matchingProjects = existingProjects.filter((p) => {
      if (currentProjectId && p.id === currentProjectId) return false;
      const matchById = clientId && serviceId && p.clientId === clientId && p.serviceId === serviceId;
      const matchByPattern = p.id.startsWith(`${prefix} - ${cleanClient} - ${cleanService} - `);
      return matchById || matchByPattern;
    });

    let maxSeq = 0;
    for (const p of matchingProjects) {
      const parts = p.id.split(' - ');
      const lastPart = parts[parts.length - 1];
      const parsed = parseInt(lastPart, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }

    const nextSeq = maxSeq > 0 ? maxSeq + 1 : matchingProjects.length + 1;
    return `${prefix} - ${cleanClient} - ${cleanService} - ${nextSeq}`;
  }

  // --- Referential Integrity Checking Helpers ---
  public canDeleteClient(clientId: string, projects: Project[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linkedProjects = projects.filter((p) => p.clientId === clientId);
    if (linkedProjects.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete client because they have ${linkedProjects.length} linked Project record(s) in Azure SQL. Mark client as Inactive instead to preserve historical records.`,
        linkedCount: linkedProjects.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteCategory(categoryId: string, services: Service[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linkedServices = services.filter((s) => s.categoryId === categoryId);
    if (linkedServices.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete category because it contains ${linkedServices.length} linked Service item(s). Reassign or delete those services first.`,
        linkedCount: linkedServices.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteService(serviceId: string, projects: Project[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linkedProjects = projects.filter((p) => p.serviceId === serviceId);
    if (linkedProjects.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete service because it is referenced in ${linkedProjects.length} active Project(s). Mark service as Inactive instead.`,
        linkedCount: linkedProjects.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteRole(roleId: string, employees: Employee[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linked = employees.filter((e) => e.roleId === roleId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete role because ${linked.length} employee(s) hold this role. Reassign employees before deletion.`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteEmployee(employeeId: string, assignments: Assignment[], employeePayments: EmployeePayment[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linkedAssignments = assignments.filter((a) => a.employeeId === employeeId);
    const linkedPayments = employeePayments.filter((p) => p.employeeId === employeeId);
    const totalLinked = linkedAssignments.length + linkedPayments.length;
    if (totalLinked > 0) {
      return {
        allowed: false,
        reason: `Cannot delete employee because they have ${linkedAssignments.length} Assignment(s) and ${linkedPayments.length} Payout record(s). Mark employee as Inactive instead.`,
        linkedCount: totalLinked,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteAssignment(assignmentId: string, employeePayments: EmployeePayment[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linkedPayments = employeePayments.filter((p) => p.assignmentId === assignmentId);
    if (linkedPayments.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete assignment because ${linkedPayments.length} payout(s) have been disbursed against it. Delete the payout records first.`,
        linkedCount: linkedPayments.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteExpenseCategory(categoryId: string, expenses: Expense[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linked = expenses.filter((e) => e.expenseCategoryId === categoryId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete expense category because ${linked.length} expense voucher(s) reference it.`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public canDeleteProject(
    projectId: string,
    payments: Payment[],
    assignments: Assignment[],
    expenses: Expense[],
    gstInvoices: GstInvoice[]
  ): { allowed: boolean; reason?: string; linkedCount: number } {
    const linkedPayments = payments.filter((p) => p.projectId === projectId);
    const linkedAssignments = assignments.filter((a) => a.projectId === projectId);
    const linkedExpenses = expenses.filter((e) => e.projectId === projectId);
    const linkedInvoices = gstInvoices.filter((g) => g.projectId === projectId);

    const total = linkedPayments.length + linkedAssignments.length + linkedExpenses.length + linkedInvoices.length;
    if (total > 0) {
      return {
        allowed: false,
        reason: `Cannot delete project because it has ${linkedPayments.length} Payment(s), ${linkedAssignments.length} Assignment(s), ${linkedExpenses.length} Expense(s), and ${linkedInvoices.length} GST Invoice(s) recorded in Azure SQL. Mark project as Cancelled or Completed instead.`,
        linkedCount: total,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  // --- UI Preferences (Session & Theme Only) ---
  public getActiveBrand(): BrandName {
    if (typeof window === 'undefined') return 'Device Doctor India';
    const val = localStorage.getItem(PREFERENCE_KEYS.ACTIVE_BRAND);
    if (val === 'Codestro' || val === 'FX Launch Pad') return val;
    return 'Device Doctor India';
  }

  public setActiveBrand(brand: BrandName) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREFERENCE_KEYS.ACTIVE_BRAND, brand);
    this.notifyListeners();
  }

  public getTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    const val = localStorage.getItem(PREFERENCE_KEYS.THEME);
    return val === 'dark' ? 'dark' : 'light';
  }

  public setTheme(theme: 'light' | 'dark') {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREFERENCE_KEYS.THEME, theme);
  }

  public getAuthUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PREFERENCE_KEYS.AUTH_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public setAuthUser(user: AuthUser | null) {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(PREFERENCE_KEYS.AUTH_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(PREFERENCE_KEYS.AUTH_USER);
    }
  }
}

export const storageService = new StorageService();
