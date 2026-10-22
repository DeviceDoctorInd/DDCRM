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
import {
  getBrandSemanticPrefix,
  slugifySemantic,
  generateSemanticClientId,
  generateSemanticProjectId,
  extractProjectSequence,
  getBaseProjectPrefix,
  generateSemanticEntityId,
} from '../utils/semanticId';

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
        id: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        id: 'DDI-APOLLO-DIAGNOSTICS-CENTRE',
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
        id: 'DDI-RELIANCE-DIGITAL-INFRASTRUCTURE',
        brand: 'Device Doctor India',
        name: 'Reliance Digital Infrastructure Corp',
        contactPerson: 'Vikram Singhania',
        phone: '+91 98220 98765',
        email: 'infra.procure@reliancedigital.com',
        city: 'Navi Mumbai',
        country: 'India',
        gstNumber: '27AAACR1234F1ZV',
        preferredCurrency: 'INR',
        clientSince: '2024-03-12',
        status: 'Active',
        notes: 'Corporate datacentre server deployment and 24x7 hardware SLA.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-TATA-CONSULTANCY-SERVICES-ALLIED',
        brand: 'Device Doctor India',
        name: 'Tata Consultancy Services Allied Partner',
        contactPerson: 'Priyanka Sen',
        phone: '+91 97110 45678',
        email: 'partnerships@tataallied.in',
        city: 'Kolkata',
        country: 'India',
        gstNumber: '19AAACT9876D1Z2',
        preferredCurrency: 'INR',
        clientSince: '2024-07-01',
        status: 'Active',
        notes: 'Enterprise web applications and hybrid cloud migration.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-HDFC-SECURITIES-SYSTEMS-LTD',
        brand: 'Device Doctor India',
        name: 'HDFC Securities Systems Ltd',
        contactPerson: 'Sanjay Malhotra',
        phone: '+91 98199 11223',
        email: 'trading.it@hdfcsec.com',
        city: 'Mumbai',
        country: 'India',
        gstNumber: '27AAACH4567J1Z8',
        preferredCurrency: 'INR',
        clientSince: '2024-11-15',
        status: 'Active',
        notes: 'Cybersecurity vulnerability audit and high-throughput server AMC.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-FINSCALE-TECHNOLOGIES-INC',
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
        id: 'CDS-NEXUS-CLOUD-ANALYTICS',
        brand: 'Codestro',
        name: 'Nexus Cloud Analytics Corp',
        contactPerson: 'Oliver Barnes',
        phone: '+1 206 555 8920',
        email: 'oliver@nexuscloud.io',
        city: 'Seattle',
        country: 'United States',
        gstNumber: '',
        preferredCurrency: 'USD',
        clientSince: '2025-01-08',
        status: 'Active',
        notes: 'AI analytics microservices, streaming pipelines, and dashboard portals.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL',
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
        id: 'FXL-ZENITH-PROPRIETARY-TRADING',
        brand: 'FX Launch Pad',
        name: 'Zenith Proprietary Trading LLC',
        contactPerson: 'Tariq Al-Mansoor',
        phone: '+971 4 312 8900',
        email: 'tariq@zenithprop.ae',
        city: 'Dubai',
        country: 'United Arab Emirates',
        gstNumber: '',
        preferredCurrency: 'USD',
        clientSince: '2025-02-01',
        status: 'Active',
        notes: 'Automated evaluation accounts, trader challenge engine, and risk rules.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP',
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
      {
        id: 'DUNS-APEX-RISK-INTELLIGENCE-GROUP',
        brand: 'DUNS',
        name: 'Apex Risk Intelligence Group',
        contactPerson: 'Elena Rostova',
        phone: '+41 22 555 3410',
        email: 'elena.r@apexrisk.ch',
        city: 'Geneva',
        country: 'Switzerland',
        gstNumber: '',
        preferredCurrency: 'EUR',
        clientSince: '2025-01-25',
        status: 'Active',
        notes: 'European cross-border sanctions screening and continuous corporate risk monitoring.',
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
        id: 'DDI-CAT-003',
        brand: 'Device Doctor India',
        name: 'Custom Web & Mobile App Engineering',
        description: 'Enterprise React web portals, cross-platform mobile applications, and API systems.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-CAT-004',
        brand: 'Device Doctor India',
        name: 'Enterprise Cybersecurity & Vulnerability Auditing',
        description: 'Penetration testing, network vulnerability assessments, and compliance hardening.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-CAT-005',
        brand: 'Device Doctor India',
        name: 'Industrial IoT & Embedded Systems Maintenance',
        description: 'Smart telemetry, edge gateway provisioning, and preventative device telemetry.',
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
        id: 'CDS-CAT-002',
        brand: 'Codestro',
        name: 'AI/ML Agents & LLM Fine-Tuning',
        description: 'Autonomous AI workflow agents, retrieval augmented generation, and embeddings.',
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
        id: 'FXL-CAT-002',
        brand: 'FX Launch Pad',
        name: 'High-Frequency Trading Infrastructure',
        description: 'Ultra-low latency FIX protocol bridges, market data feeds, and colocation routers.',
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
      {
        id: 'DNS-CAT-002',
        brand: 'DUNS',
        name: 'AML Risk Analytics & Regulatory Auditing',
        description: 'Cross-border entity verification, sanctions screening, and corporate compliance certification.',
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
        id: 'DDI-SRV-002',
        brand: 'Device Doctor India',
        name: 'Hybrid Cloud Architecture & AWS/Azure Migration',
        categoryId: 'DDI-CAT-002',
        description: 'Cloud modernization, virtual network peering, and high-availability database replication.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-SRV-003',
        brand: 'Device Doctor India',
        name: 'Full-Stack Web Platform Development',
        categoryId: 'DDI-CAT-003',
        description: 'React, Vite, Node.js and TypeScript custom CRM, ERP, and customer portals.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-SRV-004',
        brand: 'Device Doctor India',
        name: 'Corporate Penetration Testing & Zero-Day Patching',
        categoryId: 'DDI-CAT-004',
        description: 'Black-box and white-box security audits, vulnerability scans, and remediation support.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-SRV-005',
        brand: 'Device Doctor India',
        name: 'Smart IoT Edge Gateway Deployment',
        categoryId: 'DDI-CAT-005',
        description: 'Edge device firmware updates, telemetry streaming, and MQTT message brokers.',
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
        id: 'CDS-SRV-002',
        brand: 'Codestro',
        name: 'Autonomous Generative AI Workflow Integration',
        categoryId: 'CDS-CAT-002',
        description: 'Context-grounded AI agent pipelines, vector search, and conversational UI layers.',
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
        id: 'FXL-SRV-002',
        brand: 'FX Launch Pad',
        name: 'Ultra-Low Latency FIX Protocol Broker Engine',
        categoryId: 'FXL-CAT-002',
        description: 'Direct market access order routing, DMA bridge, and liquidity provider feeds.',
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
      {
        id: 'DNS-SRV-002',
        brand: 'DUNS',
        name: 'Continuous Regulatory Compliance & Sanctions Screening',
        categoryId: 'DNS-CAT-002',
        description: 'Real-time sanctions watchlists, Politically Exposed Persons (PEP) checks, and AML logs.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Projects
    this.projects = [
      {
        id: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        brand: 'Device Doctor India',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        id: 'DDI-APOLLO-DIAGNOSTICS-CENTRE-HYBRID-CLOUD-ARCHITECTURE-AWS-AZURE-MIGRATION-1',
        brand: 'Device Doctor India',
        clientId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE',
        clientName: 'Apollo Diagnostics Centre',
        serviceId: 'DDI-SRV-002',
        proposalDate: '2025-01-10',
        contractDate: '2025-01-18',
        startDate: '2025-01-22',
        committedDays: 60,
        committedEndDate: '2025-03-23',
        actualEndDate: '',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 680000,
        exchangeRate: 1,
        contractValue: 680000,
        totalReceived: 400000,
        balance: 280000,
        projectManager: 'Karthik Rao',
        notes: 'HIPAA and NABH compliant cloud PACS storage migration with disaster recovery vault.',
        proposalDocument: { name: 'Apollo_Cloud_Migration_Architecture.pdf', uploadedAt: now },
        contractDocument: { name: 'Apollo_SLA_Signed.pdf', uploadedAt: now },
        paymentPhases: [
          { id: 'ap-1', name: 'Cloud Discovery & Setup', percentage: 58.82, amount: 400000, amountINR: 400000, dueDate: '2025-01-22', status: 'Received' },
          { id: 'ap-2', name: 'PACS Data Cutover & Sign-off', percentage: 41.18, amount: 280000, amountINR: 280000, dueDate: '2025-03-23', status: 'Pending' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-RELIANCE-DIGITAL-INFRASTRUCTURE-FULL-STACK-WEB-PLATFORM-DEVELOPMENT-1',
        brand: 'Device Doctor India',
        clientId: 'DDI-RELIANCE-DIGITAL-INFRASTRUCTURE',
        clientName: 'Reliance Digital Infrastructure Corp',
        serviceId: 'DDI-SRV-003',
        proposalDate: '2025-01-12',
        contractDate: '2025-01-20',
        startDate: '2025-01-25',
        committedDays: 90,
        committedEndDate: '2025-04-25',
        actualEndDate: '',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 1250000,
        exchangeRate: 1,
        contractValue: 1250000,
        totalReceived: 750000,
        balance: 500000,
        projectManager: 'Hemant Rathore',
        notes: 'Enterprise vendor procurement portal with custom RBAC and GST calculation engine.',
        proposalDocument: { name: 'Reliance_Portal_Proposal.pdf', uploadedAt: now },
        contractDocument: { name: 'Reliance_Master_Agreement.pdf', uploadedAt: now },
        paymentPhases: [
          { id: 'rel-1', name: 'Advance Milestone', percentage: 60, amount: 750000, amountINR: 750000, dueDate: '2025-01-25', status: 'Received' },
          { id: 'rel-2', name: 'Final Delivery & Acceptance', percentage: 40, amount: 500000, amountINR: 500000, dueDate: '2025-04-25', status: 'Pending' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-HDFC-SECURITIES-SYSTEMS-LTD-CORPORATE-PENETRATION-TESTING-ZERO-DAY-PATCHING-1',
        brand: 'Device Doctor India',
        clientId: 'DDI-HDFC-SECURITIES-SYSTEMS-LTD',
        clientName: 'HDFC Securities Systems Ltd',
        serviceId: 'DDI-SRV-004',
        proposalDate: '2025-01-28',
        contractDate: '2025-02-02',
        startDate: '2025-02-05',
        committedDays: 30,
        committedEndDate: '2025-03-07',
        actualEndDate: '',
        status: 'In Progress',
        paymentMode: 'GST Invoice',
        currency: 'INR',
        contract: 520000,
        exchangeRate: 1,
        contractValue: 520000,
        totalReceived: 260000,
        balance: 260000,
        projectManager: 'Karthik Rao',
        notes: 'SEBI compliance cyber audit, perimeter vulnerability assessment, and hardening.',
        paymentPhases: [
          { id: 'hdfc-1', name: 'Pre-Audit Retainer', percentage: 50, amount: 260000, amountINR: 260000, dueDate: '2025-02-05', status: 'Received' },
          { id: 'hdfc-2', name: 'Vulnerability Remediation Report', percentage: 50, amount: 260000, amountINR: 260000, dueDate: '2025-03-07', status: 'Pending' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'CDS-FINSCALE-TECHNOLOGIES-INC-MULTI-TENANT-SAAS-WEB-APPLICATION-1',
        brand: 'Codestro',
        clientId: 'CDS-FINSCALE-TECHNOLOGIES-INC',
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
        id: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL-METATRADER-5-PROP-TRADING-CHALLENGE-PLATFORM-1',
        brand: 'FX Launch Pad',
        clientId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL',
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
        id: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP-GLOBAL-BUSINESS-VERIFICATION-D-U-N-S-CERTIFICATION-1',
        brand: 'DUNS',
        clientId: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        projectId: 'CDS-FINSCALE-TECHNOLOGIES-INC-MULTI-TENANT-SAAS-WEB-APPLICATION-1',
        clientId: 'CDS-FINSCALE-TECHNOLOGIES-INC',
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
        projectId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL-METATRADER-5-PROP-TRADING-CHALLENGE-PLATFORM-1',
        clientId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL',
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
        projectId: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP-GLOBAL-BUSINESS-VERIFICATION-D-U-N-S-CERTIFICATION-1',
        clientId: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        projectId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL-METATRADER-5-PROP-TRADING-CHALLENGE-PLATFORM-1',
        clientId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL',
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
        projectId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL-METATRADER-5-PROP-TRADING-CHALLENGE-PLATFORM-1',
        clientId: 'FXL-ALPHAEDGE-QUANTITATIVE-CAPITAL',
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
        projectId: 'CDS-FINSCALE-TECHNOLOGIES-INC-MULTI-TENANT-SAAS-WEB-APPLICATION-1',
        clientId: 'CDS-FINSCALE-TECHNOLOGIES-INC',
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
        projectId: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP-GLOBAL-BUSINESS-VERIFICATION-D-U-N-S-CERTIFICATION-1',
        clientId: 'DUNS-VERTEX-GLOBAL-COMPLIANCE-CORP',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
        id: 'DDI-ROL-002',
        brand: 'Device Doctor India',
        roleName: 'Senior Cloud & DevOps Engineer',
        department: 'Cloud Services',
        status: 'Active',
        description: 'AWS and Azure cloud migration, Docker containers, and CI/CD pipelines.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-ROL-003',
        brand: 'Device Doctor India',
        roleName: 'Full-Stack Web Development Specialist',
        department: 'Software Engineering',
        status: 'Active',
        description: 'React, Vite, Node.js and TypeScript custom CRM, ERP, and API systems.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-ROL-004',
        brand: 'Device Doctor India',
        roleName: 'Cybersecurity & Network Penetration Tester',
        department: 'Information Security',
        status: 'Active',
        description: 'Vulnerability assessment, ethical hacking, and network hardening.',
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
        id: 'DDI-EMP-002',
        brand: 'Device Doctor India',
        name: 'Vikram Batra',
        roleId: 'DDI-ROL-002',
        email: 'vikram.b@devicedoctor.in',
        status: 'Active',
        joiningDate: '2023-09-01',
        costOfEmployee: 85000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'Specialist in Azure Virtual Networks and Kubernetes clusters.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-EMP-003',
        brand: 'Device Doctor India',
        name: 'Sneha Kulkarni',
        roleId: 'DDI-ROL-003',
        email: 'sneha.k@devicedoctor.in',
        status: 'Active',
        joiningDate: '2024-01-15',
        costOfEmployee: 75000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'Senior React and TypeScript full-stack developer.',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-EMP-004',
        brand: 'Device Doctor India',
        name: 'Rahul Deshmukh',
        roleId: 'DDI-ROL-004',
        email: 'rahul.d@devicedoctor.in',
        status: 'Active',
        joiningDate: '2024-03-20',
        costOfEmployee: 90000,
        employeeType: 'Salary Basis',
        comesUnderTds: 'Yes',
        notes: 'Certified ethical hacker (CEH) and CISSP consultant.',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
      {
        id: 'DDI-ASN-002',
        brand: 'Device Doctor India',
        projectId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE-HYBRID-CLOUD-ARCHITECTURE-AWS-AZURE-MIGRATION-1',
        clientId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE',
        clientName: 'Apollo Diagnostics Centre',
        employeeId: 'DDI-EMP-002',
        employeeName: 'Vikram Batra',
        roleName: 'Senior Cloud & DevOps Engineer',
        assignedDate: '2025-01-22',
        workAssigned: 'PACS cloud architecture setup and hybrid VPN routing configuration.',
        amount: 55000,
        amountPaid: 55000,
        paymentStatus: 'Paid',
        employeeNotes: 'Configured HIPAA compliant VPN tunnels and storage buckets.',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
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
      {
        id: 'DDI-EPAY-002',
        brand: 'Device Doctor India',
        assignmentId: 'DDI-ASN-002',
        projectId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE-HYBRID-CLOUD-ARCHITECTURE-AWS-AZURE-MIGRATION-1',
        employeeId: 'DDI-EMP-002',
        employeeName: 'Vikram Batra',
        paymentDate: '2025-02-15',
        amountPaid: 55000,
        paymentMode: 'Non GST Online',
        referenceUtr: 'SAL-NEFT-20250215-VB',
        notes: 'Disbursed via NEFT salary credit.',
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
        id: 'DDI-EXPCAT-003',
        brand: 'Device Doctor India',
        name: 'Software Licenses & Developer Subscriptions',
        description: 'IDEs, API gateways, security scanning suites, and cloud toolkits.',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'DDI-EXPCAT-004',
        brand: 'Device Doctor India',
        name: 'Office Operations & Client Travel',
        description: 'Onsite engineer client visits, logistics, and datacenter access passes.',
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
        projectId: 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1',
        clientId: 'DDI-TECHCORP-INFOTECH-PVT-LTD',
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
      {
        id: 'DDI-EXP-002',
        brand: 'Device Doctor India',
        projectId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE-HYBRID-CLOUD-ARCHITECTURE-AWS-AZURE-MIGRATION-1',
        clientId: 'DDI-APOLLO-DIAGNOSTICS-CENTRE',
        clientName: 'Apollo Diagnostics Centre',
        expenseCategoryId: 'DDI-EXPCAT-003',
        expenseCategoryName: 'Software Licenses & Developer Subscriptions',
        vendor: 'Datadog & New Relic',
        description: 'APM monitoring and infrastructure metrics agent licenses.',
        amount: 14200,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 14200,
        expenseDate: '2025-02-10',
        paymentStatus: 'Paid',
        notes: 'Allocated to Apollo Diagnostics cloud infrastructure.',
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

  public deleteUser(id: string, brand?: string | null): boolean {
    const initial = this.users.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.users = this.users.filter((u) => {
      const uId = (u.id || '').trim().toLowerCase();
      const uEmail = (u.email || '').trim().toLowerCase();
      const matches = uId === cleanId || uEmail === cleanId || u.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (u.brand && u.brand !== 'All' && u.brand !== brand) return true;
      }
      return false;
    });
    return this.users.length < initial;
  }

  public authenticate(identifier: string, pass: string): AppUser | null {
    const cleanIdentifier = (identifier || '').trim().toLowerCase();
    const cleanPass = (pass || '').trim();
    const user = this.users.find(
      (u) =>
        (u.email || '').toLowerCase() === cleanIdentifier ||
        (u.id || '').toLowerCase() === cleanIdentifier ||
        (u.name || '').toLowerCase() === cleanIdentifier
    );
    if (!user || user.status !== 'Active') {
      return null;
    }

    if (!user.password || !cleanPass) {
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

  public getClientById(id: string): Client | undefined {
    return this.clients.find((c) => c.id === id || (c as any).client_id === id || (c as any).client_id_code === id);
  }

  public getNextClientId(brand: string, clientName: string): string {
    const baseId = generateSemanticClientId(brand, clientName);
    const existing = this.clients.filter((c) => c.id === baseId || c.id.startsWith(`${baseId}-`));
    if (existing.length === 0) {
      return baseId;
    }
    let maxSeq = 1;
    for (const c of existing) {
      if (c.id === baseId) continue;
      const numMatch = c.id.match(new RegExp(`^${baseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
      if (numMatch && numMatch[1]) {
        const seq = parseInt(numMatch[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return `${baseId}-${maxSeq + 1}`;
  }

  public saveClient(client: Client): Client {
    if (!client.brand) client.brand = 'Device Doctor India';
    const idx = client.id ? this.clients.findIndex((c) => c.id === client.id) : -1;
    if (idx >= 0) {
      this.clients[idx] = { ...this.clients[idx], ...client, updatedAt: new Date().toISOString() };
      return this.clients[idx];
    }

    // Auto-generate semantic client ID if missing
    if (!client.id) {
      client.id = this.getNextClientId(client.brand, client.name);
    }

    const created = { ...client, createdAt: client.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.clients.unshift(created);
    return created;
  }

  public deleteClient(id: string, brand?: string | null): boolean {
    const initial = this.clients.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.clients = this.clients.filter((c) => {
      const cId = (c.id || '').trim().toLowerCase();
      const codeId = ((c as any).client_id_code || '').trim().toLowerCase();
      const matches = cId === cleanId || codeId === cleanId || c.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (c.brand && c.brand !== brand) return true; // keep, belongs to another brand
      }
      return false;
    });
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
    const cleanId = (cat.id || '').trim();
    const idx = cleanId ? this.categories.findIndex((c) => c.id === cleanId) : -1;
    if (idx >= 0) {
      this.categories[idx] = { ...this.categories[idx], ...cat, id: cleanId, updatedAt: new Date().toISOString() };
      return this.categories[idx];
    }
    const finalId = cleanId || generateSemanticEntityId('CAT', cat.brand, this.categories);
    const created: ServiceCategory = { ...cat, id: finalId, createdAt: cat.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.categories.unshift(created);
    return created;
  }

  public deleteCategory(id: string, brand?: string | null): boolean {
    const initial = this.categories.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.categories = this.categories.filter((c) => {
      const cId = (c.id || '').trim().toLowerCase();
      const codeId = ((c as any).category_id_code || '').trim().toLowerCase();
      const guidId = ((c as any).guid || '').trim().toLowerCase();
      const matches = cId === cleanId || codeId === cleanId || guidId === cleanId || c.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (c.brand && c.brand !== brand) return true;
      }
      return false;
    });
    return this.categories.length < initial;
  }

  public getServiceCategories(brand?: string | null): ServiceCategory[] {
    return this.getCategories(brand);
  }

  public saveServiceCategory(cat: ServiceCategory): ServiceCategory {
    return this.saveCategory(cat);
  }

  public deleteServiceCategory(id: string, brand?: string | null): boolean {
    return this.deleteCategory(id, brand);
  }

  // --- Services ---
  public getServices(brand?: string | null): Service[] {
    const list = (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)')
      ? this.services.filter((s) => s.brand === brand)
      : [...this.services];

    return list.map((s) => {
      const cat = this.categories.find(
        (c) => c.id === s.categoryId || (c as any).guid === s.categoryId || (c as any).category_id_code === s.categoryId
      );
      const categoryName = cat ? cat.name : (s.categoryName || s.category_name || '');
      return {
        ...s,
        categoryName,
        category_name: categoryName,
      };
    });
  }

  public saveService(srv: Service): Service {
    if (!srv.brand) srv.brand = 'Device Doctor India';
    const cleanId = (srv.id || '').trim();

    // Relational join with categories in-memory
    const cat = this.categories.find(
      (c) => c.id === srv.categoryId || (c as any).guid === srv.categoryId || (c as any).category_id_code === srv.categoryId
    );
    if (cat) {
      srv.categoryName = cat.name;
      srv.category_name = cat.name;
    }

    const idx = cleanId ? this.services.findIndex((s) => s.id === cleanId) : -1;
    if (idx >= 0) {
      this.services[idx] = { ...this.services[idx], ...srv, id: cleanId, updatedAt: new Date().toISOString() };
      return this.services[idx];
    }
    const finalId = cleanId || generateSemanticEntityId('SRV', srv.brand, this.services);
    const created: Service = { ...srv, id: finalId, createdAt: srv.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.services.unshift(created);
    return created;
  }

  public deleteService(id: string, brand?: string | null): boolean {
    const initial = this.services.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.services = this.services.filter((s) => {
      const sId = (s.id || '').trim().toLowerCase();
      const codeId = ((s as any).service_id_code || '').trim().toLowerCase();
      const guidId = ((s as any).guid || '').trim().toLowerCase();
      const matches = sId === cleanId || codeId === cleanId || guidId === cleanId || s.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (s.brand && s.brand !== brand) return true;
      }
      return false;
    });
    return this.services.length < initial;
  }

  // --- Projects ---
  public getProjects(brand?: string | null): Project[] {
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.projects.filter((p) => p.brand === brand);
    }
    return [...this.projects];
  }

  public getNextProjectSequence(
    brand: string,
    clientName: string,
    serviceName: string,
    clientId?: string,
    serviceId?: string
  ): number {
    const basePrefix = getBaseProjectPrefix(brand, clientName, serviceName);
    const matching = this.projects.filter((p) => {
      const matchPrefix = p.id.startsWith(basePrefix);
      const matchClientAndService =
        clientId && serviceId && p.clientId === clientId && p.serviceId === serviceId;
      return matchPrefix || matchClientAndService;
    });

    let maxSeq = 0;
    for (const p of matching) {
      const seq = extractProjectSequence(p.id, basePrefix);
      if (seq !== null && seq > maxSeq) {
        maxSeq = seq;
      }
    }
    return maxSeq + 1;
  }

  public generateSemanticProjectId(
    brand: string,
    clientName: string,
    serviceName: string,
    clientId?: string,
    serviceId?: string
  ): string {
    const seq = this.getNextProjectSequence(brand, clientName, serviceName, clientId, serviceId);
    return generateSemanticProjectId(brand, clientName, serviceName, seq);
  }

  public saveProject(proj: Project): Project {
    if (!proj.brand) proj.brand = 'Device Doctor India';
    const idx = proj.id ? this.projects.findIndex((p) => p.id === proj.id) : -1;
    if (idx >= 0) {
      this.projects[idx] = { ...this.projects[idx], ...proj, updatedAt: new Date().toISOString() };
      return this.projects[idx];
    }

    // Auto-generate semantic project ID with sequence counter if missing
    if (!proj.id) {
      const clientName = proj.clientName || this.getClientById(proj.clientId)?.name || 'CLIENT';
      const serviceName = (proj as any).serviceName || (proj as any).serviceType || this.getServices().find((s) => s.id === proj.serviceId)?.name || 'SERVICE';
      proj.id = this.generateSemanticProjectId(
        proj.brand,
        clientName,
        serviceName,
        proj.clientId,
        proj.serviceId
      );
    }

    const created = { ...proj, createdAt: proj.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.projects.unshift(created);
    return created;
  }

  public getProjectById(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id);
  }

  public deleteProject(id: string, brand?: string | null): boolean {
    const initial = this.projects.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.projects = this.projects.filter((p) => {
      const pId = (p.id || '').trim().toLowerCase();
      const codeId = ((p as any).project_id_code || '').trim().toLowerCase();
      const matches = pId === cleanId || codeId === cleanId || p.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (p.brand && p.brand !== brand) return true;
      }
      return false;
    });
    return this.projects.length < initial;
  }

  // --- Payments ---
  public getPayments(brand?: string | null): Payment[] {
    let list = this.payments;
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      list = this.payments.filter((p) => p.brand === brand);
    }
    return list.map((p) => ({
      ...p,
      paymentProof: p.paymentProof ? JSON.parse(JSON.stringify(p.paymentProof)) : undefined,
    }));
  }

  public savePayment(payment: Payment): Payment {
    if (!payment.brand) payment.brand = 'Device Doctor India';
    const cleanId = (payment.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('PAY', payment.brand, this.payments);
    const clonedPayment: Payment = {
      ...payment,
      id: finalId,
      paymentProof: payment.paymentProof ? JSON.parse(JSON.stringify(payment.paymentProof)) : undefined,
    };
    const idx = cleanId ? this.payments.findIndex((p) => p.id === cleanId) : -1;
    let resultPayment: Payment;
    if (idx >= 0) {
      this.payments[idx] = { ...this.payments[idx], ...clonedPayment, id: finalId, updatedAt: new Date().toISOString() };
      resultPayment = JSON.parse(JSON.stringify(this.payments[idx]));
    } else {
      const created = { ...clonedPayment, id: finalId, createdAt: clonedPayment.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      this.payments.unshift(created);
      resultPayment = JSON.parse(JSON.stringify(created));
    }

    // Auto-sync into GST Invoices module if payment mode is 'GST Invoice'
    if (resultPayment.paymentMode === 'GST Invoice') {
      this.syncPaymentToGstInvoice(resultPayment);
    }

    return resultPayment;
  }

  public deletePayment(id: string, brand?: string | null): boolean {
    const initial = this.payments.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.payments = this.payments.filter((p) => {
      const pId = (p.id || '').trim().toLowerCase();
      const codeId = ((p as any).payment_id_code || '').trim().toLowerCase();
      const matches = pId === cleanId || codeId === cleanId || p.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (p.brand && p.brand !== brand) return true;
      }
      return false;
    });
    // Remove unfiled synced GST invoice linked to deleted payment
    this.gstInvoices = this.gstInvoices.filter(
      (inv) => {
        const invPayId = (inv.paymentId || '').trim().toLowerCase();
        if (invPayId === cleanId || inv.paymentId === id) {
          return inv.uploadedToGstPortal === 'Yes';
        }
        return true;
      }
    );
    return this.payments.length < initial;
  }

  // --- GST Invoices ---
  public getNextGstInvoiceSequence(brand?: string | null): number {
    const prefix = getBrandSemanticPrefix(brand);
    const pattern = new RegExp(`^${prefix}-GST-(\\d+)`, 'i');
    let max = 0;
    for (const inv of this.gstInvoices) {
      const match = (inv.id || '').match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max + 1;
  }

  public syncPaymentToGstInvoice(payment: Payment): GstInvoice | null {
    if (payment.paymentMode !== 'GST Invoice') {
      return null;
    }

    const brand = payment.brand || 'Device Doctor India';
    const amountReceived = Number(payment.amountReceived) || 0;
    const currency = payment.currency || 'INR';
    const amountINR = Number(payment.amountINR) || Number(payment.amountReceived) || 0;
    const gstAmountINR = Math.round(amountINR * 0.18);
    const paymentDate = payment.paymentDate || new Date().toISOString().slice(0, 10);

    // Resolve client details from linked project if missing
    let clientName = payment.clientName || '';
    let clientId = payment.clientId || '';
    if ((!clientName || !clientId) && payment.projectId) {
      const proj = this.projects.find((p) => p.id === payment.projectId);
      if (proj) {
        clientName = clientName || proj.clientName;
        clientId = clientId || proj.clientId;
      }
    }

    const year = new Date(paymentDate).getFullYear() || new Date().getFullYear();
    const cleanPaySuffix = (payment.id || '').replace(/^([A-Z]+-)?(PAY-)?/i, '') || '001';
    const defaultInvoiceNum = `INV-${year}-${cleanPaySuffix}`;

    const existingIdx = this.gstInvoices.findIndex(
      (inv) => inv.paymentId === payment.id || (payment.id && inv.paymentId === payment.id)
    );

    if (existingIdx >= 0) {
      const existing = this.gstInvoices[existingIdx];
      const updated: GstInvoice = {
        ...existing,
        brand: brand as any,
        projectId: payment.projectId || existing.projectId || '',
        clientId: clientId || existing.clientId || '',
        clientName: clientName || existing.clientName || 'Direct Client',
        paymentDate,
        amountReceived,
        currency: currency as any,
        amountINR,
        gstAmountINR,
        invoiceNumber:
          existing.invoiceNumber && existing.invoiceNumber.trim() !== ''
            ? existing.invoiceNumber
            : defaultInvoiceNum,
        updatedAt: new Date().toISOString(),
      };
      this.gstInvoices[existingIdx] = updated;
      return JSON.parse(JSON.stringify(updated));
    } else {
      const prefix = getBrandSemanticPrefix(brand);
      const nextSeq = this.getNextGstInvoiceSequence(brand);
      const seqStr = String(nextSeq).padStart(3, '0');
      const gstId = `${prefix}-GST-${seqStr}`;

      const newInv: GstInvoice = {
        id: gstId,
        brand: brand as any,
        paymentId: payment.id,
        projectId: payment.projectId || '',
        clientId: clientId || '',
        clientName: clientName || 'Direct Client',
        paymentDate,
        amountReceived,
        currency: currency as any,
        amountINR,
        gstAmountINR,
        invoiceNumber: defaultInvoiceNum,
        uploadedToGstPortal: 'No',
        gstPortalUploadDate: '',
        notes: payment.notes
          ? `Auto-synced from Payment ${payment.id} (GST Invoice Mode). ${payment.notes}`
          : `Auto-synced from Payment ${payment.id} (GST Invoice Mode)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.gstInvoices.unshift(newInv);
      return JSON.parse(JSON.stringify(newInv));
    }
  }

  public syncAllGstInvoicesFromPayments(): { count: number; invoices: GstInvoice[] } {
    let count = 0;
    for (const p of this.payments) {
      if (p.paymentMode === 'GST Invoice') {
        const synced = this.syncPaymentToGstInvoice(p);
        if (synced) count++;
      }
    }
    return { count, invoices: [...this.gstInvoices] };
  }

  public getGstInvoices(brand?: string | null): GstInvoice[] {
    // Run self-healing sync so any GST invoice payments are reflected
    for (const p of this.payments) {
      if (p.paymentMode === 'GST Invoice') {
        if (!this.gstInvoices.some((inv) => inv.paymentId === p.id)) {
          this.syncPaymentToGstInvoice(p);
        }
      }
    }
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      return this.gstInvoices.filter((i) => i.brand === brand);
    }
    return [...this.gstInvoices];
  }

  public saveGstInvoice(inv: GstInvoice): GstInvoice {
    if (!inv.brand) inv.brand = 'Device Doctor India';
    const cleanId = (inv.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('GST', inv.brand, this.gstInvoices);
    const idx = cleanId ? this.gstInvoices.findIndex((i) => i.id === cleanId) : -1;
    if (idx >= 0) {
      this.gstInvoices[idx] = { ...this.gstInvoices[idx], ...inv, id: finalId, updatedAt: new Date().toISOString() };
      return this.gstInvoices[idx];
    }
    const created: GstInvoice = { ...inv, id: finalId, createdAt: inv.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.gstInvoices.unshift(created);
    return created;
  }

  public deleteGstInvoice(id: string, brand?: string | null): boolean {
    const initial = this.gstInvoices.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.gstInvoices = this.gstInvoices.filter((i) => {
      const iId = (i.id || '').trim().toLowerCase();
      const codeId = ((i as any).invoice_id_code || '').trim().toLowerCase();
      const matches = iId === cleanId || codeId === cleanId || i.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (i.brand && i.brand !== brand) return true;
      }
      return false;
    });
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
    const cleanId = (role.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('ROL', role.brand, this.roles);
    const idx = cleanId ? this.roles.findIndex((r) => r.id === cleanId) : -1;
    if (idx >= 0) {
      this.roles[idx] = { ...this.roles[idx], ...role, id: finalId, updatedAt: new Date().toISOString() };
      return this.roles[idx];
    }
    const created: EmployeeRole = { ...role, id: finalId, createdAt: role.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.roles.unshift(created);
    return created;
  }

  public deleteRole(id: string, brand?: string | null): boolean {
    const initial = this.roles.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.roles = this.roles.filter((r) => {
      const rId = (r.id || '').trim().toLowerCase();
      const codeId = ((r as any).role_id_code || '').trim().toLowerCase();
      const matches = rId === cleanId || codeId === cleanId || r.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (r.brand && r.brand !== brand) return true;
      }
      return false;
    });
    return this.roles.length < initial;
  }

  public getEmployeeRoles(brand?: string | null): EmployeeRole[] {
    return this.getRoles(brand);
  }

  public saveEmployeeRole(role: EmployeeRole): EmployeeRole {
    return this.saveRole(role);
  }

  public deleteEmployeeRole(id: string, brand?: string | null): boolean {
    return this.deleteRole(id, brand);
  }

  // --- Employees ---
  public getEmployees(brand?: string | null): Employee[] {
    const list = (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)')
      ? this.employees.filter((e) => e.brand === brand)
      : this.employees;
    return list.map((e) => ({
      ...e,
      employee_id: e.id,
      employee_name: e.name,
      brand_id: e.brand,
      role_id: e.roleId,
    }));
  }

  public saveEmployee(emp: Employee): Employee {
    if (!emp.brand) emp.brand = 'Device Doctor India';
    const cleanId = (emp.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('EMP', emp.brand, this.employees);
    const idx = cleanId ? this.employees.findIndex((e) => e.id === cleanId) : -1;
    if (idx >= 0) {
      this.employees[idx] = { ...this.employees[idx], ...emp, id: finalId, updatedAt: new Date().toISOString() };
      return this.employees[idx];
    }
    const created: Employee = { ...emp, id: finalId, createdAt: emp.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.employees.unshift(created);
    return created;
  }

  public deleteEmployee(id: string, brand?: string | null): boolean {
    const initial = this.employees.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.employees = this.employees.filter((e) => {
      const eId = (e.id || '').trim().toLowerCase();
      const codeId = ((e as any).employee_id_code || '').trim().toLowerCase();
      const matches = eId === cleanId || codeId === cleanId || e.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (e.brand && e.brand !== brand) return true;
      }
      return false;
    });
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
    const cleanId = (asn.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('ASN', asn.brand, this.assignments);
    const idx = cleanId ? this.assignments.findIndex((a) => a.id === cleanId) : -1;
    if (idx >= 0) {
      this.assignments[idx] = { ...this.assignments[idx], ...asn, id: finalId, updatedAt: new Date().toISOString() };
      return this.assignments[idx];
    }
    const created: Assignment = { ...asn, id: finalId, createdAt: asn.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.assignments.unshift(created);
    return created;
  }

  public deleteAssignment(id: string, brand?: string | null): boolean {
    const initial = this.assignments.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.assignments = this.assignments.filter((a) => {
      const aId = (a.id || '').trim().toLowerCase();
      const codeId = ((a as any).assignment_id_code || '').trim().toLowerCase();
      const matches = aId === cleanId || codeId === cleanId || a.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (a.brand && a.brand !== brand) return true;
      }
      return false;
    });
    return this.assignments.length < initial;
  }

  // --- Employee Payments ---
  public getEmployeePayments(brand?: string | null): EmployeePayment[] {
    let list = this.employeePayments;
    if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
      list = this.employeePayments.filter((p) => p.brand === brand);
    }
    return list.map((p) => ({
      ...p,
      paymentProof: p.paymentProof ? JSON.parse(JSON.stringify(p.paymentProof)) : undefined,
    }));
  }

  public saveEmployeePayment(payment: EmployeePayment): EmployeePayment {
    if (!payment.brand) payment.brand = 'Device Doctor India';
    const cleanId = (payment.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('EPAY', payment.brand, this.employeePayments);
    const clonedPayment: EmployeePayment = {
      ...payment,
      id: finalId,
      paymentProof: payment.paymentProof ? JSON.parse(JSON.stringify(payment.paymentProof)) : undefined,
    };
    const idx = cleanId ? this.employeePayments.findIndex((p) => p.id === cleanId) : -1;
    if (idx >= 0) {
      this.employeePayments[idx] = { ...this.employeePayments[idx], ...clonedPayment, id: finalId, updatedAt: new Date().toISOString() };
      return JSON.parse(JSON.stringify(this.employeePayments[idx]));
    }
    const created = { ...clonedPayment, id: finalId, createdAt: clonedPayment.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.employeePayments.unshift(created);
    return JSON.parse(JSON.stringify(created));
  }

  public deleteEmployeePayment(id: string, brand?: string | null): boolean {
    const initial = this.employeePayments.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.employeePayments = this.employeePayments.filter((p) => {
      const pId = (p.id || '').trim().toLowerCase();
      const codeId = ((p as any).emp_payment_id_code || '').trim().toLowerCase();
      const matches = pId === cleanId || codeId === cleanId || p.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (p.brand && p.brand !== brand) return true;
      }
      return false;
    });
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
    const cleanId = (cat.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('EXPCAT', cat.brand, this.expenseCategories);
    const idx = cleanId ? this.expenseCategories.findIndex((c) => c.id === cleanId) : -1;
    if (idx >= 0) {
      this.expenseCategories[idx] = { ...this.expenseCategories[idx], ...cat, id: finalId, updatedAt: new Date().toISOString() };
      return this.expenseCategories[idx];
    }
    const created: ExpenseCategory = { ...cat, id: finalId, createdAt: cat.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.expenseCategories.unshift(created);
    return created;
  }

  public deleteExpenseCategory(id: string, brand?: string | null): boolean {
    const initial = this.expenseCategories.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.expenseCategories = this.expenseCategories.filter((c) => {
      const cId = (c.id || '').trim().toLowerCase();
      const codeId = ((c as any).exp_category_id_code || '').trim().toLowerCase();
      const matches = cId === cleanId || codeId === cleanId || c.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (c.brand && c.brand !== brand) return true;
      }
      return false;
    });
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
    const cleanId = (exp.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('EXP', exp.brand, this.expenses);
    const idx = cleanId ? this.expenses.findIndex((e) => e.id === cleanId) : -1;
    if (idx >= 0) {
      this.expenses[idx] = { ...this.expenses[idx], ...exp, id: finalId, updatedAt: new Date().toISOString() };
      return this.expenses[idx];
    }
    const created: Expense = { ...exp, id: finalId, createdAt: exp.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.expenses.unshift(created);
    return created;
  }

  public deleteExpense(id: string, brand?: string | null): boolean {
    const initial = this.expenses.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.expenses = this.expenses.filter((e) => {
      const eId = (e.id || '').trim().toLowerCase();
      const codeId = ((e as any).expense_id_code || '').trim().toLowerCase();
      const matches = eId === cleanId || codeId === cleanId || e.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (e.brand && e.brand !== brand) return true;
      }
      return false;
    });
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
    if (!account.brand) account.brand = 'Device Doctor India';
    const cleanId = (account.id || '').trim();
    const finalId = cleanId || generateSemanticEntityId('BNK', account.brand, this.bankAccounts);
    const existingIndex = cleanId ? this.bankAccounts.findIndex((b) => b.id === cleanId) : -1;
    const now = new Date().toISOString();
    const toSave: BankAccount = {
      ...account,
      id: finalId,
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

  public deleteBankAccount(id: string, brand?: string | null): boolean {
    const initial = this.bankAccounts.length;
    const cleanId = (id || '').trim().toLowerCase();
    this.bankAccounts = this.bankAccounts.filter((b) => {
      const bId = (b.id || '').trim().toLowerCase();
      const codeId = ((b as any).account_id_code || '').trim().toLowerCase();
      const matches = bId === cleanId || codeId === cleanId || b.id === id;
      if (!matches) return true;
      if (brand && brand !== 'All' && brand !== 'All Brands' && brand !== 'All Brands (Consolidated View)') {
        if (b.brand && b.brand !== brand) return true;
      }
      return false;
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
