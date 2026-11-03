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
  BankAccount,
  PaymentProofDocument,
  getBrandPrefix,
} from '../types/crm';

export interface DatabaseStatus {
  connected: boolean;
  isMock?: boolean;
  server?: string;
  database?: string;
  authType?: string;
  user?: string;
  error?: string | null;
  timestamp: string;
  tables?: Record<string, number>;
}

// Local storage is ONLY retained for local client UI preferences (active brand, theme, and current session user)
const PREFERENCE_KEYS = {
  ACTIVE_BRAND: 'ddi_crm_active_brand',
  THEME: 'ddi_crm_theme',
  AUTH_USER: 'ddi_crm_auth_user',
  AUTH_TOKEN: 'ddi_crm_auth_token',
  CONSOLIDATED: 'ddi_crm_is_consolidated',
  WORKSPACE_CONFIRMED: 'ddi_crm_workspace_confirmed_session',
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

export type VerifySessionResult =
  | { status: 'valid'; user: AuthUser }
  | { status: 'invalid'; error?: string }
  | { status: 'unavailable'; error: string };

// --- Stale Read Error for Concurrent Mutation Invalidation ---
export class StaleReadError extends Error {
  public readonly isStaleRead = true;
  public readonly resource: string;

  constructor(resource: string, message?: string) {
    super(message || `Stale read rejected for resource "${resource}": A mutation was in-flight or completed during read.`);
    this.name = 'StaleReadError';
    this.resource = resource;
    Object.setPrototypeOf(this, StaleReadError.prototype);
  }
}

export const KNOWN_RESOURCE_MAP: Record<string, string> = {
  projects: 'projects',
  clients: 'clients',
  services: 'services',
  categories: 'categories',
  employees: 'employees',
  roles: 'roles',
  assignments: 'assignments',
  expenses: 'expenses',
  'expense-categories': 'expenseCategories',
  expensecategories: 'expenseCategories',
  payments: 'payments',
  'upload-proof': 'payments',
  uploadproof: 'payments',
  'bank-accounts': 'bankAccounts',
  bankaccounts: 'bankAccounts',
  'employee-payments': 'employeePayments',
  employeepayments: 'employeePayments',
  'gst-invoices': 'gstInvoices',
  gstinvoices: 'gstInvoices',
  users: 'users',
  auth: 'auth',
  db: 'db',
};

export function extractResourceKey(url: string): string {
  const trimmed = url.trim().toLowerCase().split('?')[0];
  let pathname = trimmed;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      pathname = new URL(trimmed).pathname;
    }
  } catch {
    // fallback
  }
  const segments = pathname.split('/').filter(Boolean);
  const rawKey = segments[0] === 'api' && segments[1] ? segments[1] : segments[0];

  if (rawKey && KNOWN_RESOURCE_MAP[rawKey]) {
    return KNOWN_RESOURCE_MAP[rawKey];
  }
  return 'global';
}

export function normalizeUrlForDedup(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname.toLowerCase();
      const normPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      return `${parsed.origin.toLowerCase()}${normPath}${parsed.search}`;
    }
  } catch {
    // fallback
  }

  const qIndex = trimmed.indexOf('?');
  if (qIndex === -1) {
    const path = trimmed.toLowerCase();
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  }
  const path = trimmed.substring(0, qIndex).toLowerCase();
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const queryString = trimmed.substring(qIndex);
  return `${normalizedPath}${queryString}`;
}

export function getAffectedResources(url: string): string[] {
  const primary = extractResourceKey(url);
  if (primary === 'global' || primary === '*' || primary === 'db' || url.includes('/clear-demo')) {
    return ['*'];
  }
  if (primary === 'payments') {
    return ['payments', 'projects', 'gstInvoices'];
  }
  return [primary];
}

export interface InFlightGetEntry<T = any> {
  promise: Promise<T>;
  abortController: AbortController;
  resourceKey: string;
  startVersion: number;
  sessionToken: string;
}

// --- Async Concurrency Limiter (Strict Maximum 3 Active Requests) ---
export class AsyncConcurrencyLimiter {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number = 3) {}

  public async acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve();
      });
    });
  }

  public release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getMaxConcurrent(): number {
    return this.maxConcurrent;
  }
}

class StorageService {
  private limiter = new AsyncConcurrencyLimiter(3);
  private inFlightGetRequests = new Map<string, InFlightGetEntry>();
  private mutationVersion = 0;
  private resourceVersions = new Map<string, number>();
  private activeMutationsCount = new Map<string, number>();

  public getLimiter(): AsyncConcurrencyLimiter {
    return this.limiter;
  }

  public getMutationVersion(): number {
    return this.mutationVersion;
  }

  public getResourceVersion(resource: string): number {
    return this.resourceVersions.get(resource) || 0;
  }

  public hasActiveMutation(resource: string): boolean {
    if ((this.activeMutationsCount.get('*') || 0) > 0) return true;
    return (this.activeMutationsCount.get(resource) || 0) > 0;
  }

  public isStaleRead(
    resource: string,
    startResourceVersion: number,
    startGlobalVersion: number,
    hadActiveMutationAtStart: boolean
  ): boolean {
    if (hadActiveMutationAtStart) return true;
    if (this.hasActiveMutation(resource)) return true;
    if (this.getResourceVersion(resource) !== startResourceVersion) return true;
    if (this.hasActiveMutation('*')) return true;
    if (this.getResourceVersion('*') !== startGlobalVersion) return true;
    return false;
  }

  public startActiveMutation(resources: string[]) {
    this.mutationVersion++;
    for (const r of resources) {
      this.activeMutationsCount.set(r, (this.activeMutationsCount.get(r) || 0) + 1);
      this.resourceVersions.set(r, (this.resourceVersions.get(r) || 0) + 1);
    }
  }

  public finishActiveMutation(resources: string[]) {
    this.mutationVersion++;
    for (const r of resources) {
      const count = (this.activeMutationsCount.get(r) || 1) - 1;
      if (count <= 0) {
        this.activeMutationsCount.delete(r);
      } else {
        this.activeMutationsCount.set(r, count);
      }
      this.resourceVersions.set(r, (this.resourceVersions.get(r) || 0) + 1);
    }
  }

  public getInFlightGetCount(): number {
    return this.inFlightGetRequests.size;
  }

  public getInFlightGetEntry(key: string): InFlightGetEntry | undefined {
    return this.inFlightGetRequests.get(key);
  }

  public getDedupKey(url: string, method: string = 'GET'): string {
    const upperMethod = method.toUpperCase();
    const isConsolidated = this.getIsConsolidated();
    const activeBrand = isConsolidated ? 'All' : this.getActiveBrand();
    const normalizedUrl = normalizeUrlForDedup(url);
    const sessionToken = this.getAuthToken() || 'anon';
    return `${upperMethod}:${sessionToken}:${normalizedUrl}:${activeBrand}`;
  }

  public abortInFlightGetRequestsForSessionChange(oldSessionToken?: string) {
    for (const [key, entry] of this.inFlightGetRequests.entries()) {
      if (!oldSessionToken || entry.sessionToken === oldSessionToken || entry.sessionToken !== (this.getAuthToken() || 'anon')) {
        entry.abortController.abort();
        if (this.inFlightGetRequests.get(key) === entry)
          this.inFlightGetRequests.delete(key);
      }
    }
  }

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

  // --- Strict Live API Call Helper with Concurrency Control, In-Flight GET Deduplication & Stale-Read Invalidation ---
  public async apiCall<T = any>(
    url: string,
    method: string = 'GET',
    body?: unknown,
    customHeaders?: Record<string, string>
  ): Promise<T> {
    const upperMethod = method.toUpperCase();
    const isConsolidated = this.getIsConsolidated();
    const activeBrand = isConsolidated ? 'All' : this.getActiveBrand();
    const normalizedUrl = normalizeUrlForDedup(url);
    const resourceKey = extractResourceKey(url);

    // 1. In-flight GET deduplication before acquiring limiter slot
    if (upperMethod === 'GET') {
      const dedupKey = this.getDedupKey(url, upperMethod);
      const existing = this.inFlightGetRequests.get(dedupKey);
      if (existing) {
        return existing.promise as Promise<T>;
      }

      const abortController = new AbortController();
      const startResourceVersion = this.getResourceVersion(resourceKey);
      const startGlobalVersion = this.getResourceVersion('*');
      const hadActiveMutationAtStart = this.hasActiveMutation(resourceKey);

      const getPromise = (async () => {
        return await this.limiter.run(async () => {
          if (abortController.signal.aborted) {
            throw new StaleReadError(resourceKey, `GET request for "${resourceKey}" was canceled due to a subsequent mutation.`);
          }

          const data = await this.executeFetch<T>(
            url,
            upperMethod,
            body,
            customHeaders,
            activeBrand,
            abortController.signal
          );

          // Stale Read Validation: Validate that no mutation occurred or was active during this GET request
          if (this.isStaleRead(resourceKey, startResourceVersion, startGlobalVersion, hadActiveMutationAtStart)) {
            throw new StaleReadError(
              resourceKey,
              `Stale read rejected for "${resourceKey}": A mutation was active or completed during the request.`
            );
          }

          return data;
        });
      })();

      const entry: InFlightGetEntry<T> = {
        promise: getPromise,
        abortController,
        resourceKey,
        startVersion: startResourceVersion,
        sessionToken: this.getAuthToken() || 'anon',
      };

      this.inFlightGetRequests.set(dedupKey, entry);
      try {
        return await getPromise;
      } catch (err: any) {
        if (err?.status === 401 || err?.status === 403) {
          throw err;
        }
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          throw new StaleReadError(resourceKey, `GET request for "${resourceKey}" was canceled due to a concurrent mutation.`);
        }
        throw err;
      } finally {
        if (this.inFlightGetRequests.get(dedupKey) === entry) {
          this.inFlightGetRequests.delete(dedupKey);
        }
      }
    }

    // 2. Mutations (POST, PUT, DELETE): NEVER deduplicated!
    const affectedResources = getAffectedResources(url);

    // Cancel and remove running in-flight GET requests for affected resources
    for (const [key, entry] of this.inFlightGetRequests.entries()) {
      if (affectedResources.includes('*') || affectedResources.includes(entry.resourceKey)) {
        entry.abortController.abort();
        if (this.inFlightGetRequests.get(key) === entry) {
          this.inFlightGetRequests.delete(key);
        }
      }
    }

    this.startActiveMutation(affectedResources);

    try {
      return await this.limiter.run(async () => {
        return await this.executeFetch<T>(url, upperMethod, body, customHeaders, activeBrand);
      });
    } finally {
      this.finishActiveMutation(affectedResources);
    }
  }

  private async executeFetch<T>(
    url: string,
    method: string,
    body: unknown,
    customHeaders: Record<string, string> | undefined,
    activeBrand: string,
    signal?: AbortSignal
  ): Promise<T> {
    const token = this.getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Active-Brand': activeBrand,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const isSessionAuthFailure =
        (res.status === 401 || (res.status === 403 && url.includes('/api/auth/me'))) &&
        !url.includes('/api/auth/login');

      if (isSessionAuthFailure) {
        console.warn(`[StorageService] Session expired or unauthorized (${res.status}). Clearing session token.`);
        this.setAuthToken(null);
        this.setAuthUser(null);
      }
      const errMsg = data?.error || data?.message || `HTTP ${res.status}: Request to ${url} failed.`;
      const err: any = new Error(errMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data as T;
  }

  // --- Live Azure SQL Database Diagnostics & Actions (Routed Through Limiter) ---
  public async getDatabaseStatus(): Promise<DatabaseStatus> {
    try {
      return await this.limiter.run(async () => {
        const token = this.getAuthToken();
        const headers: Record<string, string> = {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const res = await fetch('/api/db/status', { headers });
        if (res.ok) {
          const data = await res.json();
          return {
            connected: data.connected ?? false,
            isMock: data.isMock ?? false,
            server: data.server,
            database: data.database,
            authType: data.authType,
            user: data.user,
            error: data.error,
            timestamp: data.lastChecked || new Date().toISOString(),
            tables: data.tableCounts || {},
          };
        }
        return {
          connected: false,
          isMock: true,
          error: 'Connecting to Azure SQL Database...',
          timestamp: new Date().toISOString(),
          tables: {},
        };
      });
    } catch {
      return {
        connected: false,
        isMock: true,
        error: 'Connecting to Azure SQL Database...',
        timestamp: new Date().toISOString(),
        tables: {},
      };
    }
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
  public async login(email: string, pass: string): Promise<{ success: boolean; user?: AuthUser; token?: string; error?: string }> {
    // Purge any stale session or token before attempting authentication with new credentials
    this.setAuthToken(null);
    this.setAuthUser(null);

    try {
      const res = await this.apiCall<{ success: boolean; user: AuthUser; token?: string; error?: string }>('/api/auth/login', 'POST', {
        email: email.trim(),
        password: pass.trim(),
      });
      if (res.success && res.user) {
        if (res.token) {
          this.setAuthToken(res.token);
        }
        this.setAuthUser(res.user);
        this.notifyListeners();
        return { success: true, user: res.user, token: res.token };
      }
      return { success: false, error: res.error || 'Login verification failed.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // --- Live Azure SQL Credentials Update ---
  public async updateCredentials(data: {
    id?: string;
    adminId?: string;
    email?: string;
    name?: string;
    currentPassword?: string;
    newPassword?: string;
    password?: string;
    role?: string;
    brand?: string;
  }): Promise<{ success: boolean; message?: string; user?: AuthUser; token?: string; error?: string }> {
    try {
      const res = await this.apiCall<{
        success: boolean;
        message: string;
        user: AuthUser;
        token?: string;
        error?: string;
      }>('/api/auth/update-credentials', 'PUT', data);

      if (res.success) {
        if (res.token) {
          this.setAuthToken(res.token);
        }
        if (res.user) {
          this.setAuthUser(res.user);
        }
        this.notifyListeners();
        return { success: true, message: res.message, user: res.user, token: res.token };
      }
      return { success: false, error: res.error || 'Failed to update credentials in Azure SQL.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // --- Strict Live Session Verification ---
  public async verifySession(): Promise<VerifySessionResult> {
    const token = this.getAuthToken();
    if (!token) {
      this.setAuthUser(null);
      return { status: 'invalid', error: 'No session token found.' };
    }

    try {
      const res = await this.apiCall<{ success: boolean; user: AuthUser }>('/api/auth/me', 'GET');
      if (res.success && res.user) {
        this.setAuthUser(res.user);
        return { status: 'valid', user: res.user };
      }
      return { status: 'invalid', error: 'Invalid user response.' };
    } catch (err: any) {
      const status = err?.status;
      const isExplicitInvalid = status === 401 || status === 403;

      if (isExplicitInvalid) {
        console.warn(`[StorageService] Session confirmed invalid/expired (${status}). Clearing session token.`);
        this.setAuthToken(null);
        this.setAuthUser(null);
        return { status: 'invalid', error: err?.message || String(err) };
      }

      // Temporary database failure, HTTP 5xx, network error, timeout
      console.warn('[StorageService] Session verification service unavailable (preserving auth):', err?.message || String(err));
      return { status: 'unavailable', error: err?.message || String(err) };
    }
  }

  // --- Strict Live Entity Queries (Direct from Azure SQL) ---
  public async fetchClients(): Promise<Client[]> {
    const raw = await this.apiCall<any[]>('/api/clients');
    if (!Array.isArray(raw)) return [];
    return raw.map((c) => {
      const id = String(c.id || c.client_id || c.client_id_code || '').trim();
      const name = String(c.name || c.client_name || '').trim();
      const brand = c.brand || c.brand_id || 'Device Doctor India';
      return {
        ...c,
        id,
        client_id: id,
        client_id_code: id,
        name,
        client_name: name,
        brand,
        brand_id: brand,
      };
    });
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
      await this.apiCall(`/api/clients/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/categories/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/services/${encodeURIComponent(id)}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchProjects(): Promise<Project[]> {
    const list = await this.apiCall<Project[]>('/api/projects');
    if (!Array.isArray(list)) return [];
    return list.map((p) => {
      let pDoc = p.proposalDocument;
      let cDoc = p.contractDocument;
      if (typeof pDoc === 'string') {
        try {
          pDoc = JSON.parse(pDoc);
        } catch {
          pDoc = undefined;
        }
      }
      if (typeof cDoc === 'string') {
        try {
          cDoc = JSON.parse(cDoc);
        } catch {
          cDoc = undefined;
        }
      }
      return {
        ...p,
        proposalDocument: pDoc || undefined,
        contractDocument: cDoc || undefined,
      };
    });
  }

  public async saveProject(proj: Project, isUpdate: boolean = false): Promise<{ success: boolean; project?: Project; error?: string }> {
    try {
      const targetId = (isUpdate && proj.guid) ? proj.guid : (proj.id || (proj as any).projectCode);
      const endpoint = isUpdate ? `/api/projects/${encodeURIComponent(targetId)}` : '/api/projects';
      const method = isUpdate ? 'PUT' : 'POST';
      const payload = {
        ...proj,
        guid: proj.guid,
        projectCode: (proj as any).projectCode || (proj as any).project_id_code || proj.id,
        project_id_code: (proj as any).project_id_code || (proj as any).projectCode || proj.id,
        ...(isUpdate ? { isUpdate: true } : { isNew: true }),
      };
      const res = await this.apiCall<{ success: boolean; project: Project }>(endpoint, method, payload);
      this.notifyListeners();
      return { success: true, project: res.project };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/projects/${encodeURIComponent(id)}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public parseProofDocument(doc: any): PaymentProofDocument | undefined {
    if (!doc) return undefined;
    if (typeof doc === 'object') {
      return { ...doc };
    }
    if (typeof doc === 'string' && doc.trim()) {
      try {
        let parsed = JSON.parse(doc);
        while (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            break;
          }
        }
        if (parsed && typeof parsed === 'object') {
          return {
            id: parsed.id || `proof-${Date.now()}`,
            name: parsed.name || 'Payment_Proof',
            size: typeof parsed.size === 'number' ? parsed.size : 0,
            type: parsed.type || 'image/png',
            uploadedAt: parsed.uploadedAt || new Date().toISOString(),
            url: parsed.url || '',
            externalUrl: parsed.externalUrl || '',
            notes: parsed.notes || '',
          };
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  public async uploadPaymentProof(payload: {
    fileName: string;
    fileType: string;
    fileSize: number;
    fileData: string;
    transactionId?: string;
    notes?: string;
  }): Promise<{ success: boolean; proofDocument?: PaymentProofDocument; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; proofDocument: PaymentProofDocument; error?: string }>(
        '/api/upload-proof',
        'POST',
        payload
      );
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchPayments(): Promise<Payment[]> {
    const list = await this.apiCall<Payment[]>('/api/payments');
    return (list || []).map((p) => ({
      ...p,
      paymentProof: this.parseProofDocument(p.paymentProof),
    }));
  }

  public async savePayment(payment: Payment, isUpdate: boolean = false): Promise<{
    success: boolean;
    payment?: Payment;
    gstInvoice?: GstInvoice;
    gstInvoiceSynced?: boolean;
    warning?: string;
    gstSyncError?: string;
    error?: string;
  }> {
    try {
      // Ensure proof is a clean cloned object
      const payload: Payment = {
        ...payment,
        paymentProof: this.parseProofDocument(payment.paymentProof),
      };
      const customHeaders: Record<string, string> = {};
      if (payload.id) {
        customHeaders['Idempotency-Key'] = payload.id;
      }
      const endpoint = isUpdate && payload.id ? `/api/payments/${encodeURIComponent(payload.id)}` : '/api/payments';
      const method = isUpdate && payload.id ? 'PUT' : 'POST';
      const res = await this.apiCall<{
        success: boolean;
        payment: Payment;
        gstInvoiceSynced?: boolean;
        gstInvoice?: GstInvoice;
        warning?: string;
        gstSyncError?: string;
      }>(endpoint, method, payload, customHeaders);
      this.notifyListeners();
      const saved = res.payment
        ? { ...res.payment, paymentProof: this.parseProofDocument(res.payment.paymentProof) }
        : undefined;
      return {
        success: true,
        payment: saved,
        gstInvoice: res.gstInvoice,
        gstInvoiceSynced: res.gstInvoiceSynced,
        warning: res.warning,
        gstSyncError: res.gstSyncError,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async syncGstInvoicesFromPayments(): Promise<{
    success: boolean;
    count: number;
    invoices: GstInvoice[];
    error?: string;
  }> {
    try {
      const res = await this.apiCall<{
        success: boolean;
        count: number;
        invoices: GstInvoice[];
      }>('/api/gst-invoices/sync', 'POST', {});
      this.notifyListeners();
      return { success: true, count: res.count || 0, invoices: res.invoices || [] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, count: 0, invoices: [], error: msg };
    }
  }

  public async deletePayment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/payments/${encodeURIComponent(id)}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // --- Bank Accounts (CRUD) ---
  public async fetchBankAccounts(): Promise<BankAccount[]> {
    return this.apiCall<BankAccount[]>('/api/bank-accounts');
  }

  public async saveBankAccount(account: BankAccount): Promise<{ success: boolean; bankAccount?: BankAccount; error?: string }> {
    try {
      const res = await this.apiCall<{ success: boolean; bankAccount: BankAccount }>('/api/bank-accounts', 'POST', account);
      this.notifyListeners();
      return { success: true, bankAccount: res.bankAccount };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteBankAccount(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/bank-accounts/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/gst-invoices/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/roles/${encodeURIComponent(id)}`, 'DELETE');
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

  public async saveEmployee(emp: Employee, isUpdate: boolean = false): Promise<{ success: boolean; employee?: Employee; error?: string }> {
    try {
      const endpoint = isUpdate && emp.id ? `/api/employees/${encodeURIComponent(emp.id)}` : '/api/employees';
      const method = isUpdate && emp.id ? 'PUT' : 'POST';
      const res = await this.apiCall<{ success: boolean; employee: Employee }>(endpoint, method, emp);
      this.notifyListeners();
      return { success: true, employee: res.employee };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteEmployee(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/employees/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/assignments/${encodeURIComponent(id)}`, 'DELETE');
      this.notifyListeners();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async fetchEmployeePayments(): Promise<EmployeePayment[]> {
    const list = await this.apiCall<EmployeePayment[]>('/api/employee-payments');
    return (list || []).map((p) => ({
      ...p,
      paymentProof: this.parseProofDocument(p.paymentProof),
    }));
  }

  public async saveEmployeePayment(epay: EmployeePayment): Promise<{ success: boolean; payment?: EmployeePayment; error?: string }> {
    try {
      const payload: EmployeePayment = {
        ...epay,
        paymentProof: this.parseProofDocument(epay.paymentProof),
      };
      const res = await this.apiCall<{ success: boolean; payment: EmployeePayment }>('/api/employee-payments', 'POST', payload);
      this.notifyListeners();
      const saved = res.payment ? { ...res.payment, paymentProof: this.parseProofDocument(res.payment.paymentProof) } : undefined;
      return { success: true, payment: saved };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  public async deleteEmployeePayment(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.apiCall(`/api/employee-payments/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/expense-categories/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/expenses/${encodeURIComponent(id)}`, 'DELETE');
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
      await this.apiCall(`/api/users/${encodeURIComponent(id)}`, 'DELETE');
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
    const cleanType = type.replace(/^(DDI|CDS|FXL|DNS|DUNS)-/, '').toUpperCase();
    const pattern = new RegExp(`^${prefix}-${cleanType}-(\\d+)$`, 'i');

    let max = 0;
    for (const item of existingItems) {
      if (!item || !item.id) continue;
      const match = item.id.match(pattern);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > max) {
          max = num;
        }
      }
    }

    const nextNum = max + 1;
    return `${prefix}-${cleanType}-${String(nextNum).padStart(3, '0')}`;
  }

  // --- Strict Semantic Slugification & ID Generation ---
  public slugifySemantic(input?: string | null, fallback: string = 'DEFAULT'): string {
    if (!input || typeof input !== 'string') return fallback;
    const slug = input
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || fallback;
  }

  public generateSemanticClientId(
    brand: BrandName,
    clientName: string,
    existingClients: Array<{ id: string; brand?: BrandName }> = []
  ): string {
    const prefix = getBrandPrefix(brand);
    const clientSlug = this.slugifySemantic(clientName, 'CLIENT');
    const baseId = `${prefix}-${clientSlug}`;

    const matching = existingClients.filter((c) => c.id === baseId || c.id.startsWith(`${baseId}-`));
    if (matching.length === 0) {
      return baseId;
    }

    let maxSeq = 1;
    for (const c of matching) {
      if (c.id === baseId) continue;
      const match = c.id.match(new RegExp(`^${baseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return `${baseId}-${maxSeq + 1}`;
  }

  public generateSemanticProjectId(
    brand: BrandName,
    clientName: string,
    serviceName: string,
    existingProjects: Project[] = [],
    currentProjectId?: string,
    clientId?: string,
    serviceId?: string
  ): string {
    const prefix = getBrandPrefix(brand);
    const clientSlug = this.slugifySemantic(clientName, 'CLIENT');
    const serviceSlug = this.slugifySemantic(serviceName, 'SERVICE');
    const basePrefix = `${prefix}-${clientSlug}-${serviceSlug}`;

    const matchingProjects = existingProjects.filter((p) => {
      const pId = (p.id || '').trim();
      const pCode = (((p as any).project_id_code || '') as string).trim();
      if (currentProjectId && (pId === currentProjectId || pCode === currentProjectId)) return false;
      const matchExactPrefix = pId.startsWith(basePrefix) || pCode.startsWith(basePrefix);
      const matchClientAndService = clientId && serviceId && p.clientId === clientId && p.serviceId === serviceId;
      const matchLegacySpacePattern =
        (pId.startsWith(`${prefix} - `) || pCode.startsWith(`${prefix} - `)) &&
        (pId.toUpperCase().includes(clientSlug.replace(/-/g, ' ')) || pCode.toUpperCase().includes(clientSlug.replace(/-/g, ' ')));
      return matchExactPrefix || matchClientAndService || matchLegacySpacePattern;
    });

    let maxSeq = 0;
    for (const p of matchingProjects) {
      const pId = (p.id || '').trim();
      const pCode = (((p as any).project_id_code || '') as string).trim();

      // 1. Strict semantic match: BASE-N
      const escaped = basePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const strict1 = pId.match(new RegExp(`^${escaped}-(\\d+)$`, 'i'));
      const strict2 = pCode ? pCode.match(new RegExp(`^${escaped}-(\\d+)$`, 'i')) : null;
      const strictMatch = strict1 || strict2;
      if (strictMatch && strictMatch[1]) {
        const seq = parseInt(strictMatch[1], 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        continue;
      }

      // 2. Space-delimited legacy match: BASE - N
      const space1 = pId.match(/[-_\s](\d+)$/);
      const space2 = pCode ? pCode.match(/[-_\s](\d+)$/) : null;
      const spaceMatch = space1 || space2;
      if (spaceMatch && spaceMatch[1]) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pId)) {
          const seq = parseInt(spaceMatch[1], 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      }
    }

    const nextSeq = Math.max(maxSeq + 1, matchingProjects.length > 0 ? matchingProjects.length + 1 : 1);
    return `${basePrefix}-${nextSeq}`;
  }

  // Backward-compatible alias for existing callers
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
    return this.generateSemanticProjectId(
      currentBrand,
      clientName,
      serviceName,
      existingProjects,
      currentProjectId,
      clientId,
      serviceId
    );
  }

  public async fetchNextSemanticClientId(brand: BrandName, clientName: string): Promise<string> {
    try {
      const res = await this.apiCall<{ success: boolean; clientId: string }>(
        `/api/clients/next-semantic-id?brand=${encodeURIComponent(brand)}&name=${encodeURIComponent(clientName)}`
      );
      if (res?.clientId) return res.clientId;
    } catch (err) {
      console.warn('[fetchNextSemanticClientId] API error, using client fallback:', err);
    }
    return this.generateSemanticClientId(brand, clientName);
  }

  public async fetchNextSemanticProjectId(
    brand: BrandName,
    clientName: string,
    serviceName: string,
    clientId?: string,
    serviceId?: string,
    existingProjects: Project[] = []
  ): Promise<{ projectId: string; sequence: number }> {
    try {
      const query = new URLSearchParams({
        brand,
        clientName,
        serviceName,
        ...(clientId ? { clientId } : {}),
        ...(serviceId ? { serviceId } : {}),
      });
      const res = await this.apiCall<{ success: boolean; projectId: string; sequence: number }>(
        `/api/projects/next-semantic-id?${query.toString()}`
      );
      if (res?.projectId) {
        return { projectId: res.projectId, sequence: res.sequence || 1 };
      }
    } catch (err) {
      console.warn('[fetchNextSemanticProjectId] API error, using client fallback:', err);
    }
    const pid = this.generateSemanticProjectId(
      brand,
      clientName,
      serviceName,
      existingProjects,
      undefined,
      clientId,
      serviceId
    );
    const seqMatch = pid.match(/-(\d+)$/);
    const sequence = seqMatch ? parseInt(seqMatch[1], 10) : 1;
    return { projectId: pid, sequence };
  }

  public async fetchNextSemanticPaymentId(brand: BrandName, existingPayments: Payment[] = []): Promise<string> {
    try {
      const res = await this.apiCall<{ success: boolean; nextId: string }>(
        `/api/payments/next-semantic-id?brand=${encodeURIComponent(brand)}`
      );
      if (res?.nextId) return res.nextId;
    } catch (err) {
      console.warn('[fetchNextSemanticPaymentId] API error, using client fallback:', err);
    }
    return this.generateId('PAY', brand, existingPayments);
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

  public canDeleteBankAccount(bankAccountId: string, payments: Payment[]): { allowed: boolean; reason?: string; linkedCount: number } {
    const linked = payments.filter((p) => p.bankAccountId === bankAccountId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete bank account because ${linked.length} payment record(s) are tagged with this account. Mark account as Inactive instead to maintain accurate revenue and audit histories.`,
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
    if (val === 'Codestro' || val === 'FX Launch Pad' || val === 'DUNS') return val;
    return 'Device Doctor India';
  }

  public setActiveBrand(brand: BrandName) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREFERENCE_KEYS.ACTIVE_BRAND, brand);
    this.notifyListeners();
  }

  public getIsConsolidated(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(PREFERENCE_KEYS.CONSOLIDATED) === 'true';
  }

  public setIsConsolidated(val: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PREFERENCE_KEYS.CONSOLIDATED, val ? 'true' : 'false');
    this.notifyListeners();
  }

  public getHasConfirmedWorkspace(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(PREFERENCE_KEYS.WORKSPACE_CONFIRMED) === 'true';
  }

  public setHasConfirmedWorkspace(val: boolean) {
    if (typeof window === 'undefined') return;
    if (val) {
      sessionStorage.setItem(PREFERENCE_KEYS.WORKSPACE_CONFIRMED, 'true');
    } else {
      sessionStorage.removeItem(PREFERENCE_KEYS.WORKSPACE_CONFIRMED);
    }
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

  public getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(PREFERENCE_KEYS.AUTH_TOKEN);
  }

  public setAuthToken(token: string | null) {
    if (typeof window === 'undefined') return;
    const oldToken = localStorage.getItem(PREFERENCE_KEYS.AUTH_TOKEN);
    if (oldToken !== token) {
      this.abortInFlightGetRequestsForSessionChange(oldToken || 'anon');
    }
    if (token) {
      localStorage.setItem(PREFERENCE_KEYS.AUTH_TOKEN, token);
    } else {
      localStorage.removeItem(PREFERENCE_KEYS.AUTH_TOKEN);
    }
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
    const oldUser = this.getAuthUser();
    if (user) {
      if (oldUser && oldUser.id !== user.id) {
        this.abortInFlightGetRequestsForSessionChange();
      }
      localStorage.setItem(PREFERENCE_KEYS.AUTH_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(PREFERENCE_KEYS.AUTH_USER);
      this.setAuthToken(null);
      this.setHasConfirmedWorkspace(false);
    }
  }
}

export const storageService = new StorageService();
