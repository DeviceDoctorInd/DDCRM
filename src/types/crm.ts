export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'AUD' | 'USDT' | 'BTC';

export type ClientStatus = 'Active' | 'Prospect' | 'Inactive' | 'Blocked';
export type CategoryStatus = 'Active' | 'Inactive';
export type ServiceStatus = 'Active' | 'Inactive';
export type ProjectStatus = 'Proposal' | 'Contracted' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
export type PaymentMode = 'GST Invoice' | 'Non GST Online' | 'Cash' | 'Crypto';
export type PaymentStatus = 'Received' | 'Pending' | 'Failed' | 'Cancelled';

export interface Client {
  id: string; // e.g. CL-001
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  city: string;
  country: string;
  gstNumber?: string; // 15 alphanumeric chars, unique if provided
  preferredCurrency: CurrencyCode;
  clientSince: string; // YYYY-MM-DD
  status: ClientStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategory {
  id: string; // CAT-001
  name: string; // Unique
  description: string;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategoryStatus = 'Active' | 'Inactive';

export interface ExpenseCategory {
  id: string; // Auto-generated & read-only, e.g. DDI-EXPCAT-001
  name: string; // Required, strictly unique
  description?: string; // Textarea, optional
  status: ExpenseCategoryStatus; // Active | Inactive
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string; // SRV-001
  name: string;
  categoryId: string; // FK to ServiceCategory.id
  description: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string; // Smart format: DDI - [CLIENT NAME] - [SERVICE NAME] - [SEQUENCE] (auto-generated, read-only)
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
  paymentMode: PaymentMode; // Bank Transfer, UPI, Cash, Cheque, Card, Crypto, Milestone-based
  currency: CurrencyCode; // Dropdown: INR, USD, EUR, etc.
  contract: number; // Contract amount in selected currency
  exchangeRate: number; // Defaults to 1 for INR, editable for others
  contractValue: number; // Auto-calculated read-only in INR: contract * exchangeRate
  totalReceived?: number; // Total amount received in INR from 'Received' payments
  balance?: number; // Remaining balance in INR: contractValue - totalReceived
  projectManager: string; // Text input
  notes?: string; // Textarea
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string; // Auto-generated e.g. DDI-PAY-001
  projectId: string; // FK to Project.id (Smart Project ID)
  clientId: string; // Auto-filled & read-only from Project
  clientName?: string; // Auto-filled & read-only from Project
  paymentMode: PaymentMode; // Dropdown: Bank Transfer, UPI, Cash, Cheque, Card, Crypto, Milestone-based
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
  id: string; // ROL-001
  roleName: string; // Unique
  department: string;
  status: CategoryStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string; // Auto-generated & read-only, e.g. DDI-EMP-001
  name: string; // Employee Name, required
  roleId: string; // FK to EmployeeRole.id (Linked strictly by Role ID)
  email: string; // Email, required — strictly UNIQUE
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
  id: string; // Auto-generated & read-only, e.g. DDI-ASN-001
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
  id: string; // Auto-generated & read-only, e.g. DDI-EPAY-001 or <ASSIGNMENT_ID>-PAY-1
  assignmentId: string; // Dropdown populated from Assignments
  projectId: string; // Auto-filled & read-only
  employeeId: string; // Auto-filled & read-only
  employeeName: string; // Auto-filled & read-only
  paymentDate: string; // YYYY-MM-DD, defaults to today
  amountPaid: number; // Numeric input in INR (cannot exceed remaining balance)
  paymentMode: EmployeePaymentMode; // Dropdown
  referenceUtr?: string; // Text input - unique check across all employee payments if provided
  notes?: string; // Textarea
  createdAt: string;
  updatedAt: string;
}

export type ExpensePaymentStatus = 'Paid' | 'Pending' | 'Failed' | 'Cancelled';

export interface Expense {
  id: string; // Auto-generated & read-only, e.g. DDI-EXP-001
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

export type GstPortalUploadStatus = 'Yes' | 'No';

export interface GstInvoice {
  id: string; // Auto-generated e.g. DDI-GST-001
  paymentId: string; // FK to Payment.id
  projectId: string; // Pulled from Payment
  clientId: string; // Pulled from Payment
  clientName: string; // Pulled from Payment
  paymentDate: string; // Pulled from Payment
  amountReceived: number; // Pulled from Payment
  currency?: CurrencyCode; // Pulled from Payment
  amountINR: number; // Pulled from Payment
  gstAmountINR: number; // Auto-calculated: amountINR * 0.18
  // 4 Manual Fields:
  invoiceNumber: string; // Zoho INV Number (e.g., INV-2026-001)
  uploadedToGstPortal: GstPortalUploadStatus; // Dropdown: Yes / No
  gstPortalUploadDate?: string; // Date picker (enabled when Uploaded to GST Portal is 'Yes')
  notes?: string; // Textarea
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

export type ActiveModule =
  | 'dashboard'
  | 'clients'
  | 'categories'
  | 'services'
  | 'projects'
  | 'payments'
  | 'gst-invoices'
  | 'roles'
  | 'employees'
  | 'assignments'
  | 'employee-payments'
  | 'expense-categories'
  | 'expenses';

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
