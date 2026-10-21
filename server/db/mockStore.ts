import {
  Client,
  ServiceCategory,
  Service,
  Project,
  Payment,
  GstInvoice,
  EmployeeRole,
  Employee,
  Assignment,
  EmployeePayment,
  ExpenseCategory,
  Expense,
  AppUser,
  BankAccount,
} from '../../src/types/crm';
import bcrypt from 'bcryptjs';

export interface AuditLogEntry {
  id: number;
  brand: string;
  module: string;
  action: string;
  entityId: string;
  details: string;
  performedBy: string;
  timestamp: string;
}

class MockStore {
  private clients: Client[] = [];
  private categories: ServiceCategory[] = [];
  private services: Service[] = [];
  private projects: Project[] = [];
  private payments: Payment[] = [];
  private bankAccounts: BankAccount[] = [];
  private gstInvoices: GstInvoice[] = [];
  private roles: EmployeeRole[] = [];
  private employees: Employee[] = [];
  private assignments: Assignment[] = [];
  private employeePayments: EmployeePayment[] = [];
  private expenseCategories: ExpenseCategory[] = [];
  private expenses: Expense[] = [];
  private users: AppUser[] = [];
  private auditLog: AuditLogEntry[] = [];
  private nextAuditId = 1;

  constructor() {
    this.seedDefaultData();
  }

  public seedDefaultData() {
    const now = new Date().toISOString();

    // Default users (covering all quick sign-in buttons on LoginScreen)
    this.users = [
      {
        id: 'USR-001',
        name: 'Hemant Rathore',
        email: 'rathorehemant114@gmail.com',
        password: 'Admin@2026',
        role: 'Super Admin',
        brand: 'All',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-002',
        name: 'Device Doctor India Admin',
        email: 'devicedoctorindia.in@gmail.com',
        password: 'Admin@2026',
        role: 'Super Admin',
        brand: 'All',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-003',
        name: 'Codestro Brand Admin',
        email: 'admin@codestro.com',
        password: 'Codestro@2026',
        role: 'Brand Admin',
        brand: 'Codestro',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-004',
        name: 'Karthik Rao (PM)',
        email: 'karthik.pm@devicedoctor.in',
        password: 'Project@2026',
        role: 'Project Manager',
        brand: 'Device Doctor India',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-005',
        name: 'Finance & Accounts',
        email: 'finance@devicedoctor.in',
        password: 'Finance@2026',
        role: 'Accountant',
        brand: 'Device Doctor India',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-006',
        name: 'Executive Reviewer',
        email: 'viewer@devicedoctor.in',
        password: 'Viewer@2026',
        role: 'Viewer',
        brand: 'All',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'USR-007',
        name: 'DUNS Brand Admin',
        email: 'admin@duns.com',
        password: 'Duns@2026',
        role: 'Brand Admin',
        brand: 'DUNS',
        status: 'Active',
        avatar: '',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Clients
    this.clients = [
      {
        id: 'DDI-CL-001',
        brand: 'Device Doctor India',
        name: 'TechCorp Infotech Pvt Ltd',
        contactPerson: 'Rajesh Sharma',
        phone: '+91 98201 12345',
        email: 'rajesh@techcorp.in',
        city: 'Mumbai',
        country: 'India',
        gstNumber: '27AABCT1234A1Z5',
        preferredCurrency: 'INR',
        clientSince: '2024-01-15',
        status: 'Active',
        notes: 'Enterprise AMC client for server infrastructure and hardware support.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-CL-002',
        brand: 'Device Doctor India',
        name: 'Apollo Diagnostics Centre',
        contactPerson: 'Dr. Alok Verma',
        phone: '+91 99102 54321',
        email: 'it.procure@apollo.org',
        city: 'New Delhi',
        country: 'India',
        gstNumber: '07AAACA2345B1Z8',
        preferredCurrency: 'INR',
        clientSince: '2024-06-20',
        status: 'Active',
        notes: 'High-availability hardware maintenance and cloud backup solutions.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-CL-001',
        brand: 'Codestro',
        name: 'FinScale Technologies Inc',
        contactPerson: 'Sophia Lee',
        phone: '+1 415 555 2671',
        email: 'sophia@finscale.io',
        city: 'San Francisco',
        country: 'United States',
        gstNumber: '',
        preferredCurrency: 'USD',
        clientSince: '2024-09-10',
        status: 'Active',
        notes: 'SaaS banking dashboard and real-time ledger microservices.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-CL-001',
        brand: 'FX Launch Pad',
        name: 'AlphaEdge Quantitative Capital',
        contactPerson: 'Marcus Vance',
        phone: '+44 20 7946 0912',
        email: 'm.vance@alphaedgecap.com',
        city: 'London',
        country: 'United Kingdom',
        gstNumber: '',
        preferredCurrency: 'USD',
        clientSince: '2025-01-10',
        status: 'Active',
        notes: 'Prop firm MetaTrader 5 trade evaluation and FIX API bridge.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-CL-001',
        brand: 'DUNS',
        name: 'Vertex Global Compliance Corp',
        contactPerson: 'David Sterling',
        phone: '+1 212 555 7890',
        email: 'compliance@vertexglobal.com',
        city: 'New York',
        country: 'United States',
        gstNumber: '',
        preferredCurrency: 'USD',
        clientSince: '2025-01-20',
        status: 'Active',
        notes: 'Global entity verification, corporate risk intelligence and regulatory compliance auditing.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Service Categories
    this.categories = [
      {
        id: 'DDI-CAT-001',
        brand: 'Device Doctor India',
        name: 'Hardware & Infrastructure AMC',
        description: 'Comprehensive annual maintenance contracts for enterprise servers and workstations.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-CAT-002',
        brand: 'Device Doctor India',
        name: 'Cloud Migration & Networking',
        description: 'Hybrid cloud setups, VPN security, and network operations.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-CAT-001',
        brand: 'Codestro',
        name: 'Custom SaaS & Cloud Engineering',
        description: 'Full-stack scalable web applications, REST/GraphQL APIs, and microservices.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-CAT-001',
        brand: 'FX Launch Pad',
        name: 'Prop Firm Tech & Broker Bridges',
        description: 'MetaTrader 5 integration, risk managers, and trader challenge platforms.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-CAT-001',
        brand: 'DUNS',
        name: 'Corporate Intelligence & Verification',
        description: 'Global business registration auditing, corporate risk ratings, and compliance screening.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Services
    this.services = [
      {
        id: 'DDI-SRV-001',
        brand: 'Device Doctor India',
        name: 'Enterprise Server Maintenance & AMC',
        categoryId: 'DDI-CAT-001',
        description: '24/7 SLA hardware maintenance, component replacements, and preventative checkups.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-SRV-001',
        brand: 'Codestro',
        name: 'Multi-Tenant SaaS Web Application',
        categoryId: 'CDS-CAT-001',
        description: 'React, Node.js, and PostgreSQL scalable multi-tenant architecture with billing.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-SRV-001',
        brand: 'FX Launch Pad',
        name: 'MetaTrader 5 Prop Trading Challenge Platform',
        categoryId: 'FXL-CAT-001',
        description: 'Automated challenge rules engine, breach monitors, and trader dashboard.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-SRV-001',
        brand: 'DUNS',
        name: 'Global Business Verification & D-U-N-S Certification',
        categoryId: 'DNS-CAT-001',
        description: 'Enterprise identity verification, credit risk scoring, and anti-money laundering compliance.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Projects
    this.projects = [
      {
        id: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        brand: 'Device Doctor India',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        serviceId: 'DDI-SRV-001',
        proposalDate: '2025-01-05',
        contractDate: '2025-01-15',
        startDate: '2025-01-20',
        committedDays: 90,
        committedEndDate: '2025-04-20',
        actualEndDate: '',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 450000,
        exchangeRate: 1,
        contractValue: 450000,
        totalReceived: 300000,
        balance: 150000,
        projectManager: 'Karthik Rao',
        notes: 'Phase 1 and Phase 2 server hardware overhaul completed.',
        proposalDocument: { name: 'TechCorp_Proposal_2025.pdf', uploadedAt: now },
        contractDocument: { name: 'TechCorp_AMC_Contract_Signed.pdf', uploadedAt: now },
        paymentPhases: [
          { id: 'phase-1', name: 'Mobilization Advance', percentage: 40, amount: 180000, amountINR: 180000, dueDate: '2025-01-20', status: 'Received' },
          { id: 'phase-2', name: 'Milestone 2 - Server Deployment', percentage: 26.67, amount: 120000, amountINR: 120000, dueDate: '2025-02-28', status: 'Received' },
          { id: 'phase-3', name: 'Final Handover & Sign-off', percentage: 33.33, amount: 150000, amountINR: 150000, dueDate: '2025-04-20', status: 'Pending' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS - FINSCALE TECHNOLOGIES - MULTI-TENANT SAAS WEB APPLICATION - 1',
        brand: 'Codestro',
        clientId: 'CDS-CL-001',
        clientName: 'FinScale Technologies Inc',
        serviceId: 'CDS-SRV-001',
        proposalDate: '2025-02-01',
        contractDate: '2025-02-10',
        startDate: '2025-02-15',
        committedDays: 60,
        committedEndDate: '2025-04-16',
        actualEndDate: '',
        status: 'In Progress',
        paymentMode: 'Non GST Online',
        currency: 'USD',
        contract: 18000,
        exchangeRate: 86.5,
        contractValue: 1557000,
        totalReceived: 1038000,
        balance: 519000,
        projectManager: 'Hemant Rathore',
        notes: 'React front-end components and microservices containerized.',
        proposalDocument: { name: 'FinScale_SaaS_Blueprint.pdf', uploadedAt: now },
        paymentPhases: [
          { id: 'p1', name: 'Sprint 1 & Architecture Kickoff', percentage: 66.67, amount: 12000, amountINR: 1038000, dueDate: '2025-02-15', status: 'Received' },
          { id: 'p2', name: 'Beta Launch & UAT', percentage: 33.33, amount: 6000, amountINR: 519000, dueDate: '2025-04-16', status: 'Pending' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL - ALPHAEDGE QUANTITATIVE CAPITAL - METATRADER 5 PROP TRADING CHALLENGE PLATFORM - 1',
        brand: 'FX Launch Pad',
        clientId: 'FXL-CL-001',
        clientName: 'AlphaEdge Quantitative Capital',
        serviceId: 'FXL-SRV-001',
        proposalDate: '2025-01-05',
        contractDate: '2025-01-10',
        startDate: '2025-01-12',
        committedDays: 45,
        committedEndDate: '2025-02-26',
        actualEndDate: '2025-02-24',
        status: 'Completed',
        paymentMode: 'Crypto',
        currency: 'USDT',
        contract: 25000,
        exchangeRate: 86.5,
        contractValue: 2162500,
        totalReceived: 2162500,
        balance: 0,
        projectManager: 'Hemant Rathore',
        notes: 'Delivered and verified on live trading accounts with FIX bridge.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS - VERTEX GLOBAL COMPLIANCE CORP - GLOBAL BUSINESS VERIFICATION & D-U-N-S CERTIFICATION - 1',
        brand: 'DUNS',
        clientId: 'DNS-CL-001',
        clientName: 'Vertex Global Compliance Corp',
        serviceId: 'DNS-SRV-001',
        proposalDate: '2025-01-25',
        contractDate: '2025-02-01',
        startDate: '2025-02-05',
        committedDays: 60,
        committedEndDate: '2025-04-06',
        actualEndDate: '',
        status: 'In Progress',
        paymentMode: 'Non GST Online',
        currency: 'USD',
        contract: 22000,
        exchangeRate: 86.5,
        contractValue: 1903000,
        totalReceived: 1200000,
        balance: 703000,
        projectManager: 'Arjun Mehta',
        notes: 'Comprehensive multi-jurisdictional compliance and corporate risk audit.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Bank Accounts (associated with each brand)
    this.bankAccounts = [
      // Device Doctor India
      {
        id: 'DDI-BNK-001',
        brand: 'Device Doctor India',
        accountName: 'Primary Operating Account',
        bankName: 'HDFC Bank',
        accountNumber: '50200088921478',
        ifscCode: 'HDFC0001234',
        branchName: 'Connaught Place, New Delhi',
        upiId: 'devicedoctor@hdfcbank',
        accountType: 'Current',
        status: 'Active',
        notes: 'Primary INR client collections and GST invoices account.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-BNK-002',
        brand: 'Device Doctor India',
        accountName: 'Corporate Reserves A/C',
        bankName: 'ICICI Bank',
        accountNumber: '001205019842',
        ifscCode: 'ICIC0000012',
        branchName: 'Nehru Place, New Delhi',
        upiId: 'devicedoctor.reserves@icici',
        accountType: 'Current',
        status: 'Active',
        notes: 'Enterprise contracts and operational reserve account.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-BNK-003',
        brand: 'Device Doctor India',
        accountName: 'Online Escrow & Payment Gateway',
        bankName: 'Razorpay / Cashfree Settlement',
        accountNumber: 'PG-DDI-SETTLE-88',
        ifscCode: 'RAZR0000001',
        branchName: 'Virtual Nodal Account',
        upiId: 'ddi.instant@razorpay',
        accountType: 'Escrow',
        status: 'Active',
        notes: 'Automated digital payments & UPI gateway collections.',
        createdAt: now,
        updatedAt: now,
      },

      // Codestro
      {
        id: 'CDS-BNK-001',
        brand: 'Codestro',
        accountName: 'Digital Product Operating A/C',
        bankName: 'Axis Bank',
        accountNumber: '921020054789123',
        ifscCode: 'UTIB0000456',
        branchName: 'Koramangala, Bengaluru',
        upiId: 'codestro@axisbank',
        accountType: 'Current',
        status: 'Active',
        notes: 'SaaS retainers and domestic software development billing.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-BNK-002',
        brand: 'Codestro',
        accountName: 'Global Wire & Foreign Inward A/C',
        bankName: 'Wise Multi-Currency / SVB',
        accountNumber: '4420891204',
        ifscCode: 'WISEUS33XXX',
        branchName: 'New York Wire Center',
        upiId: '',
        accountType: 'Current',
        status: 'Active',
        notes: 'Cross-border USD/EUR international client transfers.',
        createdAt: now,
        updatedAt: now,
      },

      // FX Launch Pad
      {
        id: 'FXL-BNK-001',
        brand: 'FX Launch Pad',
        accountName: 'FinTech Corporate Treasury',
        bankName: 'Emirates NBD',
        accountNumber: '10129840291',
        ifscCode: 'EBILAEADXXX',
        branchName: 'DIFC Branch, Dubai UAE',
        upiId: '',
        accountType: 'Current',
        status: 'Active',
        notes: 'Middle East & Global FinTech licensing corporate account.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-BNK-002',
        brand: 'FX Launch Pad',
        accountName: 'USDT TRC20 Corporate Treasury',
        bankName: 'Tether TRC-20 Institutional Wallet',
        accountNumber: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        ifscCode: 'TRC-20-CHAIN',
        branchName: 'Tron Network Multicall',
        upiId: '',
        accountType: 'Crypto Wallet',
        status: 'Active',
        notes: 'Multi-sig algorithmic trading challenges and prop firm fee deposits.',
        createdAt: now,
        updatedAt: now,
      },

      // DUNS
      {
        id: 'DNS-BNK-001',
        brand: 'DUNS',
        accountName: 'Corporate Compliance Clearing',
        bankName: 'Standard Chartered Bank',
        accountNumber: '66201948291',
        ifscCode: 'SCBL0036001',
        branchName: 'Barakhamba Road, New Delhi',
        upiId: 'duns.global@sc',
        accountType: 'Current',
        status: 'Active',
        notes: 'International D-U-N-S verification and regulatory billing.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-BNK-002',
        brand: 'DUNS',
        accountName: 'Institutional Advisory A/C',
        bankName: 'State Bank of India',
        accountNumber: '33901928471',
        ifscCode: 'SBIN0000691',
        branchName: 'Parliament Street, New Delhi',
        upiId: 'duns.india@sbi',
        accountType: 'Current',
        status: 'Active',
        notes: 'Corporate intelligence and Indian compliance operations.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Payments
    this.payments = [
      {
        id: 'DDI-PAY-001',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'GST Invoice',
        bankAccountId: 'DDI-BNK-001',
        bankAccountName: 'HDFC Bank - Primary Operating Account (50200088921478)',
        paymentDate: '2025-01-20',
        dueDate: '2025-01-20',
        amountReceived: 300000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 300000,
        referenceUtr: 'HDFC98213892183',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Advance AMC payment received via NEFT.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-PAY-002',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'GST Invoice',
        bankAccountId: 'DDI-BNK-001',
        bankAccountName: 'HDFC Bank - Primary Operating Account (50200088921478)',
        paymentDate: '',
        dueDate: '2025-04-20',
        amountReceived: 150000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 150000,
        referenceUtr: 'PENDING-UTR-002',
        paymentStatus: 'Pending',
        daysOverdue: 0,
        notes: 'Final AMC installment due upon quarterly audit.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-PAY-001',
        brand: 'Codestro',
        projectId: 'CDS - FINSCALE TECHNOLOGIES - MULTI-TENANT SAAS WEB APPLICATION - 1',
        clientId: 'CDS-CL-001',
        clientName: 'FinScale Technologies Inc',
        paymentMode: 'Non GST Online',
        bankAccountId: 'CDS-BNK-002',
        bankAccountName: 'Wise Multi-Currency / SVB - Global Wire & Foreign Inward A/C (4420891204)',
        paymentDate: '2025-02-15',
        dueDate: '2025-02-15',
        amountReceived: 12000,
        currency: 'USD',
        exchangeRate: 86.5,
        amountINR: 1038000,
        referenceUtr: 'WIRE-US-991204',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'International wire transfer for Sprint 1.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-PAY-001',
        brand: 'FX Launch Pad',
        projectId: 'FXL - ALPHAEDGE QUANTITATIVE CAPITAL - METATRADER 5 PROP TRADING CHALLENGE PLATFORM - 1',
        clientId: 'FXL-CL-001',
        clientName: 'AlphaEdge Quantitative Capital',
        paymentMode: 'Crypto',
        bankAccountId: 'FXL-BNK-002',
        bankAccountName: 'Tether TRC-20 Institutional Wallet - USDT Corporate Treasury (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)',
        paymentDate: '2025-02-24',
        dueDate: '2025-02-24',
        amountReceived: 25000,
        currency: 'USDT',
        exchangeRate: 86.5,
        amountINR: 2162500,
        referenceUtr: '0x8f93a12...trc20',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Settled via USDT TRC20 wallet transfer.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-PAY-001',
        brand: 'DUNS',
        projectId: 'DNS - VERTEX GLOBAL COMPLIANCE CORP - GLOBAL BUSINESS VERIFICATION & D-U-N-S CERTIFICATION - 1',
        clientId: 'DNS-CL-001',
        clientName: 'Vertex Global Compliance Corp',
        paymentMode: 'Non GST Online',
        bankAccountId: 'DNS-BNK-001',
        bankAccountName: 'Standard Chartered Bank - Corporate Compliance Clearing (66201948291)',
        paymentDate: '2025-02-05',
        dueDate: '2025-02-05',
        amountReceived: 13872.83,
        currency: 'USD',
        exchangeRate: 86.5,
        amountINR: 1200000,
        referenceUtr: 'SWIFT-DNS-20250205',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Initial compliance onboarding retainer fee received.',
        createdAt: now,
        updatedAt: now,
      },
      // August 2026 Payments for granular report validation
      {
        id: 'DDI-PAY-003',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'GST Invoice',
        bankAccountId: 'DDI-BNK-001',
        bankAccountName: 'HDFC Bank - Primary Operating Account (50200088921478)',
        paymentDate: '2026-08-14',
        dueDate: '2026-08-14',
        amountReceived: 450000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 450000,
        referenceUtr: 'HDFC-NEFT-20260814981',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'August milestone server overhaul billing credited into HDFC.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-PAY-004',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'Non GST Online',
        bankAccountId: 'DDI-BNK-001',
        bankAccountName: 'HDFC Bank - Primary Operating Account (50200088921478)',
        paymentDate: '2026-08-22',
        dueDate: '2026-08-22',
        amountReceived: 180000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 180000,
        referenceUtr: 'HDFC-IMPS-20260822104',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Emergency motherboard repair & on-site IT support payment received in HDFC.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-PAY-005',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'Cash',
        bankAccountId: '',
        bankAccountName: '',
        paymentDate: '2026-08-08',
        dueDate: '2026-08-08',
        amountReceived: 95000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 95000,
        referenceUtr: 'CASH-RCPT-20260808-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Hardware spare parts counter cash collection.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-PAY-006',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentMode: 'Non GST Online',
        bankAccountId: 'DDI-BNK-003',
        bankAccountName: 'Razorpay / Cashfree Settlement - Online Escrow & Payment Gateway (PG-DDI-SETTLE-88)',
        paymentDate: '2026-08-29',
        dueDate: '2026-08-29',
        amountReceived: 125000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 125000,
        referenceUtr: 'UPI-RAZORPAY-2026082987',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Instant UPI settlement via payment gateway.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-PAY-002',
        brand: 'FX Launch Pad',
        projectId: 'FXL - ALPHAEDGE QUANTITATIVE CAPITAL - METATRADER 5 PROP TRADING CHALLENGE PLATFORM - 1',
        clientId: 'FXL-CL-001',
        clientName: 'AlphaEdge Quantitative Capital',
        paymentMode: 'Crypto',
        bankAccountId: 'FXL-BNK-002',
        bankAccountName: 'Tether TRC-20 Institutional Wallet - USDT Corporate Treasury (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)',
        paymentDate: '2026-08-18',
        dueDate: '2026-08-18',
        amountReceived: 18000,
        currency: 'USDT',
        exchangeRate: 86.5,
        amountINR: 1557000,
        referenceUtr: '0x3c99a818...usdt-august',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'August MT5 challenge platform evaluation fees settled in Crypto USDT.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-PAY-003',
        brand: 'FX Launch Pad',
        projectId: 'FXL - ALPHAEDGE QUANTITATIVE CAPITAL - METATRADER 5 PROP TRADING CHALLENGE PLATFORM - 1',
        clientId: 'FXL-CL-001',
        clientName: 'AlphaEdge Quantitative Capital',
        paymentMode: 'Cash',
        bankAccountId: '',
        bankAccountName: '',
        paymentDate: '2026-08-25',
        dueDate: '2026-08-25',
        amountReceived: 350000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 350000,
        referenceUtr: 'FXL-CASH-AUG2026-01',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Dubai trading seminar VIP registration cash settlement.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-PAY-002',
        brand: 'Codestro',
        projectId: 'CDS - FINSCALE TECHNOLOGIES - MULTI-TENANT SAAS WEB APPLICATION - 1',
        clientId: 'CDS-CL-001',
        clientName: 'FinScale Technologies Inc',
        paymentMode: 'GST Invoice',
        bankAccountId: 'CDS-BNK-001',
        bankAccountName: 'Axis Bank - Digital Product Operating A/C (921020054789123)',
        paymentDate: '2026-08-10',
        dueDate: '2026-08-10',
        amountReceived: 520000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 520000,
        referenceUtr: 'AXIS-NEFT-20260810-91',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'Sprint 3 React/Next.js portal development billing.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-PAY-002',
        brand: 'DUNS',
        projectId: 'DNS - VERTEX GLOBAL COMPLIANCE CORP - GLOBAL BUSINESS VERIFICATION & D-U-N-S CERTIFICATION - 1',
        clientId: 'DNS-CL-001',
        clientName: 'Vertex Global Compliance Corp',
        paymentMode: 'Non GST Online',
        bankAccountId: 'DNS-BNK-001',
        bankAccountName: 'Standard Chartered Bank - Corporate Compliance Clearing (66201948291)',
        paymentDate: '2026-08-16',
        dueDate: '2026-08-16',
        amountReceived: 10000,
        currency: 'USD',
        exchangeRate: 86.5,
        amountINR: 865000,
        referenceUtr: 'SCB-SWIFT-20260816-44',
        paymentStatus: 'Received',
        daysOverdue: 0,
        notes: 'August corporate risk KYC scoring retainer fee.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // GST Invoices
    this.gstInvoices = [
      {
        id: 'DDI-GST-001',
        brand: 'Device Doctor India',
        paymentId: 'DDI-PAY-001',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        paymentDate: '2025-01-20',
        amountReceived: 300000,
        currency: 'INR',
        amountINR: 300000,
        gstAmountINR: 54000,
        invoiceNumber: 'DDI/25-26/089',
        uploadedToGstPortal: 'Yes',
        gstPortalUploadDate: '2025-01-25',
        notes: 'Tax invoice filed under GSTR-1 for January.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Employee Roles
    this.roles = [
      {
        id: 'DDI-ROL-001',
        brand: 'Device Doctor India',
        roleName: 'Senior Hardware Systems Engineer',
        department: 'Infrastructure Operations',
        status: 'Active',
        description: 'Server diagnostics, field deployment, and board-level troubleshooting.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-ROL-001',
        brand: 'Codestro',
        roleName: 'Lead Full-Stack Developer',
        department: 'Software Engineering',
        status: 'Active',
        description: 'Modern frontend & cloud backend microservices development.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-ROL-001',
        brand: 'FX Launch Pad',
        roleName: 'Quantitative Trading Systems Architect',
        department: 'FinTech Algorithmic Systems',
        status: 'Active',
        description: 'MetaTrader MQL5, C++, and FIX API low-latency trading integrations.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-ROL-001',
        brand: 'DUNS',
        roleName: 'Compliance & Verification Lead',
        department: 'Corporate Intelligence',
        status: 'Active',
        description: 'International business validation, AML screening, and regulatory filing analysis.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Employees
    this.employees = [
      {
        id: 'DDI-EMP-001',
        brand: 'Device Doctor India',
        name: 'Amit Trivedi',
        roleId: 'DDI-ROL-001',
        email: 'amit.t@devicedoctor.in',
        status: 'Active',
        joiningDate: '2023-04-10',
        costOfEmployee: 65000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'Specialist in Dell and HP ProLiant enterprise servers.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-EMP-001',
        brand: 'Codestro',
        name: 'Priya Nair',
        roleId: 'CDS-ROL-001',
        email: 'priya.n@codestro.com',
        status: 'Active',
        joiningDate: '2023-08-15',
        costOfEmployee: 120000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'TypeScript, React, Node.js, and distributed system architect.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-EMP-001',
        brand: 'FX Launch Pad',
        name: 'Rohan Saxena',
        roleId: 'FXL-ROL-001',
        email: 'rohan.s@fxlaunchpad.com',
        status: 'Active',
        joiningDate: '2024-02-01',
        costOfEmployee: 150000,
        employeeType: 'Contract Basis',
        comesUnderTds: 'Yes',
        notes: 'Algorithmic prop firm bridge specialist.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-EMP-001',
        brand: 'DUNS',
        name: 'Arjun Mehta',
        roleId: 'DNS-ROL-001',
        email: 'arjun.m@dunscompliance.com',
        status: 'Active',
        joiningDate: '2024-01-15',
        costOfEmployee: 135000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'Senior risk auditor specializing in cross-border entity evaluation.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Assignments
    this.assignments = [
      {
        id: 'DDI-ASN-001',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        roleName: 'Senior Hardware Systems Engineer',
        assignedDate: '2025-01-20',
        workAssigned: 'Initial server cluster audit and RAID reconfiguration.',
        amount: 45000,
        amountPaid: 45000,
        paymentStatus: 'Paid',
        employeeNotes: 'Completed on schedule with zero server downtime.',
        lastNoteUpdate: now,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Employee Payments
    this.employeePayments = [
      {
        id: 'DDI-EPAY-001',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-001',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        employeeId: 'DDI-EMP-001',
        employeeName: 'Amit Trivedi',
        paymentDate: '2025-02-01',
        amountPaid: 45000,
        paymentMode: 'GST Invoice',
        referenceUtr: 'SAL-NEFT-20250201',
        notes: 'Disbursed via bank transfer.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Expense Categories
    this.expenseCategories = [
      {
        id: 'DDI-EXPCAT-001',
        brand: 'Device Doctor India',
        name: 'Cloud & Infrastructure Hosting',
        description: 'Server colocation, cloud instances, and database hosting fees.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-EXPCAT-002',
        brand: 'Device Doctor India',
        name: 'Hardware Diagnostics Tools & Spares',
        description: 'Test equipment, soldering stations, and replacement chips.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DNS-EXPCAT-001',
        brand: 'DUNS',
        name: 'Regulatory API & Intelligence Feeds',
        description: 'Subscriptions for corporate registries, KYC databases, and risk analytics APIs.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Other Expenses
    this.expenses = [
      {
        id: 'DDI-EXP-001',
        brand: 'Device Doctor India',
        projectId: 'DDI - TECHCORP INFOTECH - ENTERPRISE SERVER MAINTENANCE & AMC - 1',
        clientId: 'DDI-CL-001',
        clientName: 'TechCorp Infotech Pvt Ltd',
        expenseCategoryId: 'DDI-EXPCAT-001',
        expenseCategoryName: 'Cloud & Infrastructure Hosting',
        vendor: 'Microsoft Azure',
        description: 'Azure backup vault and hybrid storage gateway.',
        amount: 18500,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 18500,
        expenseDate: '2025-01-28',
        paymentStatus: 'Paid',
        notes: 'Billed to TechCorp AMC allocation.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    this.auditLog = [
      {
        id: this.nextAuditId++,
        brand: 'All',
        module: 'System',
        action: 'BOOTSTRAP',
        entityId: 'SYS-001',
        details: 'Device Doctor India CRM system initialized in high-availability mode.',
        performedBy: 'System',
        timestamp: now,
      },
    ];
  }

  // --- Auth & Users ---
  public getUsers(brand?: string | null): AppUser[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.users.filter((u) => u.brand === 'All' || u.brand === brand);
    }
    return [...this.users];
  }

  public saveUser(user: AppUser): AppUser {
    const idx = this.users.findIndex((u) => u.id === user.id || u.email.toLowerCase() === (user.email || '').toLowerCase());
    if (idx >= 0) {
      const existing = this.users[idx];
      this.users[idx] = {
        ...existing,
        ...user,
        password: user.password && user.password.trim() ? user.password.trim() : existing.password,
        updatedAt: new Date().toISOString(),
      };
      return this.users[idx];
    }
    const created: AppUser = {
      ...user,
      password: user.password || 'Admin@2026',
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.users.push(created);
    return created;
  }

  public deleteUser(id: string): boolean {
    const initial = this.users.length;
    this.users = this.users.filter((u) => u.id !== id);
    return this.users.length < initial;
  }

  public authenticate(email: string, pass: string): AppUser | null {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user || user.status !== 'Active') {
      return null;
    }

    if (!user.password || !pass) {
      return null;
    }

    // Strict credential check against user's stored password (no hardcoded demo fallbacks)
    const isBcrypt = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
    const passwordMatch = isBcrypt
      ? bcrypt.compareSync(pass, user.password)
      : user.password === pass;

    return passwordMatch ? user : null;
  }

  // --- Clients ---
  public getClients(brand?: string | null): Client[] {
    const list = (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)')
      ? this.clients.filter((c) => c.brand === brand)
      : this.clients;
    return list.map((c) => ({
      ...c,
      client_id: c.id,
      client_id_code: c.id,
      client_name: c.name,
      brand_id: c.brand,
    }));
  }

  public saveClient(client: Client): Client {
    if (!client.brand) client.brand = 'Device Doctor India';
    const idx = this.clients.findIndex((c) => c.id === client.id);
    if (idx >= 0) {
      this.clients[idx] = { ...this.clients[idx], ...client, updatedAt: new Date().toISOString() };
      return this.clients[idx];
    }
    const created = { ...client, createdAt: client.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.clients.unshift(created);
    return created;
  }

  public deleteClient(id: string): boolean {
    const initial = this.clients.length;
    this.clients = this.clients.filter((c) => c.id !== id);
    return this.clients.length < initial;
  }

  // --- Categories ---
  public getCategories(brand?: string | null): ServiceCategory[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.categories.filter((c) => c.brand === brand);
    }
    return [...this.categories];
  }

  public saveCategory(cat: ServiceCategory): ServiceCategory {
    if (!cat.brand) cat.brand = 'Device Doctor India';
    const idx = this.categories.findIndex((c) => c.id === cat.id);
    if (idx >= 0) {
      this.categories[idx] = { ...this.categories[idx], ...cat, updatedAt: new Date().toISOString() };
      return this.categories[idx];
    }
    const created = { ...cat, createdAt: cat.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.categories.unshift(created);
    return created;
  }

  public deleteCategory(id: string): boolean {
    const initial = this.categories.length;
    this.categories = this.categories.filter((c) => c.id !== id);
    return this.categories.length < initial;
  }

  public getServiceCategories(brand?: string | null): ServiceCategory[] {
    return this.getCategories(brand);
  }

  public saveServiceCategory(cat: ServiceCategory): ServiceCategory {
    return this.saveCategory(cat);
  }

  public deleteServiceCategory(id: string): boolean {
    return this.deleteCategory(id);
  }

  // --- Services ---
  public getServices(brand?: string | null): Service[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.services.filter((s) => s.brand === brand);
    }
    return [...this.services];
  }

  public saveService(srv: Service): Service {
    if (!srv.brand) srv.brand = 'Device Doctor India';
    const idx = this.services.findIndex((s) => s.id === srv.id);
    if (idx >= 0) {
      this.services[idx] = { ...this.services[idx], ...srv, updatedAt: new Date().toISOString() };
      return this.services[idx];
    }
    const created = { ...srv, createdAt: srv.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.services.unshift(created);
    return created;
  }

  public deleteService(id: string): boolean {
    const initial = this.services.length;
    this.services = this.services.filter((s) => s.id !== id);
    return this.services.length < initial;
  }

  // --- Projects ---
  public getProjects(brand?: string | null): Project[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.projects.filter((p) => p.brand === brand);
    }
    return [...this.projects];
  }

  public saveProject(proj: Project): Project {
    if (!proj.brand) proj.brand = 'Device Doctor India';
    const idx = this.projects.findIndex((p) => p.id === proj.id);
    if (idx >= 0) {
      this.projects[idx] = { ...this.projects[idx], ...proj, updatedAt: new Date().toISOString() };
      return this.projects[idx];
    }
    const created = { ...proj, createdAt: proj.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.projects.unshift(created);
    return created;
  }

  public deleteProject(id: string): boolean {
    const initial = this.projects.length;
    this.projects = this.projects.filter((p) => p.id !== id);
    return this.projects.length < initial;
  }

  // --- Payments ---
  public getPayments(brand?: string | null): Payment[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.payments.filter((p) => p.brand === brand);
    }
    return [...this.payments];
  }

  public savePayment(payment: Payment): Payment {
    if (!payment.brand) payment.brand = 'Device Doctor India';
    const idx = this.payments.findIndex((p) => p.id === payment.id);
    if (idx >= 0) {
      this.payments[idx] = { ...this.payments[idx], ...payment, updatedAt: new Date().toISOString() };
      return this.payments[idx];
    }
    const created = { ...payment, createdAt: payment.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.payments.unshift(created);
    return created;
  }

  public deletePayment(id: string): boolean {
    const initial = this.payments.length;
    this.payments = this.payments.filter((p) => p.id !== id);
    return this.payments.length < initial;
  }

  // --- GST Invoices ---
  public getGstInvoices(brand?: string | null): GstInvoice[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.gstInvoices.filter((i) => i.brand === brand);
    }
    return [...this.gstInvoices];
  }

  public saveGstInvoice(inv: GstInvoice): GstInvoice {
    if (!inv.brand) inv.brand = 'Device Doctor India';
    const idx = this.gstInvoices.findIndex((i) => i.id === inv.id);
    if (idx >= 0) {
      this.gstInvoices[idx] = { ...this.gstInvoices[idx], ...inv, updatedAt: new Date().toISOString() };
      return this.gstInvoices[idx];
    }
    const created = { ...inv, createdAt: inv.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.gstInvoices.unshift(created);
    return created;
  }

  public deleteGstInvoice(id: string): boolean {
    const initial = this.gstInvoices.length;
    this.gstInvoices = this.gstInvoices.filter((i) => i.id !== id);
    return this.gstInvoices.length < initial;
  }

  // --- Roles ---
  public getRoles(brand?: string | null): EmployeeRole[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.roles.filter((r) => r.brand === brand);
    }
    return [...this.roles];
  }

  public saveRole(role: EmployeeRole): EmployeeRole {
    if (!role.brand) role.brand = 'Device Doctor India';
    const idx = this.roles.findIndex((r) => r.id === role.id);
    if (idx >= 0) {
      this.roles[idx] = { ...this.roles[idx], ...role, updatedAt: new Date().toISOString() };
      return this.roles[idx];
    }
    const created = { ...role, createdAt: role.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.roles.unshift(created);
    return created;
  }

  public deleteRole(id: string): boolean {
    const initial = this.roles.length;
    this.roles = this.roles.filter((r) => r.id !== id);
    return this.roles.length < initial;
  }

  public getEmployeeRoles(brand?: string | null): EmployeeRole[] {
    return this.getRoles(brand);
  }

  public saveEmployeeRole(role: EmployeeRole): EmployeeRole {
    return this.saveRole(role);
  }

  public deleteEmployeeRole(id: string): boolean {
    return this.deleteRole(id);
  }

  // --- Employees ---
  public getEmployees(brand?: string | null): Employee[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.employees.filter((e) => e.brand === brand);
    }
    return [...this.employees];
  }

  public saveEmployee(emp: Employee): Employee {
    if (!emp.brand) emp.brand = 'Device Doctor India';
    const idx = this.employees.findIndex((e) => e.id === emp.id);
    if (idx >= 0) {
      this.employees[idx] = { ...this.employees[idx], ...emp, updatedAt: new Date().toISOString() };
      return this.employees[idx];
    }
    const created = { ...emp, createdAt: emp.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.employees.unshift(created);
    return created;
  }

  public deleteEmployee(id: string): boolean {
    const initial = this.employees.length;
    this.employees = this.employees.filter((e) => e.id !== id);
    return this.employees.length < initial;
  }

  // --- Assignments ---
  public getAssignments(brand?: string | null): Assignment[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.assignments.filter((a) => a.brand === brand);
    }
    return [...this.assignments];
  }

  public saveAssignment(asn: Assignment): Assignment {
    if (!asn.brand) asn.brand = 'Device Doctor India';
    const idx = this.assignments.findIndex((a) => a.id === asn.id);
    if (idx >= 0) {
      this.assignments[idx] = { ...this.assignments[idx], ...asn, updatedAt: new Date().toISOString() };
      return this.assignments[idx];
    }
    const created = { ...asn, createdAt: asn.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.assignments.unshift(created);
    return created;
  }

  public deleteAssignment(id: string): boolean {
    const initial = this.assignments.length;
    this.assignments = this.assignments.filter((a) => a.id !== id);
    return this.assignments.length < initial;
  }

  // --- Employee Payments ---
  public getEmployeePayments(brand?: string | null): EmployeePayment[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.employeePayments.filter((p) => p.brand === brand);
    }
    return [...this.employeePayments];
  }

  public saveEmployeePayment(payment: EmployeePayment): EmployeePayment {
    if (!payment.brand) payment.brand = 'Device Doctor India';
    const idx = this.employeePayments.findIndex((p) => p.id === payment.id);
    if (idx >= 0) {
      this.employeePayments[idx] = { ...this.employeePayments[idx], ...payment, updatedAt: new Date().toISOString() };
      return this.employeePayments[idx];
    }
    const created = { ...payment, createdAt: payment.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.employeePayments.unshift(created);
    return created;
  }

  public deleteEmployeePayment(id: string): boolean {
    const initial = this.employeePayments.length;
    this.employeePayments = this.employeePayments.filter((p) => p.id !== id);
    return this.employeePayments.length < initial;
  }

  // --- Expense Categories ---
  public getExpenseCategories(brand?: string | null): ExpenseCategory[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.expenseCategories.filter((c) => c.brand === brand);
    }
    return [...this.expenseCategories];
  }

  public saveExpenseCategory(cat: ExpenseCategory): ExpenseCategory {
    if (!cat.brand) cat.brand = 'Device Doctor India';
    const idx = this.expenseCategories.findIndex((c) => c.id === cat.id);
    if (idx >= 0) {
      this.expenseCategories[idx] = { ...this.expenseCategories[idx], ...cat, updatedAt: new Date().toISOString() };
      return this.expenseCategories[idx];
    }
    const created = { ...cat, createdAt: cat.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.expenseCategories.unshift(created);
    return created;
  }

  public deleteExpenseCategory(id: string): boolean {
    const initial = this.expenseCategories.length;
    this.expenseCategories = this.expenseCategories.filter((c) => c.id !== id);
    return this.expenseCategories.length < initial;
  }

  // --- Expenses ---
  public getExpenses(brand?: string | null): Expense[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.expenses.filter((e) => e.brand === brand);
    }
    return [...this.expenses];
  }

  public saveExpense(exp: Expense): Expense {
    if (!exp.brand) exp.brand = 'Device Doctor India';
    const idx = this.expenses.findIndex((e) => e.id === exp.id);
    if (idx >= 0) {
      this.expenses[idx] = { ...this.expenses[idx], ...exp, updatedAt: new Date().toISOString() };
      return this.expenses[idx];
    }
    const created = { ...exp, createdAt: exp.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.expenses.unshift(created);
    return created;
  }

  public deleteExpense(id: string): boolean {
    const initial = this.expenses.length;
    this.expenses = this.expenses.filter((e) => e.id !== id);
    return this.expenses.length < initial;
  }

  // --- Audit Log ---
  public getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  public addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const created: AuditLogEntry = {
      ...entry,
      id: this.nextAuditId++,
      timestamp: new Date().toISOString(),
    };
    this.auditLog.unshift(created);
    if (this.auditLog.length > 200) {
      this.auditLog.pop();
    }
    return created;
  }

  // --- Bank Accounts ---
  public getBankAccounts(brand?: string | null): BankAccount[] {
    if (!brand || brand === 'All' || brand === 'All Brands' || brand === 'All Brands (Consolidated View)') {
      return [...this.bankAccounts];
    }
    return this.bankAccounts.filter((b) => b.brand === brand);
  }

  public getBankAccountById(id: string): BankAccount | undefined {
    return this.bankAccounts.find((b) => b.id === id);
  }

  public saveBankAccount(account: BankAccount): BankAccount {
    const existingIndex = this.bankAccounts.findIndex((b) => b.id === account.id);
    const now = new Date().toISOString();
    const toSave: BankAccount = {
      ...account,
      updatedAt: now,
      createdAt: account.createdAt || now,
    };

    if (existingIndex >= 0) {
      this.bankAccounts[existingIndex] = toSave;
    } else {
      this.bankAccounts.unshift(toSave);
    }
    return toSave;
  }

  public deleteBankAccount(id: string): boolean {
    const initial = this.bankAccounts.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.bankAccounts = this.bankAccounts.filter((b) => {
      const bId = (b.id || '').trim().toLowerCase();
      if (bId === cleanId || b.id === id) return false;
      return true;
    });
    return this.bankAccounts.length < initial;
  }

  // --- Stats & Diagnostics ---
  public getTableCounts(): Record<string, number> {
    return {
      clients: this.clients.length,
      service_categories: this.categories.length,
      services: this.services.length,
      projects: this.projects.length,
      payments: this.payments.length,
      bank_accounts: this.bankAccounts.length,
      gst_invoices: this.gstInvoices.length,
      employee_roles: this.roles.length,
      employees: this.employees.length,
      assignments: this.assignments.length,
      employee_payments: this.employeePayments.length,
      expense_categories: this.expenseCategories.length,
      other_expenses: this.expenses.length,
      app_users: this.users.length,
      crm_audit_log: this.auditLog.length,
    };
  }

  public clearDemo(): { remainingUsers: AppUser[]; clearedTables: string[] } {
    this.clients = [];
    this.categories = [];
    this.services = [];
    this.projects = [];
    this.payments = [];
    this.bankAccounts = [];
    this.gstInvoices = [];
    this.roles = [];
    this.employees = [];
    this.assignments = [];
    this.employeePayments = [];
    this.expenseCategories = [];
    this.expenses = [];
    this.auditLog = [];

    // Keep primary admin accounts
    this.users = this.users.filter(
      (u) =>
        u.email.toLowerCase() === 'rathorehemant114@gmail.com' ||
        u.email.toLowerCase() === 'devicedoctorindia.in@gmail.com'
    );

    return {
      remainingUsers: this.users,
      clearedTables: [
        'employee_payments',
        'assignments',
        'other_expenses',
        'expense_categories',
        'employees',
        'employee_roles',
        'gst_invoices',
        'payments',
        'bank_accounts',
        'projects',
        'services',
        'service_categories',
        'clients',
        'crm_audit_log',
      ],
    };
  }
}

export const mockStore = new MockStore();
