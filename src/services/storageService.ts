import {
  Client,
  ServiceCategory,
  Service,
  Project,
  Payment,
  PaymentMode,
  EmployeeRole,
  Employee,
  Assignment,
  EmployeePayment,
  ExpenseCategory,
  Expense,
  GstInvoice,
  AuthUser,
  BrandName,
  getBrandPrefix,
} from '../types/crm';
import { calculateDaysOverdue } from '../utils/formatters';

const STORAGE_KEYS = {
  CLIENTS: 'ddi_crm_clients_v2',
  CATEGORIES: 'ddi_crm_categories_v2',
  SERVICES: 'ddi_crm_services_v2',
  PROJECTS: 'ddi_crm_projects_v6',
  PAYMENTS: 'ddi_crm_payments_v6',
  GST_INVOICES: 'ddi_crm_gst_invoices_v1',
  ROLES: 'ddi_crm_roles_v4',
  EMPLOYEES: 'ddi_crm_employees_v5',
  ASSIGNMENTS: 'ddi_crm_assignments_v1',
  EMPLOYEE_PAYMENTS: 'ddi_crm_employee_payments_v1',
  EXPENSE_CATEGORIES: 'ddi_crm_expense_categories_v1',
  EXPENSES: 'ddi_crm_expenses_v2',
  AUTH: 'ddi_crm_auth_v2',
  THEME: 'ddi_crm_theme_v2',
  BRAND: 'ddi_crm_active_brand_v1',
};

// ============================================================================
// 1. BRAND 1: DEVICE DOCTOR INDIA (Prefix: DDI)
// ============================================================================
const DDI_CLIENTS: Client[] = [
  {
    id: 'DDI-CL-001',
    brand: 'Device Doctor India',
    name: 'Zenith Logistics & Supply Chain Ltd',
    contactPerson: 'Rajesh Nair',
    phone: '+91 98201 44521',
    email: 'r.nair@zenithlogistics.in',
    city: 'Mumbai',
    country: 'India',
    gstNumber: '27AABCZ8493K1Z2',
    preferredCurrency: 'INR',
    clientSince: '2025-03-15',
    status: 'Active',
    notes: 'Enterprise logistics tracking app, automated driver dispatch, and carrier APIs.',
    createdAt: '2025-03-15T10:00:00Z',
    updatedAt: '2026-08-10T14:20:00Z',
  },
  {
    id: 'DDI-CL-002',
    brand: 'Device Doctor India',
    name: 'CyberShield Fintech Labs',
    contactPerson: 'Priyanka Sharma',
    phone: '+91 98112 33890',
    email: 'priyanka.s@cybershield.co.in',
    city: 'Gurugram',
    country: 'India',
    gstNumber: '06AACCC1122D1Z9',
    preferredCurrency: 'INR',
    clientSince: '2025-07-20',
    status: 'Active',
    notes: 'Secure banking portal, microservices architecture, and payment gateway integration.',
    createdAt: '2025-07-20T11:30:00Z',
    updatedAt: '2026-09-02T09:15:00Z',
  },
  {
    id: 'DDI-CL-003',
    brand: 'Device Doctor India',
    name: 'TechNova Enterprise Solutions',
    contactPerson: 'Anand Kulkarni',
    phone: '+91 80412 88901',
    email: 'anand.k@technovaglobal.com',
    city: 'Bengaluru',
    country: 'India',
    gstNumber: '29AAECT4455P1ZB',
    preferredCurrency: 'INR',
    clientSince: '2024-11-10',
    status: 'Active',
    notes: 'Custom ERP system for multi-country workforce management and cloud deployment.',
    createdAt: '2024-11-10T08:00:00Z',
    updatedAt: '2026-10-01T16:45:00Z',
  },
  {
    id: 'DDI-CL-004',
    brand: 'Device Doctor India',
    name: 'Apex Super-Speciality Hospital',
    contactPerson: 'Dr. Srinivas Rao',
    phone: '+91 94401 56230',
    email: 'biomed@apexhospitalhyd.org',
    city: 'Hyderabad',
    country: 'India',
    gstNumber: '36AACTA7788M1Z4',
    preferredCurrency: 'INR',
    clientSince: '2025-01-12',
    status: 'Active',
    notes: 'Patient appointment mobile application, EHR dashboard, and hospital portal.',
    createdAt: '2025-01-12T12:00:00Z',
    updatedAt: '2026-06-18T10:30:00Z',
  },
  {
    id: 'DDI-CL-005',
    brand: 'Device Doctor India',
    name: 'CloudMatrix Infotech Pune',
    contactPerson: 'Neha Deshmukh',
    phone: '+91 97654 32109',
    email: 'neha@cloudmatrix.io',
    city: 'Pune',
    country: 'India',
    gstNumber: '27AABFC9900L1ZX',
    preferredCurrency: 'INR',
    clientSince: '2025-09-05',
    status: 'Active',
    notes: 'B2B SaaS growth marketing, conversion rate optimization, and search advertising campaigns.',
    createdAt: '2025-09-05T09:00:00Z',
    updatedAt: '2026-09-25T11:15:00Z',
  },
  {
    id: 'DDI-CL-006',
    brand: 'Device Doctor India',
    name: 'Bharat Retail Ventures Pvt Ltd',
    contactPerson: 'Vikramaditya Sen',
    phone: '+91 99030 11445',
    email: 'v.sen@bharatretail.in',
    city: 'New Delhi',
    country: 'India',
    gstNumber: '07AAECB5544J1Z6',
    preferredCurrency: 'INR',
    clientSince: '2026-01-15',
    status: 'Prospect',
    notes: 'Direct-to-consumer e-commerce redesign, Next.js storefront, and omnichannel POS sync.',
    createdAt: '2026-01-15T14:00:00Z',
    updatedAt: '2026-08-30T17:00:00Z',
  },
];

const DDI_CATEGORIES: ServiceCategory[] = [
  {
    id: 'DDI-CAT-001',
    brand: 'Device Doctor India',
    name: 'Web & Custom Software Development',
    description: 'Enterprise web applications, React/Next.js client portals, Node.js microservices, and custom API backends.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-CAT-002',
    brand: 'Device Doctor India',
    name: 'Mobile App Development',
    description: 'Cross-platform iOS and Android mobile apps engineered with Flutter, React Native, offline synchronization, and push notifications.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-CAT-003',
    brand: 'Device Doctor India',
    name: 'Digital Marketing & SEO',
    description: 'Organic search optimization, technical SEO audits, multi-channel performance advertising on Google & Meta, and conversion tracking.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-CAT-004',
    brand: 'Device Doctor India',
    name: 'UI/UX & Brand Design',
    description: 'User experience research, interactive Figma prototypes, design systems, visual branding identities, and design audits.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-CAT-005',
    brand: 'Device Doctor India',
    name: 'Cloud & DevOps Engineering',
    description: 'AWS & GCP infrastructure automation, Docker/Kubernetes container orchestration, CI/CD pipelines, and cloud security monitoring.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const DDI_SERVICES: Service[] = [
  {
    id: 'DDI-SRV-001',
    brand: 'Device Doctor India',
    name: 'Full-Stack React & Node.js Web App',
    categoryId: 'DDI-CAT-001',
    description: 'Modern single-page applications, responsive dashboards, secure JWT authentication, and REST/GraphQL APIs.',
    status: 'Active',
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'DDI-SRV-002',
    brand: 'Device Doctor India',
    name: 'Custom ERP & CRM Development',
    categoryId: 'DDI-CAT-001',
    description: 'Tailored enterprise resource management software with role-based permissions, automated invoicing, and inventory control.',
    status: 'Active',
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'DDI-SRV-003',
    brand: 'Device Doctor India',
    name: 'Flutter iOS/Android App Development',
    categoryId: 'DDI-CAT-002',
    description: 'High-performance cross-platform mobile apps with native UI components, offline-first local caching, and payment SDKs.',
    status: 'Active',
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'DDI-SRV-004',
    brand: 'Device Doctor India',
    name: 'Technical SEO & Content Strategy',
    categoryId: 'DDI-CAT-003',
    description: 'Core Web Vitals optimization, semantic schema markup, programmatic SEO architecture, and keyword ranking strategy.',
    status: 'Active',
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'DDI-SRV-005',
    brand: 'Device Doctor India',
    name: 'Performance Marketing (Meta & Google Ads)',
    categoryId: 'DDI-CAT-003',
    description: 'Data-driven paid customer acquisition campaigns, audience segmentation, remarketing funnels, and ROAS optimization.',
    status: 'Active',
    createdAt: '2025-02-10T00:00:00Z',
    updatedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'DDI-SRV-006',
    brand: 'Device Doctor India',
    name: 'Design System & Interactive UI/UX Prototyping',
    categoryId: 'DDI-CAT-004',
    description: 'Complete component libraries in Figma, responsive typography & spacing scales, user journeys, and usability testing.',
    status: 'Active',
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
];

const DDI_PROJECTS: Project[] = [
  {
    id: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    brand: 'Device Doctor India',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    serviceId: 'DDI-SRV-002',
    proposalDate: '2026-06-15',
    contractDate: '2026-06-25',
    startDate: '2026-07-01',
    committedDays: 60,
    committedEndDate: '2026-08-30',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'GST Invoice',
    currency: 'INR',
    contract: 450000,
    exchangeRate: 1,
    contractValue: 450000,
    totalReceived: 200000,
    balance: 250000,
    projectManager: 'Karthik Ramanathan',
    notes: 'Awaiting client approval on GPS background tracking permissions and geofencing SDK integration.',
    paymentPhases: [
      {
        id: 'phase-001-1',
        name: 'Phase 1 - Advance / Project Kickoff',
        percentage: 40,
        amount: 180000,
        amountINR: 180000,
        dueDate: '2026-07-05',
        status: 'Received',
        notes: 'Kickoff advance cleared upon contract signing.',
      },
      {
        id: 'phase-001-2',
        name: 'Phase 2 - UI/UX & Backend Core Modules',
        percentage: 30,
        amount: 135000,
        amountINR: 135000,
        dueDate: '2026-08-05',
        status: 'Invoiced',
        notes: 'Deliverable: Geofencing, backend architecture, and live vehicle tracker prototype.',
      },
      {
        id: 'phase-001-3',
        name: 'Phase 3 - Final Go-Live & Staff Training',
        percentage: 30,
        amount: 135000,
        amountINR: 135000,
        dueDate: '2026-08-30',
        status: 'Pending',
        notes: 'Final sign-off, data migration from legacy Excel, and user training sessions.',
      },
    ],
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-09-15T11:00:00Z',
  },
  {
    id: 'DDI - CYBERSHIELD FINTECH LABS - FULL-STACK REACT & NODE.JS WEB APP - 1',
    brand: 'Device Doctor India',
    clientId: 'DDI-CL-002',
    clientName: 'CyberShield Fintech Labs',
    serviceId: 'DDI-SRV-001',
    proposalDate: '2026-07-15',
    contractDate: '2026-08-01',
    startDate: '2026-08-10',
    committedDays: 41,
    committedEndDate: '2026-09-20',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'Non GST Online',
    currency: 'INR',
    contract: 620000,
    exchangeRate: 1,
    contractValue: 620000,
    totalReceived: 250000,
    balance: 370000,
    projectManager: 'Karthik Ramanathan',
    notes: 'Undergoing third-party financial cybersecurity audit and SOC2 penetration testing.',
    paymentPhases: [
      {
        id: 'phase-002-1',
        name: 'Phase 1 - Advance / Architectural Setup',
        percentage: 40,
        amount: 248000,
        amountINR: 248000,
        dueDate: '2026-08-15',
        status: 'Received',
        notes: 'Initial 40% advance for cloud infrastructure provisioning.',
      },
      {
        id: 'phase-002-2',
        name: 'Phase 2 - Banking API & Security Hardening',
        percentage: 30,
        amount: 186000,
        amountINR: 186000,
        dueDate: '2026-09-05',
        status: 'Invoiced',
        notes: 'Payment gateway integration and mutual TLS bank connectivity.',
      },
      {
        id: 'phase-002-3',
        name: 'Phase 3 - Security Audit Sign-off & Production Release',
        percentage: 30,
        amount: 186000,
        amountINR: 186000,
        dueDate: '2026-09-20',
        status: 'Pending',
        notes: 'Final balance upon passing independent SOC2 penetration testing.',
      },
    ],
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-09-28T14:30:00Z',
  },
  {
    id: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    brand: 'Device Doctor India',
    clientId: 'DDI-CL-003',
    clientName: 'TechNova Enterprise Solutions',
    serviceId: 'DDI-SRV-003',
    proposalDate: '2026-08-15',
    contractDate: '2026-08-25',
    startDate: '2026-09-01',
    committedDays: 75,
    committedEndDate: '2026-11-15',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'GST Invoice',
    currency: 'INR',
    contract: 880000,
    exchangeRate: 1,
    contractValue: 880000,
    totalReceived: 440000,
    balance: 440000,
    projectManager: 'Deepak Varma',
    notes: 'Milestone 2 (Payroll and multi-currency billing engine) in active development.',
    paymentPhases: [
      {
        id: 'phase-003-1',
        name: 'Phase 1 - Mobilization & Design Approval',
        percentage: 50,
        amount: 440000,
        amountINR: 440000,
        dueDate: '2026-09-05',
        status: 'Received',
        notes: '50% mobilization payment credited in bank account.',
      },
      {
        id: 'phase-003-2',
        name: 'Phase 2 - Alpha TestFlight & Play Console Build',
        percentage: 25,
        amount: 220000,
        amountINR: 220000,
        dueDate: '2026-10-15',
        status: 'Invoiced',
        notes: 'Alpha build released to 50 internal company testers.',
      },
      {
        id: 'phase-003-3',
        name: 'Phase 3 - App Store & Google Play Public Launch',
        percentage: 25,
        amount: 220000,
        amountINR: 220000,
        dueDate: '2026-11-15',
        status: 'Pending',
        notes: 'Public store release and handover of source code repositories.',
      },
    ],
    createdAt: '2026-09-01T08:30:00Z',
    updatedAt: '2026-10-10T16:00:00Z',
  },
];

const DDI_PAYMENTS: Payment[] = [
  {
    id: 'DDI-PAY-001',
    brand: 'Device Doctor India',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-07-01',
    dueDate: '2026-07-05',
    amountReceived: 200000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 200000,
    referenceUtr: 'UTR-HDFC-9928172601',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Sprint 1 kickoff advance cleared in bank.',
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-09-16T10:00:00Z',
    amount: 200000,
    receivedAmount: 200000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
  {
    id: 'DDI-PAY-002',
    brand: 'Device Doctor India',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-09-01',
    dueDate: '2026-09-15',
    amountReceived: 150000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 150000,
    referenceUtr: 'INV-2026-ZEN-002',
    paymentStatus: 'Pending',
    daysOverdue: calculateDaysOverdue('2026-09-15', 'Pending'),
    notes: 'Milestone 2 deliverable invoice pending client accounts clearance.',
    createdAt: '2026-08-10T11:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    amount: 150000,
    receivedAmount: 0,
    outstandingAmount: 150000,
    paymentMethod: 'GST Invoice',
  },
  {
    id: 'DDI-PAY-003',
    brand: 'Device Doctor India',
    projectId: 'DDI - CYBERSHIELD FINTECH LABS - FULL-STACK REACT & NODE.JS WEB APP - 1',
    clientId: 'DDI-CL-002',
    clientName: 'CyberShield Fintech Labs',
    paymentMode: 'Non GST Online',
    paymentDate: '2026-08-10',
    dueDate: '2026-08-15',
    amountReceived: 250000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 250000,
    referenceUtr: 'UTR-ICIC-8819203112',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'API architecture milestone sign-off received.',
    createdAt: '2026-08-10T11:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    amount: 250000,
    receivedAmount: 250000,
    outstandingAmount: 0,
    paymentMethod: 'Non GST Online',
  },
  {
    id: 'DDI-PAY-004',
    brand: 'Device Doctor India',
    projectId: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    clientId: 'DDI-CL-003',
    clientName: 'TechNova Enterprise Solutions',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-09-01',
    dueDate: '2026-09-05',
    amountReceived: 440000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 440000,
    referenceUtr: 'UTR-AXIS-7728192034',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: '50% initial contract advance for mobile application build.',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-05T14:00:00Z',
    amount: 440000,
    receivedAmount: 440000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
];

const DDI_ROLES: EmployeeRole[] = [
  {
    id: 'DDI-ROL-001',
    brand: 'Device Doctor India',
    roleName: 'Full-Stack Developer',
    department: 'Software Engineering',
    status: 'Active',
    description: 'React, Node.js, Next.js web application architecture, REST & GraphQL APIs, database modeling, and code quality reviews.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'DDI-ROL-002',
    brand: 'Device Doctor India',
    roleName: 'App Developer',
    department: 'Mobile Engineering',
    status: 'Active',
    description: 'Cross-platform Flutter iOS/Android application engineering, state management, mobile offline sync, native SDK integrations.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'DDI-ROL-003',
    brand: 'Device Doctor India',
    roleName: 'UI/UX Designer',
    department: 'Product Design',
    status: 'Active',
    description: 'Figma wireframing, high-fidelity UI prototypes, interactive user journeys, and responsive web design systems.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const DDI_EMPLOYEES: Employee[] = [
  {
    id: 'DDI-EMP-001',
    brand: 'Device Doctor India',
    name: 'Karthik Ramanathan',
    roleId: 'DDI-ROL-001',
    email: 'karthik.r@devicedoctor.in',
    status: 'Active',
    joiningDate: '2024-02-15',
    costOfEmployee: 105000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Lead MERN & Next.js architect. Manages API security, database optimizations, and system architecture.',
    joinedDate: '2024-02-15',
    salary: 105000,
    monthlyCost: 105000,
    phone: '+91 98450 12890',
    assignedProjectsCount: 3,
    createdAt: '2024-02-15T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-002',
    brand: 'Device Doctor India',
    name: 'Deepak Varma',
    roleId: 'DDI-ROL-002',
    email: 'deepak.v@devicedoctor.in',
    status: 'Active',
    joiningDate: '2024-06-01',
    costOfEmployee: 95000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Senior Flutter developer with 5+ years building iOS/Android enterprise applications.',
    joinedDate: '2024-06-01',
    salary: 95000,
    monthlyCost: 95000,
    phone: '+91 97110 44556',
    assignedProjectsCount: 2,
    createdAt: '2024-06-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-003',
    brand: 'Device Doctor India',
    name: 'Saumya Khandelwal',
    roleId: 'DDI-ROL-003',
    email: 'saumya.k@devicedoctor.in',
    status: 'Active',
    joiningDate: '2024-09-01',
    costOfEmployee: 85000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Senior UI/UX Specialist & Frontend Designer handling enterprise web apps and mobile interfaces.',
    joinedDate: '2024-09-01',
    salary: 85000,
    monthlyCost: 85000,
    phone: '+91 98201 33490',
    assignedProjectsCount: 2,
    createdAt: '2024-09-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
];

const DDI_ASSIGNMENTS: Assignment[] = [
  {
    id: 'DDI-ASN-001',
    brand: 'Device Doctor India',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    employeeId: 'DDI-EMP-001',
    employeeName: 'Karthik Ramanathan',
    roleName: 'Full-Stack Developer',
    assignedDate: '2026-07-02',
    workAssigned: 'Backend API Architecture & Automated Driver Dispatch Module',
    amount: 180000,
    amountPaid: 180000,
    paymentStatus: 'Paid',
    employeeNotes: 'Completed driver dispatch APIs, JWT auth tokens, and warehouse webhook listeners.',
    lastNoteUpdate: '2026-07-28 17:30',
    createdAt: '2026-07-02T10:00:00Z',
    updatedAt: '2026-07-28T17:30:00Z',
  },
  {
    id: 'DDI-ASN-002',
    brand: 'Device Doctor India',
    projectId: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    clientId: 'DDI-CL-003',
    clientName: 'TechNova Enterprise Solutions',
    employeeId: 'DDI-EMP-002',
    employeeName: 'Deepak Varma',
    roleName: 'App Developer',
    assignedDate: '2026-09-02',
    workAssigned: 'Flutter Native Storage & Multi-tenant State Architecture',
    amount: 140000,
    amountPaid: 70000,
    paymentStatus: 'Partially Paid',
    employeeNotes: 'Offline state cache and push notifications active.',
    lastNoteUpdate: '2026-09-25 15:00',
    createdAt: '2026-09-02T09:00:00Z',
    updatedAt: '2026-09-25T15:00:00Z',
  },
];

const DDI_EMPLOYEE_PAYMENTS: EmployeePayment[] = [
  {
    id: 'DDI-EPAY-001',
    brand: 'Device Doctor India',
    assignmentId: 'DDI-ASN-001',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    employeeId: 'DDI-EMP-001',
    employeeName: 'Karthik Ramanathan',
    paymentDate: '2026-07-15',
    amountPaid: 100000,
    paymentMode: 'GST Invoice',
    referenceUtr: 'EPAY-NEFT-991823101',
    notes: 'Milestone 1 driver dispatch backend APIs payout cleared.',
    createdAt: '2026-07-15T10:00:00Z',
    updatedAt: '2026-07-15T10:00:00Z',
  },
  {
    id: 'DDI-EPAY-002',
    brand: 'Device Doctor India',
    assignmentId: 'DDI-ASN-001',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    employeeId: 'DDI-EMP-001',
    employeeName: 'Karthik Ramanathan',
    paymentDate: '2026-07-28',
    amountPaid: 80000,
    paymentMode: 'Non GST Online',
    referenceUtr: 'EPAY-UPI-202607281144',
    notes: 'Final sprint sign-off compensation for Zenith logistics ERP.',
    createdAt: '2026-07-28T16:00:00Z',
    updatedAt: '2026-07-28T16:00:00Z',
  },
];

const DDI_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'DDI-EXPCAT-001',
    brand: 'Device Doctor India',
    name: 'Hosting',
    description: 'Web hosting, VPS, dedicated servers, and CDN hosting services.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-002',
    brand: 'Device Doctor India',
    name: 'Domain',
    description: 'Domain name registration, DNS renewals, and SSL certification costs.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-003',
    brand: 'Device Doctor India',
    name: 'Server / Cloud',
    description: 'AWS, Google Cloud Platform, Azure VMs, container clusters, and storage.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const DDI_EXPENSES: Expense[] = [
  {
    id: 'DDI-EXP-001',
    brand: 'Device Doctor India',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    expenseCategoryId: 'DDI-EXPCAT-003',
    expenseCategoryName: 'Server / Cloud',
    vendor: 'Amazon Web Services (AWS)',
    description: 'Dedicated Kubernetes cluster node pools & CloudWatch audit logging instances.',
    amount: 350,
    currency: 'USD',
    exchangeRate: 84.5,
    amountINR: 29575,
    expenseDate: '2026-08-15',
    paymentStatus: 'Paid',
    notes: 'Billed to Zenith Logistics cloud staging environment.',
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'DDI-EXP-002',
    brand: 'Device Doctor India',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    expenseCategoryId: 'DDI-EXPCAT-002',
    expenseCategoryName: 'Domain',
    vendor: 'Hostinger India',
    description: 'Multi-year enterprise domain registration and SSL wildcard certificate.',
    amount: 6800,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 6800,
    expenseDate: '2026-07-10',
    paymentStatus: 'Paid',
    notes: 'Primary and webhook driver portal domains registered.',
    createdAt: '2026-07-10T11:00:00Z',
    updatedAt: '2026-07-10T11:00:00Z',
  },
];

const DDI_GST_INVOICES: GstInvoice[] = [
  {
    id: 'DDI-GST-001',
    brand: 'Device Doctor India',
    paymentId: 'DDI-PAY-001',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'DDI-CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    paymentDate: '2026-07-01',
    amountReceived: 200000,
    currency: 'INR',
    amountINR: 200000,
    gstAmountINR: 36000,
    invoiceNumber: 'INV-2026-001',
    uploadedToGstPortal: 'Yes',
    gstPortalUploadDate: '2026-07-05',
    notes: 'Filed under GSTR-1 for July 2026. IRN generated.',
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-05T12:00:00Z',
  },
  {
    id: 'DDI-GST-002',
    brand: 'Device Doctor India',
    paymentId: 'DDI-PAY-004',
    projectId: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    clientId: 'DDI-CL-003',
    clientName: 'TechNova Enterprise Solutions',
    paymentDate: '2026-09-01',
    amountReceived: 440000,
    currency: 'INR',
    amountINR: 440000,
    gstAmountINR: 79200,
    invoiceNumber: 'INV-2026-003',
    uploadedToGstPortal: 'No',
    gstPortalUploadDate: '',
    notes: 'TechNova advance invoice in Zoho Books.',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
  },
];

// ============================================================================
// 2. BRAND 2: CODESTRO (Prefix: CDS) — SaaS & Software Development Agency
// ============================================================================
const CDS_CLIENTS: Client[] = [
  {
    id: 'CDS-CL-001',
    brand: 'Codestro',
    name: 'AlphaStream Media Corp',
    contactPerson: 'Vikram Oberoi',
    phone: '+91 98210 11223',
    email: 'vikram@alphastream.io',
    city: 'Gurugram',
    country: 'India',
    gstNumber: '06AAACA8899K1Z5',
    preferredCurrency: 'INR',
    clientSince: '2025-08-10',
    status: 'Active',
    notes: 'High-throughput video streaming SaaS and subscription payment infrastructure.',
    createdAt: '2025-08-10T10:00:00Z',
    updatedAt: '2026-09-12T11:00:00Z',
  },
  {
    id: 'CDS-CL-002',
    brand: 'Codestro',
    name: 'NexaFlow AI Logistics',
    contactPerson: 'Tanvi Deshmukh',
    phone: '+91 98450 33441',
    email: 'tanvi.d@nexaflow.ai',
    city: 'Bengaluru',
    country: 'India',
    gstNumber: '29AABCN6677P1ZP',
    preferredCurrency: 'INR',
    clientSince: '2025-11-05',
    status: 'Active',
    notes: 'Enterprise logistics route dispatch optimization using LLM copilot.',
    createdAt: '2025-11-05T09:30:00Z',
    updatedAt: '2026-10-02T14:15:00Z',
  },
  {
    id: 'CDS-CL-003',
    brand: 'Codestro',
    name: 'OmniPay Cloud Systems',
    contactPerson: 'Aditya Kapoor',
    phone: '+91 98101 77665',
    email: 'aditya@omnipaycloud.com',
    city: 'Mumbai',
    country: 'India',
    gstNumber: '27AACCO5544J1Z8',
    preferredCurrency: 'INR',
    clientSince: '2026-02-18',
    status: 'Active',
    notes: 'Unified multi-rail fintech payment gateway and merchant dashboard.',
    createdAt: '2026-02-18T10:00:00Z',
    updatedAt: '2026-08-20T16:40:00Z',
  },
  {
    id: 'CDS-CL-004',
    brand: 'Codestro',
    name: 'Vortex Healthtech UK',
    contactPerson: 'Oliver Bennett',
    phone: '+44 20 7946 0912',
    email: 'oliver@vortexhealth.co.uk',
    city: 'London',
    country: 'United Kingdom',
    preferredCurrency: 'GBP',
    clientSince: '2026-04-10',
    status: 'Prospect',
    notes: 'Clinic scheduling SaaS, patient tele-triage with HIPAA/GDPR encryption.',
    createdAt: '2026-04-10T12:00:00Z',
    updatedAt: '2026-09-01T15:00:00Z',
  },
];

const CDS_CATEGORIES: ServiceCategory[] = [
  {
    id: 'CDS-CAT-001',
    brand: 'Codestro',
    name: 'Full-Stack Web & SaaS Engineering',
    description: 'Next.js 15, React 19, server actions, multi-tenant databases, and high-velocity web platforms.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CDS-CAT-002',
    brand: 'Codestro',
    name: 'AI Agents & Workflow Automation',
    description: 'LLM agents, vector semantic search, RAG pipelines, and automated customer operations.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CDS-CAT-003',
    brand: 'Codestro',
    name: 'Scalable Cloud Microservices',
    description: 'Node.js/Go event-driven architectures, Redis pub/sub, Dockerized serverless, and resilient APIs.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CDS-CAT-004',
    brand: 'Codestro',
    name: 'UI/UX & Design Systems',
    description: 'Radix/shadcn design systems, motion animations, Figma token handoffs, and dark-mode aesthetics.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const CDS_SERVICES: Service[] = [
  {
    id: 'CDS-SRV-001',
    brand: 'Codestro',
    name: 'Next.js Enterprise SaaS Platform',
    categoryId: 'CDS-CAT-001',
    description: 'Production B2B SaaS boilerplate, Stripe/Razorpay billing, organization workspaces, and audit logs.',
    status: 'Active',
    createdAt: '2025-06-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'CDS-SRV-002',
    brand: 'Codestro',
    name: 'AI Copilot & Intelligent Workflows',
    categoryId: 'CDS-CAT-002',
    description: 'In-app generative AI copilots, tool calling, document intelligence, and real-time streaming assistants.',
    status: 'Active',
    createdAt: '2025-07-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'CDS-SRV-003',
    brand: 'Codestro',
    name: 'Scalable GraphQL & Node.js APIs',
    categoryId: 'CDS-CAT-003',
    description: 'High-throughput GraphQL/REST endpoints, caching layers, rate limiting, and webhook dispatchers.',
    status: 'Active',
    createdAt: '2025-07-15T00:00:00Z',
    updatedAt: '2026-02-15T00:00:00Z',
  },
  {
    id: 'CDS-SRV-004',
    brand: 'Codestro',
    name: 'Enterprise Figma Design System',
    categoryId: 'CDS-CAT-004',
    description: 'Pixel-perfect component library, responsive grid systems, accessibility checks, and code-ready tokens.',
    status: 'Active',
    createdAt: '2025-08-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
];

const CDS_PROJECTS: Project[] = [
  {
    id: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    brand: 'Codestro',
    clientId: 'CDS-CL-001',
    clientName: 'AlphaStream Media Corp',
    serviceId: 'CDS-SRV-001',
    proposalDate: '2026-06-01',
    contractDate: '2026-06-15',
    startDate: '2026-07-01',
    committedDays: 60,
    committedEndDate: '2026-08-30',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'GST Invoice',
    currency: 'INR',
    contract: 550000,
    exchangeRate: 1,
    contractValue: 550000,
    totalReceived: 350000,
    balance: 200000,
    projectManager: 'Rohan Malhotra',
    notes: 'Video transcoding and paywall subscriptions module delivered. Webhook testing underway.',
    paymentPhases: [
      {
        id: 'phase-cds-1-1',
        name: 'Phase 1 - Kickoff & Multi-Tenant Setup',
        percentage: 40,
        amount: 220000,
        amountINR: 220000,
        dueDate: '2026-07-05',
        status: 'Received',
        notes: 'Workspace architecture and authentication setup.',
      },
      {
        id: 'phase-cds-1-2',
        name: 'Phase 2 - Video Streaming & Paywall Engine',
        percentage: 30,
        amount: 165000,
        amountINR: 165000,
        dueDate: '2026-08-01',
        status: 'Received',
        notes: 'HLS video playback and Stripe recurring billing.',
      },
      {
        id: 'phase-cds-1-3',
        name: 'Phase 3 - Analytics & Production Release',
        percentage: 30,
        amount: 165000,
        amountINR: 165000,
        dueDate: '2026-08-30',
        status: 'Pending',
        notes: 'Final load testing and AWS CloudFront setup.',
      },
    ],
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-09-10T14:00:00Z',
  },
  {
    id: 'CDS - NEXAFLOW AI LOGISTICS - AI COPILOT & INTELLIGENT WORKFLOWS - 1',
    brand: 'Codestro',
    clientId: 'CDS-CL-002',
    clientName: 'NexaFlow AI Logistics',
    serviceId: 'CDS-SRV-002',
    proposalDate: '2026-07-10',
    contractDate: '2026-07-25',
    startDate: '2026-08-01',
    committedDays: 50,
    committedEndDate: '2026-09-20',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'Non GST Online',
    currency: 'INR',
    contract: 720000,
    exchangeRate: 1,
    contractValue: 720000,
    totalReceived: 400000,
    balance: 320000,
    projectManager: 'Rohan Malhotra',
    notes: 'Fleet automated dispatch AI copilot with pgvector route matching in active pilot.',
    paymentPhases: [
      {
        id: 'phase-cds-2-1',
        name: 'Phase 1 - LLM Tooling & Route Knowledge Base',
        percentage: 50,
        amount: 360000,
        amountINR: 360000,
        dueDate: '2026-08-10',
        status: 'Received',
        notes: 'Vector database pipeline and API endpoints.',
      },
      {
        id: 'phase-cds-2-2',
        name: 'Phase 2 - Driver App Copilot Integration',
        percentage: 50,
        amount: 360000,
        amountINR: 360000,
        dueDate: '2026-09-20',
        status: 'Pending',
        notes: 'Driver real-time voice and text dispatcher assistant.',
      },
    ],
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-09-22T16:30:00Z',
  },
  {
    id: 'CDS - OMNIPAY CLOUD SYSTEMS - SCALABLE GRAPHQL & NODE.JS APIS - 1',
    brand: 'Codestro',
    clientId: 'CDS-CL-003',
    clientName: 'OmniPay Cloud Systems',
    serviceId: 'CDS-SRV-003',
    proposalDate: '2026-04-10',
    contractDate: '2026-04-20',
    startDate: '2026-05-01',
    committedDays: 45,
    committedEndDate: '2026-06-15',
    actualEndDate: '2026-06-14',
    status: 'Completed',
    paymentMode: 'GST Invoice',
    currency: 'INR',
    contract: 480000,
    exchangeRate: 1,
    contractValue: 480000,
    totalReceived: 480000,
    balance: 0,
    projectManager: 'Aanya Sengupta',
    notes: 'Successfully deployed on Kubernetes cluster with 99.99% uptime benchmark achieved.',
    paymentPhases: [
      {
        id: 'phase-cds-3-1',
        name: 'Phase 1 - Advance & Schema Drafting',
        percentage: 50,
        amount: 240000,
        amountINR: 240000,
        dueDate: '2026-05-05',
        status: 'Received',
        notes: 'Kickoff milestone cleared.',
      },
      {
        id: 'phase-cds-3-2',
        name: 'Phase 2 - Final Deployment & UAT',
        percentage: 50,
        amount: 240000,
        amountINR: 240000,
        dueDate: '2026-06-15',
        status: 'Received',
        notes: 'Final sign-off and load test clearance.',
      },
    ],
    createdAt: '2026-05-01T09:00:00Z',
    updatedAt: '2026-06-18T12:00:00Z',
  },
];

const CDS_PAYMENTS: Payment[] = [
  {
    id: 'CDS-PAY-001',
    brand: 'Codestro',
    projectId: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    clientId: 'CDS-CL-001',
    clientName: 'AlphaStream Media Corp',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-07-05',
    dueDate: '2026-07-05',
    amountReceived: 220000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 220000,
    referenceUtr: 'UTR-HDFC-CDS-11029',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'SaaS foundation advance credited via RTGS.',
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
    amount: 220000,
    receivedAmount: 220000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
  {
    id: 'CDS-PAY-002',
    brand: 'Codestro',
    projectId: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    clientId: 'CDS-CL-001',
    clientName: 'AlphaStream Media Corp',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-08-01',
    dueDate: '2026-08-01',
    amountReceived: 130000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 130000,
    referenceUtr: 'UTR-HDFC-CDS-11088',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Streaming module milestone payout.',
    createdAt: '2026-08-01T11:00:00Z',
    updatedAt: '2026-08-01T11:00:00Z',
    amount: 130000,
    receivedAmount: 130000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
  {
    id: 'CDS-PAY-003',
    brand: 'Codestro',
    projectId: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    clientId: 'CDS-CL-001',
    clientName: 'AlphaStream Media Corp',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-09-01',
    dueDate: '2026-09-15',
    amountReceived: 200000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 200000,
    referenceUtr: 'INV-CDS-2026-002',
    paymentStatus: 'Pending',
    daysOverdue: calculateDaysOverdue('2026-09-15', 'Pending'),
    notes: 'Final milestone invoice sent to client finance team.',
    createdAt: '2026-09-01T09:30:00Z',
    updatedAt: '2026-09-01T09:30:00Z',
    amount: 200000,
    receivedAmount: 0,
    outstandingAmount: 200000,
    paymentMethod: 'GST Invoice',
  },
  {
    id: 'CDS-PAY-004',
    brand: 'Codestro',
    projectId: 'CDS - NEXAFLOW AI LOGISTICS - AI COPILOT & INTELLIGENT WORKFLOWS - 1',
    clientId: 'CDS-CL-002',
    clientName: 'NexaFlow AI Logistics',
    paymentMode: 'Non GST Online',
    paymentDate: '2026-08-05',
    dueDate: '2026-08-10',
    amountReceived: 400000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 400000,
    referenceUtr: 'UTR-ICIC-CDS-99214',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'AI Copilot prototype milestone cleared.',
    createdAt: '2026-08-05T11:00:00Z',
    updatedAt: '2026-08-05T11:00:00Z',
    amount: 400000,
    receivedAmount: 400000,
    outstandingAmount: 0,
    paymentMethod: 'Non GST Online',
  },
  {
    id: 'CDS-PAY-005',
    brand: 'Codestro',
    projectId: 'CDS - OMNIPAY CLOUD SYSTEMS - SCALABLE GRAPHQL & NODE.JS APIS - 1',
    clientId: 'CDS-CL-003',
    clientName: 'OmniPay Cloud Systems',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-06-15',
    dueDate: '2026-06-15',
    amountReceived: 480000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 480000,
    referenceUtr: 'UTR-KOTK-CDS-44182',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Final settlement for GraphQL payment gateway API.',
    createdAt: '2026-06-15T10:00:00Z',
    updatedAt: '2026-06-15T10:00:00Z',
    amount: 480000,
    receivedAmount: 480000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
];

const CDS_ROLES: EmployeeRole[] = [
  {
    id: 'CDS-ROL-001',
    brand: 'Codestro',
    roleName: 'Lead Full-Stack Engineer',
    department: 'Engineering',
    status: 'Active',
    description: 'Next.js 15, React 19, TypeScript, PostgreSQL, and scalable microservice architectures.',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'CDS-ROL-002',
    brand: 'Codestro',
    roleName: 'AI & ML Systems Architect',
    department: 'AI Research & Delivery',
    status: 'Active',
    description: 'Vector databases, LangChain, embeddings, model fine-tuning, and AI inference latency optimization.',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'CDS-ROL-003',
    brand: 'Codestro',
    roleName: 'Senior Product Designer',
    department: 'Design Systems',
    status: 'Active',
    description: 'Figma component libraries, user journey design, interactive micro-interactions, and design tokens.',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
];

const CDS_EMPLOYEES: Employee[] = [
  {
    id: 'CDS-EMP-001',
    brand: 'Codestro',
    name: 'Rohan Malhotra',
    roleId: 'CDS-ROL-001',
    email: 'rohan.m@codestro.dev',
    status: 'Active',
    joiningDate: '2025-06-15',
    costOfEmployee: 115000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Technical Lead for SaaS architectures and high-performance React frontends.',
    joinedDate: '2025-06-15',
    salary: 115000,
    monthlyCost: 115000,
    phone: '+91 98110 55441',
    assignedProjectsCount: 2,
    createdAt: '2025-06-15T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'CDS-EMP-002',
    brand: 'Codestro',
    name: 'Aanya Sengupta',
    roleId: 'CDS-ROL-002',
    email: 'aanya.s@codestro.dev',
    status: 'Active',
    joiningDate: '2025-07-01',
    costOfEmployee: 125000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Specialist in custom LLM workflow pipelines, pgvector search, and Gemini tool integrations.',
    joinedDate: '2025-07-01',
    salary: 125000,
    monthlyCost: 125000,
    phone: '+91 98302 44332',
    assignedProjectsCount: 2,
    createdAt: '2025-07-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'CDS-EMP-003',
    brand: 'Codestro',
    name: 'Tanya Verghese',
    roleId: 'CDS-ROL-003',
    email: 'tanya.v@codestro.dev',
    status: 'Active',
    joiningDate: '2025-09-10',
    costOfEmployee: 90000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Product designer for dark-mode SaaS dashboards and component systems.',
    joinedDate: '2025-09-10',
    salary: 90000,
    monthlyCost: 90000,
    phone: '+91 98401 77889',
    assignedProjectsCount: 1,
    createdAt: '2025-09-10T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
];

const CDS_ASSIGNMENTS: Assignment[] = [
  {
    id: 'CDS-ASN-001',
    brand: 'Codestro',
    projectId: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    clientId: 'CDS-CL-001',
    clientName: 'AlphaStream Media Corp',
    employeeId: 'CDS-EMP-001',
    employeeName: 'Rohan Malhotra',
    roleName: 'Lead Full-Stack Engineer',
    assignedDate: '2026-07-02',
    workAssigned: 'Video Transcoding & HLS Stream Distribution Engine',
    amount: 160000,
    amountPaid: 160000,
    paymentStatus: 'Paid',
    employeeNotes: 'Completed HLS adaptive streaming and paywall integration.',
    lastNoteUpdate: '2026-07-28 17:00',
    createdAt: '2026-07-02T10:00:00Z',
    updatedAt: '2026-07-28T17:00:00Z',
  },
  {
    id: 'CDS-ASN-002',
    brand: 'Codestro',
    projectId: 'CDS - NEXAFLOW AI LOGISTICS - AI COPILOT & INTELLIGENT WORKFLOWS - 1',
    clientId: 'CDS-CL-002',
    clientName: 'NexaFlow AI Logistics',
    employeeId: 'CDS-EMP-002',
    employeeName: 'Aanya Sengupta',
    roleName: 'AI & ML Systems Architect',
    assignedDate: '2026-08-05',
    workAssigned: 'LangChain Pipeline & Fleet Dispatch Route Optimization',
    amount: 210000,
    amountPaid: 120000,
    paymentStatus: 'Partially Paid',
    employeeNotes: 'Benchmarked route query response at sub-400ms.',
    lastNoteUpdate: '2026-08-25 16:30',
    createdAt: '2026-08-05T11:00:00Z',
    updatedAt: '2026-08-25T16:30:00Z',
  },
  {
    id: 'CDS-ASN-003',
    brand: 'Codestro',
    projectId: 'CDS - OMNIPAY CLOUD SYSTEMS - SCALABLE GRAPHQL & NODE.JS APIS - 1',
    clientId: 'CDS-CL-003',
    clientName: 'OmniPay Cloud Systems',
    employeeId: 'CDS-EMP-003',
    employeeName: 'Tanya Verghese',
    roleName: 'Senior Product Designer',
    assignedDate: '2026-05-02',
    workAssigned: 'Checkout Component Tokens & Responsive Dashboard UI',
    amount: 95000,
    amountPaid: 95000,
    paymentStatus: 'Paid',
    employeeNotes: 'Design tokens exported into Tailwind config and approved by client.',
    lastNoteUpdate: '2026-05-28 14:00',
    createdAt: '2026-05-02T09:00:00Z',
    updatedAt: '2026-05-28T14:00:00Z',
  },
];

const CDS_EMPLOYEE_PAYMENTS: EmployeePayment[] = [
  {
    id: 'CDS-EPAY-001',
    brand: 'Codestro',
    assignmentId: 'CDS-ASN-001',
    projectId: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    employeeId: 'CDS-EMP-001',
    employeeName: 'Rohan Malhotra',
    paymentDate: '2026-07-20',
    amountPaid: 160000,
    paymentMode: 'GST Invoice',
    referenceUtr: 'EPAY-NEFT-CDS-991',
    notes: 'HLS player and video streaming milestone clearance.',
    createdAt: '2026-07-20T10:00:00Z',
    updatedAt: '2026-07-20T10:00:00Z',
  },
  {
    id: 'CDS-EPAY-002',
    brand: 'Codestro',
    assignmentId: 'CDS-ASN-002',
    projectId: 'CDS - NEXAFLOW AI LOGISTICS - AI COPILOT & INTELLIGENT WORKFLOWS - 1',
    employeeId: 'CDS-EMP-002',
    employeeName: 'Aanya Sengupta',
    paymentDate: '2026-08-15',
    amountPaid: 120000,
    paymentMode: 'Non GST Online',
    referenceUtr: 'EPAY-IMPS-CDS-442',
    notes: 'AI pipeline milestone compensation.',
    createdAt: '2026-08-15T12:00:00Z',
    updatedAt: '2026-08-15T12:00:00Z',
  },
  {
    id: 'CDS-EPAY-003',
    brand: 'Codestro',
    assignmentId: 'CDS-ASN-003',
    projectId: 'CDS - OMNIPAY CLOUD SYSTEMS - SCALABLE GRAPHQL & NODE.JS APIS - 1',
    employeeId: 'CDS-EMP-003',
    employeeName: 'Tanya Verghese',
    paymentDate: '2026-06-30',
    amountPaid: 95000,
    paymentMode: 'Non GST Online',
    referenceUtr: 'EPAY-UPI-CDS-881',
    notes: 'UI design tokens milestone payout.',
    createdAt: '2026-06-30T14:00:00Z',
    updatedAt: '2026-06-30T14:00:00Z',
  },
];

const CDS_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'CDS-EXPCAT-001',
    brand: 'Codestro',
    name: 'Cloud & AI GPU Compute',
    description: 'Lambda Labs, RunPod, AWS GPU instances, and cloud training environments.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'CDS-EXPCAT-002',
    brand: 'Codestro',
    name: 'SaaS Tooling & Licenses',
    description: 'Vercel Enterprise, GitHub Copilot, Linear, Figma, and developer SaaS seats.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
];

const CDS_EXPENSES: Expense[] = [
  {
    id: 'CDS-EXP-001',
    brand: 'Codestro',
    projectId: 'CDS - NEXAFLOW AI LOGISTICS - AI COPILOT & INTELLIGENT WORKFLOWS - 1',
    clientId: 'CDS-CL-002',
    clientName: 'NexaFlow AI Logistics',
    expenseCategoryId: 'CDS-EXPCAT-001',
    expenseCategoryName: 'Cloud & AI GPU Compute',
    vendor: 'Lambda Labs Compute',
    description: 'Dedicated A100 GPU cluster for embedding and fine-tuning route embeddings.',
    amount: 32000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 32000,
    expenseDate: '2026-08-12',
    paymentStatus: 'Paid',
    notes: 'Billed to NexaFlow AI project budget.',
    createdAt: '2026-08-12T10:00:00Z',
    updatedAt: '2026-08-12T10:00:00Z',
  },
  {
    id: 'CDS-EXP-002',
    brand: 'Codestro',
    projectId: 'NA',
    clientId: 'NA',
    clientName: 'NA',
    expenseCategoryId: 'CDS-EXPCAT-002',
    expenseCategoryName: 'SaaS Tooling & Licenses',
    vendor: 'Vercel Inc & GitHub Enterprise',
    description: 'Team deployment seats, preview build pipelines, and enterprise CI/CD runners.',
    amount: 18500,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 18500,
    expenseDate: '2026-09-01',
    paymentStatus: 'Paid',
    notes: 'Monthly engineering stack tooling.',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
  },
];

const CDS_GST_INVOICES: GstInvoice[] = [
  {
    id: 'CDS-GST-001',
    brand: 'Codestro',
    paymentId: 'CDS-PAY-001',
    projectId: 'CDS - ALPHASTREAM MEDIA CORP - NEXT.JS ENTERPRISE SAAS PLATFORM - 1',
    clientId: 'CDS-CL-001',
    clientName: 'AlphaStream Media Corp',
    paymentDate: '2026-07-05',
    amountReceived: 220000,
    currency: 'INR',
    amountINR: 220000,
    gstAmountINR: 39600,
    invoiceNumber: 'INV-CDS-2026-001',
    uploadedToGstPortal: 'Yes',
    gstPortalUploadDate: '2026-07-10',
    notes: 'Uploaded under Codestro GST registration.',
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-10T12:00:00Z',
  },
  {
    id: 'CDS-GST-002',
    brand: 'Codestro',
    paymentId: 'CDS-PAY-005',
    projectId: 'CDS - OMNIPAY CLOUD SYSTEMS - SCALABLE GRAPHQL & NODE.JS APIS - 1',
    clientId: 'CDS-CL-003',
    clientName: 'OmniPay Cloud Systems',
    paymentDate: '2026-06-15',
    amountReceived: 480000,
    currency: 'INR',
    amountINR: 480000,
    gstAmountINR: 86400,
    invoiceNumber: 'INV-CDS-2026-002',
    uploadedToGstPortal: 'Yes',
    gstPortalUploadDate: '2026-06-20',
    notes: 'Full payment GST invoice settled.',
    createdAt: '2026-06-15T10:00:00Z',
    updatedAt: '2026-06-20T14:00:00Z',
  },
];

// ============================================================================
// 3. BRAND 3: FX LAUNCH PAD (Prefix: FXL) — FinTech, Forex & Algo Trading Tech
// ============================================================================
const FXL_CLIENTS: Client[] = [
  {
    id: 'FXL-CL-001',
    brand: 'FX Launch Pad',
    name: 'ApexTrader Prop Capital Dubai',
    contactPerson: 'Tariq Al-Mansoor',
    phone: '+971 4 391 2233',
    email: 'tariq@apextradercapital.ae',
    city: 'Dubai',
    country: 'United Arab Emirates',
    preferredCurrency: 'USD',
    clientSince: '2025-05-12',
    status: 'Active',
    notes: 'Prop trading firm multi-step challenge portal, automated risk limits, and trader dashboard.',
    createdAt: '2025-05-12T10:00:00Z',
    updatedAt: '2026-09-05T12:00:00Z',
  },
  {
    id: 'FXL-CL-002',
    brand: 'FX Launch Pad',
    name: 'BlueWave FX Global Cyprus',
    contactPerson: 'Dimitrios Kouris',
    phone: '+357 25 812 400',
    email: 'dimitrios@bluewavefx.com',
    city: 'Limassol',
    country: 'Cyprus',
    preferredCurrency: 'EUR',
    clientSince: '2025-09-20',
    status: 'Active',
    notes: 'CySEC regulated brokerage institutional landing, automated KYC verification pipeline.',
    createdAt: '2025-09-20T11:00:00Z',
    updatedAt: '2026-09-18T15:30:00Z',
  },
  {
    id: 'FXL-CL-003',
    brand: 'FX Launch Pad',
    name: 'QuantumPip Trading Labs',
    contactPerson: 'Kabir Mehta',
    phone: '+91 99887 66554',
    email: 'kabir@quantumpip.in',
    city: 'Mumbai',
    country: 'India',
    gstNumber: '27AABCQ9911D1Z4',
    preferredCurrency: 'INR',
    clientSince: '2026-01-10',
    status: 'Active',
    notes: 'HFT algorithmic scalping bots on MetaTrader 5 and Telegram signals bot.',
    createdAt: '2026-01-10T09:00:00Z',
    updatedAt: '2026-08-15T14:00:00Z',
  },
  {
    id: 'FXL-CL-004',
    brand: 'FX Launch Pad',
    name: 'Zenith Algo Strategies',
    contactPerson: 'Liam Van Der Berg',
    phone: '+31 20 504 1122',
    email: 'liam@zenithalgo.nl',
    city: 'Amsterdam',
    country: 'Netherlands',
    preferredCurrency: 'EUR',
    clientSince: '2026-03-01',
    status: 'Prospect',
    notes: 'Prop firm EA automation, liquidity bridge integrations, and tick data backtesting.',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-08-10T16:00:00Z',
  },
];

const FXL_CATEGORIES: ServiceCategory[] = [
  {
    id: 'FXL-CAT-001',
    brand: 'FX Launch Pad',
    name: 'Prop Firm Infrastructure & CRM',
    description: 'Two-phase evaluation portals, daily drawdown monitors, MT5 manager bridges, and payout processing.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'FXL-CAT-002',
    brand: 'FX Launch Pad',
    name: 'MT4/MT5 & cTrader Algo Bots',
    description: 'Custom Expert Advisors (EAs), low-latency hedging algorithms, tick news scalpers, and copy-trading systems.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'FXL-CAT-003',
    brand: 'FX Launch Pad',
    name: 'FinTech Broker Landing & KYC',
    description: 'Conversion-optimized forex broker web portals, SumSub/Persona identity verification, and multi-currency wallets.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'FXL-CAT-004',
    brand: 'FX Launch Pad',
    name: 'Trading Community Growth & PPC',
    description: 'Targeted Google/Meta financial lead acquisition, Telegram community funnels, and trading contest viral engines.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const FXL_SERVICES: Service[] = [
  {
    id: 'FXL-SRV-001',
    brand: 'FX Launch Pad',
    name: 'Prop Firm Challenge & Risk Portal',
    categoryId: 'FXL-CAT-001',
    description: 'Automated equity drawdown protection, Phase 1 & 2 metric dashboards, and certificate generation.',
    status: 'Active',
    createdAt: '2025-05-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'FXL-SRV-002',
    brand: 'FX Launch Pad',
    name: 'Custom MT5 Automated Trading EA',
    categoryId: 'FXL-CAT-002',
    description: 'C++ & MQL5 automated algorithmic trading robot with risk parameter safety locks and backtesting reports.',
    status: 'Active',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'FXL-SRV-003',
    brand: 'FX Launch Pad',
    name: 'Broker CRM & Instant KYC Engine',
    categoryId: 'FXL-CAT-003',
    description: 'Regulated broker portal with fast passport/utility document verification, crypto deposits, and affiliate tracking.',
    status: 'Active',
    createdAt: '2025-06-15T00:00:00Z',
    updatedAt: '2026-02-15T00:00:00Z',
  },
  {
    id: 'FXL-SRV-004',
    brand: 'FX Launch Pad',
    name: 'Forex Lead-Gen & Telegram Community Scale',
    categoryId: 'FXL-CAT-004',
    description: 'Paid trader acquisition funnels, VIP signal bot integration, and multi-channel influencer campaigns.',
    status: 'Active',
    createdAt: '2025-07-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
];

const FXL_PROJECTS: Project[] = [
  {
    id: 'FXL - APEXTRADER PROP CAPITAL DUBAI - PROP FIRM CHALLENGE & RISK PORTAL - 1',
    brand: 'FX Launch Pad',
    clientId: 'FXL-CL-001',
    clientName: 'ApexTrader Prop Capital Dubai',
    serviceId: 'FXL-SRV-001',
    proposalDate: '2026-06-10',
    contractDate: '2026-06-25',
    startDate: '2026-07-01',
    committedDays: 60,
    committedEndDate: '2026-08-30',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'Crypto',
    currency: 'USD',
    contract: 12000,
    exchangeRate: 84.5,
    contractValue: 1014000,
    totalReceived: 507000,
    balance: 507000,
    projectManager: 'Sameer Saxena',
    notes: 'Real-time equity monitor connected to MT5 server in London LD4 datacenter. Phase 2 live.',
    paymentPhases: [
      {
        id: 'phase-fxl-1-1',
        name: 'Phase 1 - MT5 Gateway Bridge & Challenge Engine',
        percentage: 50,
        amount: 6000,
        amountINR: 507000,
        dueDate: '2026-07-05',
        status: 'Received',
        notes: 'Mobilization payment cleared via USDT on TRON network.',
      },
      {
        id: 'phase-fxl-1-2',
        name: 'Phase 2 - Trader Dashboard & Automated Payouts',
        percentage: 50,
        amount: 6000,
        amountINR: 507000,
        dueDate: '2026-08-30',
        status: 'Pending',
        notes: 'Final sign-off and production handover.',
      },
    ],
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-09-12T15:00:00Z',
  },
  {
    id: 'FXL - BLUEWAVE FX GLOBAL CYPRUS - BROKER CRM & INSTANT KYC ENGINE - 1',
    brand: 'FX Launch Pad',
    clientId: 'FXL-CL-002',
    clientName: 'BlueWave FX Global Cyprus',
    serviceId: 'FXL-SRV-003',
    proposalDate: '2026-07-15',
    contractDate: '2026-07-30',
    startDate: '2026-08-10',
    committedDays: 50,
    committedEndDate: '2026-09-30',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'Non GST Online',
    currency: 'EUR',
    contract: 9500,
    exchangeRate: 92.0,
    contractValue: 874000,
    totalReceived: 437000,
    balance: 437000,
    projectManager: 'Sameer Saxena',
    notes: 'SumSub identity verification webhooks and SEPA banking deposit portal implemented.',
    paymentPhases: [
      {
        id: 'phase-fxl-2-1',
        name: 'Phase 1 - Broker Client Zone & KYC Webhooks',
        percentage: 50,
        amount: 4750,
        amountINR: 437000,
        dueDate: '2026-08-15',
        status: 'Received',
        notes: 'SEPA bank transfer credited.',
      },
      {
        id: 'phase-fxl-2-2',
        name: 'Phase 2 - Payment Gateway & Multi-Asset Wallet',
        percentage: 50,
        amount: 4750,
        amountINR: 437000,
        dueDate: '2026-09-30',
        status: 'Pending',
        notes: 'Final UAT testing on staging broker server.',
      },
    ],
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-09-20T11:45:00Z',
  },
  {
    id: 'FXL - QUANTUMPIP TRADING LABS - CUSTOM MT5 AUTOMATED TRADING EA - 1',
    brand: 'FX Launch Pad',
    clientId: 'FXL-CL-003',
    clientName: 'QuantumPip Trading Labs',
    serviceId: 'FXL-SRV-002',
    proposalDate: '2026-05-10',
    contractDate: '2026-05-20',
    startDate: '2026-06-01',
    committedDays: 40,
    committedEndDate: '2026-07-10',
    actualEndDate: '2026-07-08',
    status: 'Completed',
    paymentMode: 'GST Invoice',
    currency: 'INR',
    contract: 450000,
    exchangeRate: 1,
    contractValue: 450000,
    totalReceived: 450000,
    balance: 0,
    projectManager: 'Kabir Singhal',
    notes: 'MQL5 High-frequency scalping robot delivered with 1.8 Profit Factor over 3-year tick backtest.',
    paymentPhases: [
      {
        id: 'phase-fxl-3-1',
        name: 'Phase 1 - Algorithm Strategy & Strategy Tester Run',
        percentage: 50,
        amount: 225000,
        amountINR: 225000,
        dueDate: '2026-06-05',
        status: 'Received',
        notes: 'Backtesting deliverable approved.',
      },
      {
        id: 'phase-fxl-3-2',
        name: 'Phase 2 - VPS Deployment & Live Forward Test',
        percentage: 50,
        amount: 225000,
        amountINR: 225000,
        dueDate: '2026-07-08',
        status: 'Received',
        notes: 'Final settlement cleared after 30-day forward paper testing.',
      },
    ],
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-07-12T16:00:00Z',
  },
];

const FXL_PAYMENTS: Payment[] = [
  {
    id: 'FXL-PAY-001',
    brand: 'FX Launch Pad',
    projectId: 'FXL - APEXTRADER PROP CAPITAL DUBAI - PROP FIRM CHALLENGE & RISK PORTAL - 1',
    clientId: 'FXL-CL-001',
    clientName: 'ApexTrader Prop Capital Dubai',
    paymentMode: 'Crypto',
    paymentDate: '2026-07-05',
    dueDate: '2026-07-05',
    amountReceived: 6000,
    currency: 'USD',
    exchangeRate: 84.5,
    amountINR: 507000,
    referenceUtr: 'TXID-USDT-TRC20-992144',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'USDT TRC20 remittance confirmed by treasury.',
    createdAt: '2026-07-05T10:00:00Z',
    updatedAt: '2026-07-05T10:00:00Z',
    amount: 507000,
    receivedAmount: 507000,
    outstandingAmount: 0,
    paymentMethod: 'Crypto',
  },
  {
    id: 'FXL-PAY-002',
    brand: 'FX Launch Pad',
    projectId: 'FXL - APEXTRADER PROP CAPITAL DUBAI - PROP FIRM CHALLENGE & RISK PORTAL - 1',
    clientId: 'FXL-CL-001',
    clientName: 'ApexTrader Prop Capital Dubai',
    paymentMode: 'Crypto',
    paymentDate: '2026-08-30',
    dueDate: '2026-08-30',
    amountReceived: 6000,
    currency: 'USD',
    exchangeRate: 84.5,
    amountINR: 507000,
    referenceUtr: 'INV-FXL-2026-002',
    paymentStatus: 'Pending',
    daysOverdue: calculateDaysOverdue('2026-08-30', 'Pending'),
    notes: 'Milestone 2 final challenge portal release invoice pending crypto payment.',
    createdAt: '2026-08-25T11:00:00Z',
    updatedAt: '2026-08-25T11:00:00Z',
    amount: 507000,
    receivedAmount: 0,
    outstandingAmount: 507000,
    paymentMethod: 'Crypto',
  },
  {
    id: 'FXL-PAY-003',
    brand: 'FX Launch Pad',
    projectId: 'FXL - BLUEWAVE FX GLOBAL CYPRUS - BROKER CRM & INSTANT KYC ENGINE - 1',
    clientId: 'FXL-CL-002',
    clientName: 'BlueWave FX Global Cyprus',
    paymentMode: 'Non GST Online',
    paymentDate: '2026-08-15',
    dueDate: '2026-08-15',
    amountReceived: 4750,
    currency: 'EUR',
    exchangeRate: 92.0,
    amountINR: 437000,
    referenceUtr: 'SEPA-CY-99281726',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Cyprus SEPA corporate international remittance received.',
    createdAt: '2026-08-15T11:30:00Z',
    updatedAt: '2026-08-15T11:30:00Z',
    amount: 437000,
    receivedAmount: 437000,
    outstandingAmount: 0,
    paymentMethod: 'Non GST Online',
  },
  {
    id: 'FXL-PAY-004',
    brand: 'FX Launch Pad',
    projectId: 'FXL - QUANTUMPIP TRADING LABS - CUSTOM MT5 AUTOMATED TRADING EA - 1',
    clientId: 'FXL-CL-003',
    clientName: 'QuantumPip Trading Labs',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-07-08',
    dueDate: '2026-07-08',
    amountReceived: 450000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 450000,
    referenceUtr: 'UTR-ICIC-FXL-77192',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Full payment for MT5 algorithmic trading engine.',
    createdAt: '2026-07-08T10:00:00Z',
    updatedAt: '2026-07-08T10:00:00Z',
    amount: 450000,
    receivedAmount: 450000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
];

const FXL_ROLES: EmployeeRole[] = [
  {
    id: 'FXL-ROL-001',
    brand: 'FX Launch Pad',
    roleName: 'MQL5 & Algo Trading Specialist',
    department: 'Quantitative Engineering',
    status: 'Active',
    description: 'MetaTrader 5 Expert Advisors, C++ quantitative execution, FIX protocol, and low-latency algorithmic trading.',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-01T00:00:00Z',
  },
  {
    id: 'FXL-ROL-002',
    brand: 'FX Launch Pad',
    roleName: 'FinTech Backend Architect',
    department: 'Broker Platform Systems',
    status: 'Active',
    description: 'High-frequency WebSocket bridges, SumSub KYC integrations, multi-currency ledger balance synchronization.',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-01T00:00:00Z',
  },
  {
    id: 'FXL-ROL-003',
    brand: 'FX Launch Pad',
    roleName: 'Financial Risk & Compliance Analyst',
    department: 'Prop Firm Risk Operations',
    status: 'Active',
    description: 'Drawdown violation detection algorithms, CySEC/FCA reporting standards, and liquidity bridge auditing.',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-01T00:00:00Z',
  },
];

const FXL_EMPLOYEES: Employee[] = [
  {
    id: 'FXL-EMP-001',
    brand: 'FX Launch Pad',
    name: 'Sameer Saxena',
    roleId: 'FXL-ROL-001',
    email: 'sameer.s@fxlaunchpad.com',
    status: 'Active',
    joiningDate: '2025-05-15',
    costOfEmployee: 120000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Quantitative developer with 7+ years developing automated trading systems on MT4/MT5 and cTrader.',
    joinedDate: '2025-05-15',
    salary: 120000,
    monthlyCost: 120000,
    phone: '+91 99102 33445',
    assignedProjectsCount: 2,
    createdAt: '2025-05-15T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'FXL-EMP-002',
    brand: 'FX Launch Pad',
    name: 'Kabir Singhal',
    roleId: 'FXL-ROL-002',
    email: 'kabir.s@fxlaunchpad.com',
    status: 'Active',
    joiningDate: '2025-06-01',
    costOfEmployee: 110000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Engineers low-latency bridges connecting MetaTrader servers with web client CRM portals.',
    joinedDate: '2025-06-01',
    salary: 110000,
    monthlyCost: 110000,
    phone: '+91 98203 11992',
    assignedProjectsCount: 2,
    createdAt: '2025-06-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'FXL-EMP-003',
    brand: 'FX Launch Pad',
    name: 'Pooja Nair',
    roleId: 'FXL-ROL-003',
    email: 'pooja.n@fxlaunchpad.com',
    status: 'Active',
    joiningDate: '2025-08-01',
    costOfEmployee: 85000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Specializes in prop firm challenge risk models and trading contest leaderboard telemetry.',
    joinedDate: '2025-08-01',
    salary: 85000,
    monthlyCost: 85000,
    phone: '+91 97401 88220',
    assignedProjectsCount: 1,
    createdAt: '2025-08-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
];

const FXL_ASSIGNMENTS: Assignment[] = [
  {
    id: 'FXL-ASN-001',
    brand: 'FX Launch Pad',
    projectId: 'FXL - APEXTRADER PROP CAPITAL DUBAI - PROP FIRM CHALLENGE & RISK PORTAL - 1',
    clientId: 'FXL-CL-001',
    clientName: 'ApexTrader Prop Capital Dubai',
    employeeId: 'FXL-EMP-001',
    employeeName: 'Sameer Saxena',
    roleName: 'MQL5 & Algo Trading Specialist',
    assignedDate: '2026-07-02',
    workAssigned: 'MT5 Manager API WebSocket Bridge & Real-time Drawdown Monitor',
    amount: 240000,
    amountPaid: 140000,
    paymentStatus: 'Partially Paid',
    employeeNotes: 'Engineered sub-50ms drawdown alert triggers and auto account suspension hooks.',
    lastNoteUpdate: '2026-07-28 18:00',
    createdAt: '2026-07-02T10:00:00Z',
    updatedAt: '2026-07-28T18:00:00Z',
  },
  {
    id: 'FXL-ASN-002',
    brand: 'FX Launch Pad',
    projectId: 'FXL - BLUEWAVE FX GLOBAL CYPRUS - BROKER CRM & INSTANT KYC ENGINE - 1',
    clientId: 'FXL-CL-002',
    clientName: 'BlueWave FX Global Cyprus',
    employeeId: 'FXL-EMP-002',
    employeeName: 'Kabir Singhal',
    roleName: 'FinTech Backend Architect',
    assignedDate: '2026-08-12',
    workAssigned: 'SumSub KYC Webhook & Instant Trader Onboarding Flow',
    amount: 190000,
    amountPaid: 190000,
    paymentStatus: 'Paid',
    employeeNotes: 'KYC automated verification workflow passed CySEC compliance audit.',
    lastNoteUpdate: '2026-09-10 14:30',
    createdAt: '2026-08-12T11:00:00Z',
    updatedAt: '2026-09-10T14:30:00Z',
  },
  {
    id: 'FXL-ASN-003',
    brand: 'FX Launch Pad',
    projectId: 'FXL - QUANTUMPIP TRADING LABS - CUSTOM MT5 AUTOMATED TRADING EA - 1',
    clientId: 'FXL-CL-003',
    clientName: 'QuantumPip Trading Labs',
    employeeId: 'FXL-EMP-001',
    employeeName: 'Sameer Saxena',
    roleName: 'MQL5 & Algo Trading Specialist',
    assignedDate: '2026-06-02',
    workAssigned: 'MQL5 EA Grid Optimization & Low-Latency Trailing Stop Algorithm',
    amount: 150000,
    amountPaid: 150000,
    paymentStatus: 'Paid',
    employeeNotes: 'Optimized execution speed with zero slippage in backtests.',
    lastNoteUpdate: '2026-06-28 17:00',
    createdAt: '2026-06-02T09:30:00Z',
    updatedAt: '2026-06-28T17:00:00Z',
  },
];

const FXL_EMPLOYEE_PAYMENTS: EmployeePayment[] = [
  {
    id: 'FXL-EPAY-001',
    brand: 'FX Launch Pad',
    assignmentId: 'FXL-ASN-001',
    projectId: 'FXL - APEXTRADER PROP CAPITAL DUBAI - PROP FIRM CHALLENGE & RISK PORTAL - 1',
    employeeId: 'FXL-EMP-001',
    employeeName: 'Sameer Saxena',
    paymentDate: '2026-08-10',
    amountPaid: 140000,
    paymentMode: 'Non GST Online',
    referenceUtr: 'EPAY-UPI-FXL-1192',
    notes: 'Drawdown monitor milestone clearance.',
    createdAt: '2026-08-10T11:00:00Z',
    updatedAt: '2026-08-10T11:00:00Z',
  },
  {
    id: 'FXL-EPAY-002',
    brand: 'FX Launch Pad',
    assignmentId: 'FXL-ASN-002',
    projectId: 'FXL - BLUEWAVE FX GLOBAL CYPRUS - BROKER CRM & INSTANT KYC ENGINE - 1',
    employeeId: 'FXL-EMP-002',
    employeeName: 'Kabir Singhal',
    paymentDate: '2026-07-25',
    amountPaid: 190000,
    paymentMode: 'GST Invoice',
    referenceUtr: 'EPAY-NEFT-FXL-4412',
    notes: 'KYC engine deliverable cleared.',
    createdAt: '2026-07-25T14:00:00Z',
    updatedAt: '2026-07-25T14:00:00Z',
  },
  {
    id: 'FXL-EPAY-003',
    brand: 'FX Launch Pad',
    assignmentId: 'FXL-ASN-003',
    projectId: 'FXL - QUANTUMPIP TRADING LABS - CUSTOM MT5 AUTOMATED TRADING EA - 1',
    employeeId: 'FXL-EMP-001',
    employeeName: 'Sameer Saxena',
    paymentDate: '2026-09-05',
    amountPaid: 150000,
    paymentMode: 'Non GST Online',
    referenceUtr: 'EPAY-IMPS-FXL-9901',
    notes: 'EA code handover and client sign-off settlement.',
    createdAt: '2026-09-05T12:00:00Z',
    updatedAt: '2026-09-05T12:00:00Z',
  },
];

const FXL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'FXL-EXPCAT-001',
    brand: 'FX Launch Pad',
    name: 'VPS & Ultra-Low Latency Hosting',
    description: 'Dedicated Windows Server VPS in Equinix LD4 (London) & NY4 (New York) cross-connects.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-01T00:00:00Z',
  },
  {
    id: 'FXL-EXPCAT-002',
    brand: 'FX Launch Pad',
    name: 'Forex Data Feeds & Liquidity APIs',
    description: 'Tick data subscriptions, LMAX / OneZero liquidity bridges, and economic calendar feeds.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-01T00:00:00Z',
  },
  {
    id: 'FXL-EXPCAT-003',
    brand: 'FX Launch Pad',
    name: 'Trading Community Marketing & Ads',
    description: 'Meta Ads, financial Telegram channel promotions, and trader acquisition campaigns.',
    status: 'Active',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-01T00:00:00Z',
  },
];

const FXL_EXPENSES: Expense[] = [
  {
    id: 'FXL-EXP-001',
    brand: 'FX Launch Pad',
    projectId: 'FXL - APEXTRADER PROP CAPITAL DUBAI - PROP FIRM CHALLENGE & RISK PORTAL - 1',
    clientId: 'FXL-CL-001',
    clientName: 'ApexTrader Prop Capital Dubai',
    expenseCategoryId: 'FXL-EXPCAT-001',
    expenseCategoryName: 'VPS & Ultra-Low Latency Hosting',
    vendor: 'BeeksFX / Equinix London LD4',
    description: 'Dedicated high-frequency VPS cross-connected to MetaQuotes data servers.',
    amount: 42000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 42000,
    expenseDate: '2026-08-10',
    paymentStatus: 'Paid',
    notes: 'Billed to ApexTrader infrastructure budget.',
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-08-10T10:00:00Z',
  },
  {
    id: 'FXL-EXP-002',
    brand: 'FX Launch Pad',
    projectId: 'NA',
    clientId: 'NA',
    clientName: 'NA',
    expenseCategoryId: 'FXL-EXPCAT-002',
    expenseCategoryName: 'Forex Data Feeds & Liquidity APIs',
    vendor: 'Tick Data LLC',
    description: 'Institutional real-time tick historical archive for automated strategy validation.',
    amount: 38000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 38000,
    expenseDate: '2026-09-01',
    paymentStatus: 'Paid',
    notes: 'Quarterly tick data subscription.',
    createdAt: '2026-09-01T11:00:00Z',
    updatedAt: '2026-09-01T11:00:00Z',
  },
];

const FXL_GST_INVOICES: GstInvoice[] = [
  {
    id: 'FXL-GST-001',
    brand: 'FX Launch Pad',
    paymentId: 'FXL-PAY-004',
    projectId: 'FXL - QUANTUMPIP TRADING LABS - CUSTOM MT5 AUTOMATED TRADING EA - 1',
    clientId: 'FXL-CL-003',
    clientName: 'QuantumPip Trading Labs',
    paymentDate: '2026-07-08',
    amountReceived: 450000,
    currency: 'INR',
    amountINR: 450000,
    gstAmountINR: 81000,
    invoiceNumber: 'INV-FXL-2026-001',
    uploadedToGstPortal: 'Yes',
    gstPortalUploadDate: '2026-07-12',
    notes: 'GST invoice for QuantumPip trading bot project.',
    createdAt: '2026-07-08T10:00:00Z',
    updatedAt: '2026-07-12T14:00:00Z',
  },
];

// Combine all three brands into master initial datasets
const INITIAL_CLIENTS: Client[] = [...DDI_CLIENTS, ...CDS_CLIENTS, ...FXL_CLIENTS];
const INITIAL_CATEGORIES: ServiceCategory[] = [...DDI_CATEGORIES, ...CDS_CATEGORIES, ...FXL_CATEGORIES];
const INITIAL_SERVICES: Service[] = [...DDI_SERVICES, ...CDS_SERVICES, ...FXL_SERVICES];
const INITIAL_PROJECTS: Project[] = [...DDI_PROJECTS, ...CDS_PROJECTS, ...FXL_PROJECTS];
const INITIAL_PAYMENTS: Payment[] = [...DDI_PAYMENTS, ...CDS_PAYMENTS, ...FXL_PAYMENTS];
const INITIAL_ROLES: EmployeeRole[] = [...DDI_ROLES, ...CDS_ROLES, ...FXL_ROLES];
const INITIAL_EMPLOYEES: Employee[] = [...DDI_EMPLOYEES, ...CDS_EMPLOYEES, ...FXL_EMPLOYEES];
const INITIAL_ASSIGNMENTS: Assignment[] = [...DDI_ASSIGNMENTS, ...CDS_ASSIGNMENTS, ...FXL_ASSIGNMENTS];
const INITIAL_EMPLOYEE_PAYMENTS: EmployeePayment[] = [...DDI_EMPLOYEE_PAYMENTS, ...CDS_EMPLOYEE_PAYMENTS, ...FXL_EMPLOYEE_PAYMENTS];
const INITIAL_EXPENSE_CATEGORIES: ExpenseCategory[] = [...DDI_EXPENSE_CATEGORIES, ...CDS_EXPENSE_CATEGORIES, ...FXL_EXPENSE_CATEGORIES];
const INITIAL_EXPENSES: Expense[] = [...DDI_EXPENSES, ...CDS_EXPENSES, ...FXL_EXPENSES];
const INITIAL_GST_INVOICES: GstInvoice[] = [...DDI_GST_INVOICES, ...CDS_GST_INVOICES, ...FXL_GST_INVOICES];

const DEFAULT_AUTH_USER: AuthUser = {
  id: 'USR-001',
  name: 'Admin Desk',
  email: 'admin@devicedoctor.in',
  role: 'Super Administrator',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80',
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

  // --- Initializer & Multi-Brand Data Migrator ---
  public init() {
    if (typeof window === 'undefined') return;

    if (!localStorage.getItem(STORAGE_KEYS.CLIENTS)) {
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(INITIAL_CLIENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(INITIAL_CATEGORIES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SERVICES)) {
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(INITIAL_SERVICES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PROJECTS)) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(INITIAL_PROJECTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PAYMENTS)) {
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(INITIAL_PAYMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ROLES)) {
      localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(INITIAL_ROLES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EMPLOYEES)) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(INITIAL_EMPLOYEES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS)) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(INITIAL_ASSIGNMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS)) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(INITIAL_EMPLOYEE_PAYMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EXPENSE_CATEGORIES)) {
      localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(INITIAL_EXPENSE_CATEGORIES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EXPENSES)) {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(INITIAL_EXPENSES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.GST_INVOICES)) {
      localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(INITIAL_GST_INVOICES));
    }

    // Multi-Brand Migration: Ensure every stored entity has a brand, and seed Codestro & FX Launch Pad
    const MULTI_BRAND_SEED_KEY = 'ddi_multi_brand_seed_v4';
    if (!localStorage.getItem(MULTI_BRAND_SEED_KEY)) {
      try {
        const seedTable = <T extends { id: string; brand?: BrandName }>(
          key: string,
          initialList: T[]
        ) => {
          const raw = localStorage.getItem(key);
          const current: T[] = raw ? JSON.parse(raw) : [];
          // 1. Tag existing items without brand with 'Device Doctor India'
          const tagged: any[] = current.map((item) => ({
            ...item,
            brand: item.brand || 'Device Doctor India',
          }));
          // 2. Add any seed items from Codestro or FX Launch Pad that are not in current
          initialList.forEach((seedItem) => {
            if (!tagged.some((item) => item.id === seedItem.id)) {
              tagged.push(seedItem);
            }
          });
          localStorage.setItem(key, JSON.stringify(tagged));
        };

        seedTable(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
        seedTable(STORAGE_KEYS.CATEGORIES, INITIAL_CATEGORIES);
        seedTable(STORAGE_KEYS.SERVICES, INITIAL_SERVICES);
        seedTable(STORAGE_KEYS.PROJECTS, INITIAL_PROJECTS);
        seedTable(STORAGE_KEYS.PAYMENTS, INITIAL_PAYMENTS);
        seedTable(STORAGE_KEYS.ROLES, INITIAL_ROLES);
        seedTable(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES);
        seedTable(STORAGE_KEYS.ASSIGNMENTS, INITIAL_ASSIGNMENTS);
        seedTable(STORAGE_KEYS.EMPLOYEE_PAYMENTS, INITIAL_EMPLOYEE_PAYMENTS);
        seedTable(STORAGE_KEYS.EXPENSE_CATEGORIES, INITIAL_EXPENSE_CATEGORIES);
        seedTable(STORAGE_KEYS.EXPENSES, INITIAL_EXPENSES);
        seedTable(STORAGE_KEYS.GST_INVOICES, INITIAL_GST_INVOICES);

        localStorage.setItem(MULTI_BRAND_SEED_KEY, 'true');
      } catch (e) {
        console.warn('Multi-brand seed migration error:', e);
      }
    }
  }

  // --- Reset All To Initial Seed ---
  public resetToSampleData() {
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(INITIAL_CLIENTS));
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(INITIAL_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(INITIAL_SERVICES));
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(INITIAL_PROJECTS));
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(INITIAL_PAYMENTS));
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(INITIAL_ROLES));
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(INITIAL_EMPLOYEES));
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(INITIAL_ASSIGNMENTS));
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(INITIAL_EMPLOYEE_PAYMENTS));
    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(INITIAL_EXPENSE_CATEGORIES));
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(INITIAL_EXPENSES));
    localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(INITIAL_GST_INVOICES));
    this.notifyListeners();
  }

  // --- Active Brand Workspace ---
  public getActiveBrand(): BrandName {
    if (typeof window === 'undefined') return 'Device Doctor India';
    const saved = localStorage.getItem(STORAGE_KEYS.BRAND);
    if (saved === 'Codestro' || saved === 'FX Launch Pad' || saved === 'Device Doctor India') {
      return saved;
    }
    return 'Device Doctor India';
  }

  public setActiveBrand(brand: BrandName) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.BRAND, brand);
    this.notifyListeners();
  }

  // --- Auth Session ---
  public getAuthUser(): AuthUser | null {
    if (typeof window === 'undefined') return DEFAULT_AUTH_USER;
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(DEFAULT_AUTH_USER));
      return DEFAULT_AUTH_USER;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public setAuthUser(user: AuthUser | null) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
    }
    this.notifyListeners();
  }

  public getDefaultAdmin(): AuthUser {
    return DEFAULT_AUTH_USER;
  }

  // --- Theme ---
  public getTheme(): 'dark' | 'light' {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  public setTheme(theme: 'dark' | 'light') {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    this.notifyListeners();
  }

  // --- Dynamic Brand-Aware ID Generation ---
  public generateId(type: string, brand?: BrandName): string {
    const currentBrand = brand || this.getActiveBrand();
    const prefix = getBrandPrefix(currentBrand); // 'DDI' | 'CDS' | 'FXL'

    // Clean up prefix if already present in type
    const cleanType = type.replace(/^(DDI|CDS|FXL)-/, '');

    let list: Array<{ id: string; brand?: BrandName }> = [];
    switch (cleanType) {
      case 'CL': list = this.getClients(); break;
      case 'CAT': list = this.getCategories(); break;
      case 'SRV': list = this.getServices(); break;
      case 'PRJ': list = this.getProjects(); break;
      case 'PAY': list = this.getPayments(); break;
      case 'ROL': list = this.getRoles(); break;
      case 'EMP': list = this.getEmployees(); break;
      case 'ASN': list = this.getAssignments(); break;
      case 'EPAY': list = this.getEmployeePayments(); break;
      case 'EXPCAT': list = this.getExpenseCategories(); break;
      case 'EXP': list = this.getExpenses(); break;
      case 'GST': list = this.getGstInvoices(); break;
      default: list = [];
    }

    // Filter items matching the requested brand or starting with the brand prefix
    const brandItems = list.filter(
      (item) => item.brand === currentBrand || (item.id && item.id.startsWith(prefix))
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

  // --- Smart Dynamic Project ID Generator (Format: [PREFIX] - [CLIENT NAME] - [SERVICE NAME] - [SEQUENCE]) ---
  public generateSmartProjectId(
    clientName: string,
    serviceName: string,
    clientId?: string,
    serviceId?: string,
    currentProjectId?: string,
    brand?: BrandName
  ): string {
    const currentBrand = brand || this.getActiveBrand();
    const prefix = getBrandPrefix(currentBrand);
    const cleanClient = (clientName || 'CLIENT').trim().toUpperCase();
    const cleanService = (serviceName || 'SERVICE').trim().toUpperCase();
    const projects = this.getProjects();

    const matchingProjects = projects.filter((p) => {
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

    const nextSeq = maxSeq > 0 ? maxSeq + 1 : (matchingProjects.length + 1);
    return `${prefix} - ${cleanClient} - ${cleanService} - ${nextSeq}`;
  }

  // --- CLIENTS ---
  public getClients(): Client[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CLIENTS);
      return raw ? JSON.parse(raw) : INITIAL_CLIENTS;
    } catch {
      return INITIAL_CLIENTS;
    }
  }

  public saveClient(client: Client): { success: boolean; error?: string } {
    const clients = this.getClients();
    const activeBrand = client.brand || this.getActiveBrand();
    client.brand = activeBrand;

    if (client.gstNumber && client.gstNumber.trim().length > 0) {
      const cleanGST = client.gstNumber.trim().toUpperCase();
      if (!/^[0-9A-Z]{15}$/.test(cleanGST)) {
        return { success: false, error: 'GST Number must be strictly 15 alphanumeric characters.' };
      }
      const duplicate = clients.find(
        (c) => c.id !== client.id && c.gstNumber?.trim().toUpperCase() === cleanGST
      );
      if (duplicate) {
        return { success: false, error: `GST Number is already registered for client: ${duplicate.name}` };
      }
      client.gstNumber = cleanGST;
    } else {
      client.gstNumber = undefined;
    }

    const existingIndex = clients.findIndex((c) => c.id === client.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      clients[existingIndex] = {
        ...clients[existingIndex],
        ...client,
        updatedAt: now,
      };
    } else {
      if (!client.id) {
        client.id = this.generateId('CL', activeBrand);
      }
      client.createdAt = now;
      client.updatedAt = now;
      clients.unshift(client);
    }

    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteClient(clientId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const projects = this.getProjects();
    const linkedProjects = projects.filter((p) => p.clientId === clientId);
    if (linkedProjects.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete client because they have ${linkedProjects.length} linked Project record(s). Mark client as Inactive instead to preserve historical records.`,
        linkedCount: linkedProjects.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteClient(clientId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteClient(clientId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const clients = this.getClients().filter((c) => c.id !== clientId);
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    this.notifyListeners();
    return { success: true };
  }

  public setClientStatus(clientId: string, status: Client['status']) {
    const clients = this.getClients().map((c) =>
      c.id === clientId ? { ...c, status, updatedAt: new Date().toISOString() } : c
    );
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    this.notifyListeners();
  }

  // --- SERVICE CATEGORIES ---
  public getCategories(): ServiceCategory[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      return raw ? JSON.parse(raw) : INITIAL_CATEGORIES;
    } catch {
      return INITIAL_CATEGORIES;
    }
  }

  public saveCategory(category: ServiceCategory): { success: boolean; error?: string } {
    const categories = this.getCategories();
    const activeBrand = category.brand || this.getActiveBrand();
    category.brand = activeBrand;

    const duplicate = categories.find(
      (c) =>
        c.id !== category.id &&
        (c.brand === activeBrand || !c.brand) &&
        c.name.trim().toLowerCase() === category.name.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Category name "${category.name}" already exists for brand ${activeBrand}. Category names must be unique within a brand.` };
    }

    const existingIndex = categories.findIndex((c) => c.id === category.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      categories[existingIndex] = {
        ...categories[existingIndex],
        ...category,
        name: category.name.trim(),
        updatedAt: now,
      };
    } else {
      if (!category.id) {
        category.id = this.generateId('CAT', activeBrand);
      }
      category.name = category.name.trim();
      category.createdAt = now;
      category.updatedAt = now;
      categories.push(category);
    }

    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteCategory(categoryId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const services = this.getServices();
    const linkedServices = services.filter((s) => s.categoryId === categoryId);
    if (linkedServices.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete category because ${linkedServices.length} Service(s) currently use it.`,
        linkedCount: linkedServices.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteCategory(categoryId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteCategory(categoryId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const categories = this.getCategories().filter((c) => c.id !== categoryId);
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    this.notifyListeners();
    return { success: true };
  }

  public setCategoryStatus(categoryId: string, status: ServiceCategory['status']) {
    const categories = this.getCategories().map((c) =>
      c.id === categoryId ? { ...c, status, updatedAt: new Date().toISOString() } : c
    );
    localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    this.notifyListeners();
  }

  // --- SERVICES ---
  public getServices(): Service[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SERVICES);
      return raw ? JSON.parse(raw) : INITIAL_SERVICES;
    } catch {
      return INITIAL_SERVICES;
    }
  }

  public saveService(service: Service): { success: boolean; error?: string } {
    const services = this.getServices();
    const activeBrand = service.brand || this.getActiveBrand();
    service.brand = activeBrand;

    if (!service.name || service.name.trim().length === 0) {
      return { success: false, error: 'Service name is required.' };
    }
    if (!service.categoryId) {
      return { success: false, error: 'A valid Service Category must be selected.' };
    }

    const existingIndex = services.findIndex((s) => s.id === service.id);
    const now = new Date().toISOString();

    const cleanService: Service = {
      id: service.id,
      brand: activeBrand,
      name: service.name.trim(),
      categoryId: service.categoryId,
      description: service.description || '',
      status: service.status || 'Active',
      createdAt: service.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      services[existingIndex] = {
        ...services[existingIndex],
        ...cleanService,
      };
    } else {
      if (!cleanService.id) {
        cleanService.id = this.generateId('SRV', activeBrand);
      }
      cleanService.createdAt = now;
      services.push(cleanService);
    }

    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteService(serviceId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const projects = this.getProjects();
    const linkedProjects = projects.filter((p) => p.serviceId === serviceId);
    if (linkedProjects.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete service because it is currently assigned to ${linkedProjects.length} Project(s).`,
        linkedCount: linkedProjects.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteService(serviceId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteService(serviceId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const services = this.getServices().filter((s) => s.id !== serviceId);
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    this.notifyListeners();
    return { success: true };
  }

  public setServiceStatus(serviceId: string, status: Service['status']) {
    const services = this.getServices().map((s) =>
      s.id === serviceId ? { ...s, status, updatedAt: new Date().toISOString() } : s
    );
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    this.notifyListeners();
  }

  // --- PROJECTS ---
  public getProjects(): Project[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return raw ? JSON.parse(raw) : INITIAL_PROJECTS;
    } catch {
      return INITIAL_PROJECTS;
    }
  }

  public saveProject(project: Project): { success: boolean; error?: string } {
    const projects = this.getProjects();
    const activeBrand = project.brand || this.getActiveBrand();
    project.brand = activeBrand;

    if (!project.clientId) {
      return { success: false, error: 'A Client must be selected.' };
    }
    if (!project.serviceId) {
      return { success: false, error: 'A Service must be selected.' };
    }

    const client = this.getClients().find((c) => c.id === project.clientId);
    if (client) {
      project.clientName = client.name;
    }

    const service = this.getServices().find((s) => s.id === project.serviceId);

    const now = new Date().toISOString();
    const existingIndex = projects.findIndex((p) => p.id === project.id);

    // Dynamic balance calculation
    const contractVal = Number(project.contractValue) || 0;
    const received = Number(project.totalReceived) || 0;
    project.balance = Math.max(0, contractVal - received);

    if (existingIndex >= 0) {
      projects[existingIndex] = {
        ...projects[existingIndex],
        ...project,
        updatedAt: now,
      };
    } else {
      if (!project.id) {
        project.id = this.generateSmartProjectId(
          project.clientName || 'CLIENT',
          service?.name || 'SERVICE',
          project.clientId,
          project.serviceId,
          undefined,
          activeBrand
        );
      }
      project.createdAt = now;
      project.updatedAt = now;
      projects.unshift(project);
    }

    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteProject(projectId: string): {
    allowed: boolean;
    reason?: string;
    linkedCount: number;
    blockType?: 'payments' | 'assignments';
  } {
    const assignments = this.getAssignments();
    const linkedAssignments = assignments.filter((a) => a.projectId === projectId);
    if (linkedAssignments.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete project because it has ${linkedAssignments.length} linked Employee Assignment(s).`,
        linkedCount: linkedAssignments.length,
        blockType: 'assignments',
      };
    }

    const payments = this.getPayments();
    const linkedPayments = payments.filter((p) => p.projectId === projectId);
    if (linkedPayments.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete project because it has ${linkedPayments.length} linked Payment record(s).`,
        linkedCount: linkedPayments.length,
        blockType: 'payments',
      };
    }

    return { allowed: true, linkedCount: 0 };
  }

  public deleteProject(projectId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteProject(projectId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const projects = this.getProjects().filter((p) => p.id !== projectId);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    this.notifyListeners();
    return { success: true };
  }

  public setProjectStatus(projectId: string, status: Project['status']) {
    const projects = this.getProjects().map((p) =>
      p.id === projectId ? { ...p, status, updatedAt: new Date().toISOString() } : p
    );
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    this.notifyListeners();
  }

  // --- PAYMENTS ---
  public getPayments(): Payment[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
      return raw ? JSON.parse(raw) : INITIAL_PAYMENTS;
    } catch {
      return INITIAL_PAYMENTS;
    }
  }

  public savePayment(payment: Payment): { success: boolean; error?: string } {
    const payments = this.getPayments();
    const activeBrand = payment.brand || this.getActiveBrand();
    payment.brand = activeBrand;

    // Check unique UTR
    if (payment.referenceUtr && payment.referenceUtr.trim()) {
      const cleanUtr = payment.referenceUtr.trim().toUpperCase();
      const dup = payments.find(
        (p) => p.id !== payment.id && p.referenceUtr?.trim().toUpperCase() === cleanUtr
      );
      if (dup) {
        return { success: false, error: `Reference UTR "${payment.referenceUtr}" is already recorded in Payment ${dup.id}.` };
      }
      payment.referenceUtr = cleanUtr;
    }

    const now = new Date().toISOString();
    const existingIndex = payments.findIndex((p) => p.id === payment.id);

    // Auto-calculate overdue
    payment.daysOverdue = calculateDaysOverdue(payment.dueDate, payment.paymentStatus);

    if (existingIndex >= 0) {
      payments[existingIndex] = {
        ...payments[existingIndex],
        ...payment,
        updatedAt: now,
      };
    } else {
      if (!payment.id) {
        payment.id = this.generateId('PAY', activeBrand);
      }
      payment.createdAt = now;
      payment.updatedAt = now;
      payments.unshift(payment);
    }

    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));

    // Update Project received & balance
    if (payment.projectId) {
      this.recalculateProjectFinancials(payment.projectId);
    }

    this.notifyListeners();
    return { success: true };
  }

  public deletePayment(paymentId: string): { success: boolean; error?: string } {
    const payments = this.getPayments();
    const target = payments.find((p) => p.id === paymentId);
    const updated = payments.filter((p) => p.id !== paymentId);
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(updated));

    if (target?.projectId) {
      this.recalculateProjectFinancials(target.projectId);
    }

    this.notifyListeners();
    return { success: true };
  }

  private recalculateProjectFinancials(projectId: string) {
    const projects = this.getProjects();
    const projectIndex = projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) return;

    const payments = this.getPayments().filter(
      (p) => p.projectId === projectId && p.paymentStatus === 'Received'
    );
    const totalReceived = payments.reduce(
      (sum, p) => sum + (Number(p.amountINR) || Number(p.amountReceived) || 0),
      0
    );

    const contractValue = projects[projectIndex].contractValue || 0;
    projects[projectIndex].totalReceived = totalReceived;
    projects[projectIndex].balance = Math.max(0, contractValue - totalReceived);
    projects[projectIndex].updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }

  // --- EMPLOYEE ROLES ---
  public getRoles(): EmployeeRole[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ROLES);
      return raw ? JSON.parse(raw) : INITIAL_ROLES;
    } catch {
      return INITIAL_ROLES;
    }
  }

  public saveRole(role: EmployeeRole): { success: boolean; error?: string } {
    const roles = this.getRoles();
    const activeBrand = role.brand || this.getActiveBrand();
    role.brand = activeBrand;

    const duplicate = roles.find(
      (r) =>
        r.id !== role.id &&
        (r.brand === activeBrand || !r.brand) &&
        r.roleName.trim().toLowerCase() === role.roleName.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Role name "${role.roleName}" already exists for ${activeBrand}.` };
    }

    const existingIndex = roles.findIndex((r) => r.id === role.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      roles[existingIndex] = {
        ...roles[existingIndex],
        ...role,
        updatedAt: now,
      };
    } else {
      if (!role.id) {
        role.id = this.generateId('ROL', activeBrand);
      }
      role.createdAt = now;
      role.updatedAt = now;
      roles.push(role);
    }

    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteRole(roleId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const employees = this.getEmployees();
    const linked = employees.filter((e) => e.roleId === roleId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete role because it is assigned to ${linked.length} employee(s).`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteRole(roleId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteRole(roleId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const roles = this.getRoles().filter((r) => r.id !== roleId);
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
    this.notifyListeners();
    return { success: true };
  }

  // --- EMPLOYEES ---
  public getEmployees(): Employee[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      return raw ? JSON.parse(raw) : INITIAL_EMPLOYEES;
    } catch {
      return INITIAL_EMPLOYEES;
    }
  }

  public saveEmployee(employee: Employee): { success: boolean; error?: string } {
    const employees = this.getEmployees();
    const activeBrand = employee.brand || this.getActiveBrand();
    employee.brand = activeBrand;

    // Check unique email
    const duplicate = employees.find(
      (e) => e.id !== employee.id && e.email.trim().toLowerCase() === employee.email.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Email "${employee.email}" is already used by employee: ${duplicate.name}` };
    }

    const existingIndex = employees.findIndex((e) => e.id === employee.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      employees[existingIndex] = {
        ...employees[existingIndex],
        ...employee,
        updatedAt: now,
      };
    } else {
      if (!employee.id) {
        employee.id = this.generateId('EMP', activeBrand);
      }
      employee.createdAt = now;
      employee.updatedAt = now;
      employees.push(employee);
    }

    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteEmployee(employeeId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const assignments = this.getAssignments();
    const linked = assignments.filter((a) => a.employeeId === employeeId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete employee because they have ${linked.length} task assignment(s).`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteEmployee(employeeId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteEmployee(employeeId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const employees = this.getEmployees().filter((e) => e.id !== employeeId);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    this.notifyListeners();
    return { success: true };
  }

  // --- ASSIGNMENTS ---
  public getAssignments(): Assignment[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
      return raw ? JSON.parse(raw) : INITIAL_ASSIGNMENTS;
    } catch {
      return INITIAL_ASSIGNMENTS;
    }
  }

  public saveAssignment(assignment: Assignment): { success: boolean; error?: string } {
    const assignments = this.getAssignments();
    const activeBrand = assignment.brand || this.getActiveBrand();
    assignment.brand = activeBrand;

    const existingIndex = assignments.findIndex((a) => a.id === assignment.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      assignments[existingIndex] = {
        ...assignments[existingIndex],
        ...assignment,
        updatedAt: now,
      };
    } else {
      if (!assignment.id) {
        assignment.id = this.generateId('ASN', activeBrand);
      }
      assignment.createdAt = now;
      assignment.updatedAt = now;
      assignments.unshift(assignment);
    }

    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteAssignment(assignmentId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const epays = this.getEmployeePayments();
    const linked = epays.filter((ep) => ep.assignmentId === assignmentId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete assignment because it has ${linked.length} linked payout records.`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteAssignment(assignmentId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteAssignment(assignmentId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const assignments = this.getAssignments().filter((a) => a.id !== assignmentId);
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    this.notifyListeners();
    return { success: true };
  }

  // --- EMPLOYEE PAYMENTS ---
  public getEmployeePayments(): EmployeePayment[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS);
      return raw ? JSON.parse(raw) : INITIAL_EMPLOYEE_PAYMENTS;
    } catch {
      return INITIAL_EMPLOYEE_PAYMENTS;
    }
  }

  public saveEmployeePayment(payment: EmployeePayment): { success: boolean; error?: string } {
    const epays = this.getEmployeePayments();
    const activeBrand = payment.brand || this.getActiveBrand();
    payment.brand = activeBrand;

    const existingIndex = epays.findIndex((p) => p.id === payment.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      epays[existingIndex] = {
        ...epays[existingIndex],
        ...payment,
        updatedAt: now,
      };
    } else {
      if (!payment.id) {
        payment.id = this.generateId('EPAY', activeBrand);
      }
      payment.createdAt = now;
      payment.updatedAt = now;
      epays.unshift(payment);
    }

    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(epays));

    // Update Assignment amountPaid
    if (payment.assignmentId) {
      const assignments = this.getAssignments();
      const asnIndex = assignments.findIndex((a) => a.id === payment.assignmentId);
      if (asnIndex >= 0) {
        const totalPaid = epays
          .filter((ep) => ep.assignmentId === payment.assignmentId)
          .reduce((sum, ep) => sum + (Number(ep.amountPaid) || 0), 0);
        assignments[asnIndex].amountPaid = totalPaid;
        if (totalPaid >= assignments[asnIndex].amount) {
          assignments[asnIndex].paymentStatus = 'Paid';
        } else if (totalPaid > 0) {
          assignments[asnIndex].paymentStatus = 'Partially Paid';
        }
        localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
      }
    }

    this.notifyListeners();
    return { success: true };
  }

  public deleteEmployeePayment(paymentId: string): { success: boolean; error?: string } {
    const epays = this.getEmployeePayments();
    const target = epays.find((p) => p.id === paymentId);
    const updated = epays.filter((p) => p.id !== paymentId);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(updated));

    if (target?.assignmentId) {
      const assignments = this.getAssignments();
      const asnIndex = assignments.findIndex((a) => a.id === target.assignmentId);
      if (asnIndex >= 0) {
        const totalPaid = updated
          .filter((ep) => ep.assignmentId === target.assignmentId)
          .reduce((sum, ep) => sum + (Number(ep.amountPaid) || 0), 0);
        assignments[asnIndex].amountPaid = totalPaid;
        localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
      }
    }

    this.notifyListeners();
    return { success: true };
  }

  // --- EXPENSE CATEGORIES ---
  public getExpenseCategories(): ExpenseCategory[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXPENSE_CATEGORIES);
      return raw ? JSON.parse(raw) : INITIAL_EXPENSE_CATEGORIES;
    } catch {
      return INITIAL_EXPENSE_CATEGORIES;
    }
  }

  public saveExpenseCategory(cat: ExpenseCategory): { success: boolean; error?: string } {
    const cats = this.getExpenseCategories();
    const activeBrand = cat.brand || this.getActiveBrand();
    cat.brand = activeBrand;

    const dup = cats.find(
      (c) =>
        c.id !== cat.id &&
        (c.brand === activeBrand || !c.brand) &&
        c.name.trim().toLowerCase() === cat.name.trim().toLowerCase()
    );
    if (dup) {
      return { success: false, error: `Expense Category "${cat.name}" already exists for ${activeBrand}.` };
    }

    const existingIndex = cats.findIndex((c) => c.id === cat.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      cats[existingIndex] = {
        ...cats[existingIndex],
        ...cat,
        updatedAt: now,
      };
    } else {
      if (!cat.id) {
        cat.id = this.generateId('EXPCAT', activeBrand);
      }
      cat.createdAt = now;
      cat.updatedAt = now;
      cats.push(cat);
    }

    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(cats));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteExpenseCategory(catId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const expenses = this.getExpenses();
    const linked = expenses.filter((e) => e.expenseCategoryId === catId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete expense category because ${linked.length} expense record(s) currently use it.`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public deleteExpenseCategory(catId: string): { success: boolean; error?: string; linkedCount?: number } {
    const check = this.canDeleteExpenseCategory(catId);
    if (!check.allowed) {
      return { success: false, error: check.reason, linkedCount: check.linkedCount };
    }
    const cats = this.getExpenseCategories().filter((c) => c.id !== catId);
    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(cats));
    this.notifyListeners();
    return { success: true };
  }

  public setExpenseCategoryStatus(catId: string, status: ExpenseCategory['status']) {
    const cats = this.getExpenseCategories().map((c) =>
      c.id === catId ? { ...c, status, updatedAt: new Date().toISOString() } : c
    );
    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(cats));
    this.notifyListeners();
  }

  // --- EXPENSES ---
  public getExpenses(): Expense[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      return raw ? JSON.parse(raw) : INITIAL_EXPENSES;
    } catch {
      return INITIAL_EXPENSES;
    }
  }

  public saveExpense(expense: Expense): { success: boolean; error?: string } {
    const expenses = this.getExpenses();
    const activeBrand = expense.brand || this.getActiveBrand();
    expense.brand = activeBrand;

    const existingIndex = expenses.findIndex((e) => e.id === expense.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      expenses[existingIndex] = {
        ...expenses[existingIndex],
        ...expense,
        updatedAt: now,
      };
    } else {
      if (!expense.id) {
        expense.id = this.generateId('EXP', activeBrand);
      }
      expense.createdAt = now;
      expense.updatedAt = now;
      expenses.unshift(expense);
    }

    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
    this.notifyListeners();
    return { success: true };
  }

  public deleteExpense(expenseId: string): { success: boolean; error?: string } {
    const expenses = this.getExpenses().filter((e) => e.id !== expenseId);
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
    this.notifyListeners();
    return { success: true };
  }

  // --- GST INVOICES ---
  public getGstInvoices(): GstInvoice[] {
    this.init();
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.GST_INVOICES);
      return raw ? JSON.parse(raw) : INITIAL_GST_INVOICES;
    } catch {
      return INITIAL_GST_INVOICES;
    }
  }

  public saveGstInvoice(invoice: GstInvoice): { success: boolean; error?: string } {
    const invoices = this.getGstInvoices();
    const activeBrand = invoice.brand || this.getActiveBrand();
    invoice.brand = activeBrand;

    const existingIndex = invoices.findIndex((g) => g.id === invoice.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      invoices[existingIndex] = {
        ...invoices[existingIndex],
        ...invoice,
        updatedAt: now,
      };
    } else {
      if (!invoice.id) {
        invoice.id = this.generateId('GST', activeBrand);
      }
      invoice.createdAt = now;
      invoice.updatedAt = now;
      invoices.unshift(invoice);
    }

    localStorage.setItem(STORAGE_KEYS.GST_INVOICES, JSON.stringify(invoices));
    this.notifyListeners();
    return { success: true };
  }
}

export const storageService = new StorageService();
