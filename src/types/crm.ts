export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'AUD' | 'USDT' | 'BTC';

export type ClientStatus = 'Active' | 'Prospect' | 'Inactive' | 'Blocked';
export type CategoryStatus = 'Active' | 'Inactive';
export type ServiceStatus = 'Active' | 'Inactive';
export type ProjectStatus = 'Proposal' | 'Contracted' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
export type PaymentMode = 'GST Invoice' | 'Non GST Online' | 'Cash' | 'Crypto';
export type PaymentStatus = 'Received' | 'Pending' | 'Failed' | 'Cancelled';

// --- Multi-Brand Workspace Architecture ---
export type BrandName = 'Device Doctor India' | 'Codestro' | 'FX Launch Pad' | 'DUNS';
export type BrandPrefix = 'DDI' | 'CDS' | 'FXL' | 'DNS';
export type ActiveBrandFilter = BrandName | 'All Brands (Consolidated View)';

export interface BrandMeta {
  name: BrandName;
  prefix: BrandPrefix;
  shortName: string;
  tagline: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  accentBg: string;
  accentHover: string;
  accentBorder: string;
  accentText: string;
  accentRing: string;
  avatarBg: string;
}

export const BRAND_CONFIG: Record<BrandName, BrandMeta> = {
  'Device Doctor India': {
    name: 'Device Doctor India',
    prefix: 'DDI',
    shortName: 'Device Doctor',
    tagline: 'Enterprise IT, Cloud & Digital Operations',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-900 dark:text-slate-100',
    accentBg: 'bg-slate-900 dark:bg-white',
    accentHover: 'hover:bg-slate-800 dark:hover:bg-slate-100',
    accentBorder: 'border-slate-900 dark:border-white',
    accentText: 'text-slate-900 dark:text-slate-100',
    accentRing: 'focus:ring-slate-900 dark:focus:ring-slate-100',
    avatarBg: 'from-slate-800 to-slate-900',
  },
  'Codestro': {
    name: 'Codestro',
    prefix: 'CDS',
    shortName: 'Codestro',
    tagline: 'SaaS Engineering & Custom Software Studio',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-900 dark:text-slate-100',
    accentBg: 'bg-slate-900 dark:bg-white',
    accentHover: 'hover:bg-slate-800 dark:hover:bg-slate-100',
    accentBorder: 'border-slate-900 dark:border-white',
    accentText: 'text-slate-900 dark:text-slate-100',
    accentRing: 'focus:ring-slate-900 dark:focus:ring-slate-100',
    avatarBg: 'from-slate-800 to-slate-900',
  },
  'FX Launch Pad': {
    name: 'FX Launch Pad',
    prefix: 'FXL',
    shortName: 'FX Launch Pad',
    tagline: 'FinTech, Algorithmic Trading & Prop Firm Tech',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-900 dark:text-slate-100',
    accentBg: 'bg-slate-900 dark:bg-white',
    accentHover: 'hover:bg-slate-800 dark:hover:bg-slate-100',
    accentBorder: 'border-slate-900 dark:border-white',
    accentText: 'text-slate-900 dark:text-slate-100',
    accentRing: 'focus:ring-slate-900 dark:focus:ring-slate-100',
    avatarBg: 'from-slate-800 to-slate-900',
  },
  'DUNS': {
    name: 'DUNS',
    prefix: 'DNS',
    shortName: 'DUNS',
    tagline: 'Global Business Verification, Corporate Intelligence & Regulatory Compliance',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-900 dark:text-slate-100',
    accentBg: 'bg-slate-900 dark:bg-white',
    accentHover: 'hover:bg-slate-800 dark:hover:bg-slate-100',
    accentBorder: 'border-slate-900 dark:border-white',
    accentText: 'text-slate-900 dark:text-slate-100',
    accentRing: 'focus:ring-slate-900 dark:focus:ring-slate-100',
    avatarBg: 'from-slate-800 to-slate-900',
  },
};

export const getBrandPrefix = (brand?: BrandName | string): BrandPrefix => {
  if (brand === 'Codestro') return 'CDS';
  if (brand === 'FX Launch Pad') return 'FXL';
  if (brand === 'DUNS') return 'DNS';
  return 'DDI';
};

export interface Client {
  id: string; // e.g. DDI-CL-001, CDS-CL-001, FXL-CL-001, DNS-CL-001
  brand?: BrandName; // Multi-brand tag
  name: string;
  contactPerson?: string;
  phone?: string; // Optional Contact / Mobile Number
  email?: string; // Optional Billing / Communication Email
  city?: string;
  country?: string;
  gstNumber?: string; // Optional 15 alphanumeric chars, unique if provided
  preferredCurrency: CurrencyCode;
  clientSince: string; // YYYY-MM-DD
  status: ClientStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategory {
  id: string; // e.g. DDI-CAT-001
  brand?: BrandName;
  name: string; // Unique within brand
  description: string;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategoryStatus = 'Active' | 'Inactive';

export interface ExpenseCategory {
  id: string; // Auto-generated & read-only, e.g. DDI-EXPCAT-001
  brand?: BrandName;
  name: string; // Required, strictly unique
  description?: string; // Textarea, optional
  status: ExpenseCategoryStatus; // Active | Inactive
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string; // e.g. DDI-SRV-001
  brand?: BrandName;
  name: string;
  categoryId: string; // FK to ServiceCategory.id
  description: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocument {
  id?: string;
  name: string; // file name (e.g. Zenith_Logistics_ERP_Proposal_v2.pdf)
  size?: number; // size in bytes
  type?: string; // mime type
  uploadedAt: string; // ISO date string or formatted date
  url?: string; // Base64 data URL, blob, or object URL
  externalUrl?: string; // Google Drive or external link
  notes?: string; // document version notes or summary
}

export type PaymentPhaseStatus = 'Pending' | 'Invoiced' | 'Received' | 'Overdue';

export interface PaymentPhase {
  id: string; // unique id e.g. "phase-1", "phase-2"
  name: string; // e.g. "Phase 1 - Advance / Kickoff"
  percentage: number; // e.g. 40
  amount: number; // in project currency
  amountINR: number; // auto-converted to INR
  dueDate: string; // YYYY-MM-DD
  status: PaymentPhaseStatus; // Pending | Invoiced | Received | Overdue
  notes?: string; // notes on deliverables, conditions
}

export interface Project {
  id: string; // Smart format: [PREFIX] - [CLIENT NAME] - [SERVICE NAME] - [SEQUENCE] (auto-generated, read-only)
  brand?: BrandName;
  clientId: string; // Foreign key to Client.id
  clientName: string; // Auto-filled from Client
  serviceId: string; // Foreign key to Service.id (Service Type)
  proposalDate: string; // YYYY-MM-DD
  contractDate: string; // Contract/Agreement Date (YYYY-MM-DD)
  startDate: string; // Project Start Date (YYYY-MM-DD)
  committedDays: number; // Number input
  committedEndDate: string; // Auto-calculated read-only: startDate + committedDays
  actualEndDate?: string; // Date picker, optional
  status: ProjectStatus; // Proposal, Contracted, In Progress, On Hold, Completed, Cancelled
  paymentMode: PaymentMode; // GST Invoice, Non GST Online, Cash, Crypto
  currency: CurrencyCode; // Dropdown: INR, USD, EUR, etc.
  contract: number; // Contract amount in selected currency
  exchangeRate: number; // Defaults to 1 for INR, editable for others
  contractValue: number; // Auto-calculated read-only in INR: contract * exchangeRate
  totalReceived?: number; // Total amount received in INR from 'Received' payments
  balance?: number; // Remaining balance in INR: contractValue - totalReceived
  projectManager: string; // Text input
  notes?: string; // Textarea
  proposalDocument?: ProjectDocument;
  proposalDocumentNotes?: string;
  contractDocument?: ProjectDocument;
  contractDocumentNotes?: string;
  paymentPhases?: PaymentPhase[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentProofDocument {
  id?: string;
  name: string; // file name (e.g. HDFC_Bank_Transfer_Receipt.png)
  size?: number; // size in bytes
  type?: string; // mime type
  uploadedAt: string; // ISO date string
  url?: string; // Base64 data URL, blob, or object URL
  externalUrl?: string; // Google Drive or external link
  notes?: string; // proof notes / verification details
}

export type BankAccountType = 'Current' | 'Savings' | 'Crypto Wallet' | 'Escrow' | 'Other';
export type BankAccountStatus = 'Active' | 'Inactive';

export interface BankAccount {
  id: string; // e.g. DDI-BNK-001, CDS-BNK-001, FXL-BNK-001, DNS-BNK-001
  brand: BrandName; // Multi-brand association
  accountName: string; // e.g. "Primary Operating Account", "HDFC Corporate"
  bankName: string; // e.g. "HDFC Bank", "ICICI Bank", "Wise", "Binance / Tether"
  accountNumber: string; // Account Number or Wallet Address
  ifscCode?: string; // Optional IFSC / SWIFT / routing code
  branchName?: string; // Optional Branch / Network
  upiId?: string; // Optional UPI ID
  accountType: BankAccountType;
  status: BankAccountStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string; // Auto-generated e.g. DDI-PAY-001, CDS-PAY-001, FXL-PAY-001
  brand?: BrandName;
  projectId: string; // FK to Project.id (Smart Project ID)
  clientId: string; // Auto-filled & read-only from Project
  clientName?: string; // Auto-filled & read-only from Project
  paymentMode: PaymentMode; // Dropdown: GST Invoice, Non GST Online, Cash, Crypto
  bankAccountId?: string; // FK to BankAccount.id
  bankAccountName?: string; // Snapshot / display label of receiving bank account
  paymentDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  amountReceived: number; // Numeric input in selected currency
  currency: CurrencyCode; // Dropdown: INR, USD, EUR, etc. (defaults to Project currency)
  exchangeRate: number; // Defaults to 1 for INR or project's exchange rate
  amountINR: number; // Auto-calculated read-only: amountReceived * exchangeRate
  referenceUtr: string; // Text input — unique check enforced across all payments
  paymentStatus: PaymentStatus; // Dropdown: Received, Pending, Failed, Cancelled
  daysOverdue: number; // Auto-calculated read-only: if Pending & Today > Due Date -> days, else 0
  notes?: string; // Textarea
  paymentProof?: PaymentProofDocument; // Uploaded payment proof/receipt screenshot
  paymentProofNotes?: string; // Dedicated receipt notes
  createdAt: string;
  updatedAt: string;
  // Compatibility helpers
  amount?: number; // In INR (= amountINR)
  receivedAmount?: number; // In INR
  outstandingAmount?: number; // In INR
  paymentMethod?: string;
}

export type EmployeeStatus = 'Active' | 'Inactive';
export type EmployeeType = 'Salary Basis' | 'Contract Basis';
export type TdsOption = 'Yes' | 'No';

export interface EmployeeRole {
  id: string; // e.g. DDI-ROL-001, CDS-ROL-001, FXL-ROL-001
  brand?: BrandName;
  roleName: string; // Unique within brand
  department: string;
  status: CategoryStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string; // Auto-generated & read-only, e.g. DDI-EMP-001, CDS-EMP-001, FXL-EMP-001, DNS-EMP-001
  brand?: BrandName;
  name: string; // Employee Name, required
  roleId: string; // FK to EmployeeRole.id (Linked strictly by Role ID)
  email?: string; // Email (Optional — strictly unique if provided)
  status: EmployeeStatus; // Active / Inactive
  joiningDate: string; // YYYY-MM-DD
  costOfEmployee: number; // Cost of Employee in INR
  employeeType: EmployeeType; // 'Salary Basis' | 'Contract Basis'
  comesUnderTds: TdsOption; // 'Yes' | 'No'
  notes?: string; // Textarea
  createdAt: string;
  updatedAt: string;
  // Compatibility aliases
  salary?: number;
  monthlyCost?: number;
  joinedDate?: string;
  phone?: string;
  assignedProjectsCount?: number;
}

export type AssignmentPaymentStatus = 'Pending' | 'Partially Paid' | 'Paid' | 'On Hold' | 'Cancelled';

export interface Assignment {
  id: string; // Auto-generated & read-only, e.g. DDI-ASN-001, CDS-ASN-001, FXL-ASN-001
  brand?: BrandName;
  projectId: string; // Project ID (smart ID)
  clientId: string; // Auto-filled from Project ID
  clientName: string; // Auto-filled from Project ID
  employeeId: string; // Auto-filled from Employee
  employeeName: string; // Auto-filled from Employee
  roleName: string; // Auto-filled from Employee's Role
  assignedDate: string; // YYYY-MM-DD, defaults to today
  workAssigned: string; // Work / Module Assigned (e.g. Frontend UI Development)
  amount: number; // Total amount allocated for this employee's assigned work in INR
  amountPaid: number; // Amount paid so far in INR (validate <= amount)
  paymentStatus: AssignmentPaymentStatus; // Pending, Partially Paid, Paid, On Hold, Cancelled
  employeeNotes?: string; // Textarea for progress or payout notes
  lastNoteUpdate?: string; // Auto-generated timestamp
  createdAt: string;
  updatedAt: string;
}

export type EmployeePaymentMode =
  | 'GST Invoice'
  | 'Non GST Online'
  | 'Cash'
  | 'Crypto';

export interface EmployeePayment {
  id: string; // Auto-generated & read-only, e.g. DDI-EPAY-001, CDS-EPAY-001, FXL-EPAY-001
  brand?: BrandName;
  assignmentId: string; // Dropdown populated from Assignments
  projectId: string; // Auto-filled & read-only
  employeeId: string; // Auto-filled & read-only
  employeeName: string; // Auto-filled & read-only
  paymentDate: string; // YYYY-MM-DD, defaults to today
  amountPaid: number; // Numeric input in INR (cannot exceed remaining balance)
  paymentMode: EmployeePaymentMode; // Dropdown
  referenceUtr?: string; // Text input - unique check across all employee payments if provided
  notes?: string; // Textarea
  paymentProof?: PaymentProofDocument; // Uploaded employee payment receipt screenshot
  paymentProofNotes?: string; // Dedicated receipt notes
  createdAt: string;
  updatedAt: string;
}

export type ExpensePaymentStatus = 'Paid' | 'Pending' | 'Failed' | 'Cancelled';

export interface Expense {
  id: string; // Auto-generated & read-only, e.g. DDI-EXP-001, CDS-EXP-001, FXL-EXP-001
  brand?: BrandName;
  projectId: string; // "NA" or Project ID
  clientId: string; // Auto-filled from Project ID, or "NA"
  clientName: string; // Auto-filled from Project ID, or "NA"
  expenseCategoryId: string; // Foreign key to ExpenseCategory.id
  expenseCategoryName: string; // Auto-filled from ExpenseCategory
  vendor: string; // Text input — e.g. "Hostinger", "AWS", "Meta Ads", "Local Vendor"
  description: string; // Text input / Textarea
  amount: number; // Numeric input
  currency: CurrencyCode; // Dropdown
  exchangeRate: number; // Numeric input
  amountINR: number; // Auto-calculated & read-only: amount * exchangeRate
  expenseDate: string; // YYYY-MM-DD
  paymentStatus: ExpensePaymentStatus; // Dropdown: Paid, Pending, Failed, Cancelled
  notes?: string; // Textarea
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDocumentFile {
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  url: string;
}

export type GstPortalUploadStatus = 'Yes' | 'No';

export interface GstInvoice {
  id: string; // Auto-generated e.g. DDI-GST-001, CDS-GST-001, FXL-GST-001
  brand?: BrandName;
  paymentId: string; // FK to Payment.id
  projectId: string; // Pulled from Payment
  clientId: string; // Pulled from Payment
  clientName: string; // Pulled from Payment
  paymentDate: string; // Pulled from Payment
  amountReceived: number; // Pulled from Payment
  currency?: CurrencyCode; // Pulled from Payment
  amountINR: number; // Pulled from Payment
  gstAmountINR: number; // Auto-calculated: amountINR * 0.18
  invoiceNumber: string; // Zoho INV Number (e.g., INV-2026-001)
  uploadedToGstPortal: GstPortalUploadStatus; // Dropdown: Yes / No
  gstPortalUploadDate?: string; // Date picker (enabled when Uploaded to GST Portal is 'Yes')
  invoiceFile?: InvoiceDocumentFile; // Attached GST Tax Invoice document / PDF / scan
  notes?: string; // Textarea
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'Super Admin' | 'Brand Admin' | 'Project Manager' | 'Accountant' | 'Viewer';

export interface AppUser {
  id: string; // e.g. USR-001
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  brand?: BrandName | 'All';
  status: 'Active' | 'Inactive';
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  brand?: BrandName | 'All';
  avatar?: string;
}

export interface DatabaseStatus {
  connected: boolean;
  server: string;
  database: string;
  authType: string;
  user: string;
  error?: string | null;
  timestamp: string;
  tables?: { [tableName: string]: number };
}

export type ReportsSubTab = 'business' | 'client' | 'employee' | 'overview' | 'bank-accounts' | 'payment-modes';

export type ActiveModule =
  | 'dashboard'
  | 'clients'
  | 'categories'
  | 'services'
  | 'projects'
  | 'payments'
  | 'bank-accounts'
  | 'gst-invoices'
  | 'roles'
  | 'employees'
  | 'assignments'
  | 'employee-payments'
  | 'expense-categories'
  | 'expenses'
  | 'reports'
  | 'users';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export type ReferentialBlockState = ReferentialIntegrityBlock;

export interface ReferentialIntegrityBlock {
  isOpen: boolean;
  title: string;
  message: string;
  entityType: 'client' | 'category' | 'service' | 'role' | 'project' | 'employee' | 'assignment' | 'employee-payment' | 'expense-category' | 'expense' | string;
  entityId: string;
  entityName: string;
  linkedCount?: number;
  onSetInactive?: () => void;
}
