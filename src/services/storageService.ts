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
  EmployeePaymentMode,
  ExpenseCategory,
  ExpenseCategoryStatus,
  Expense,
  ExpensePaymentStatus,
  GstInvoice,
  GstPortalUploadStatus,
  AuthUser,
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
};

// Initial IT Solutions & Digital Marketing Seed Data for Device Doctor India
const INITIAL_CLIENTS: Client[] = [
  {
    id: 'CL-001',
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
    id: 'CL-002',
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
    id: 'CL-003',
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
    id: 'CL-004',
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
    id: 'CL-005',
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
    id: 'CL-006',
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

const INITIAL_CATEGORIES: ServiceCategory[] = [
  {
    id: 'CAT-001',
    name: 'Web & Custom Software Development',
    description: 'Enterprise web applications, React/Next.js client portals, Node.js microservices, and custom API backends.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CAT-002',
    name: 'Mobile App Development',
    description: 'Cross-platform iOS and Android mobile apps engineered with Flutter, React Native, offline synchronization, and push notifications.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CAT-003',
    name: 'Digital Marketing & SEO',
    description: 'Organic search optimization, technical SEO audits, multi-channel performance advertising on Google & Meta, and conversion tracking.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CAT-004',
    name: 'UI/UX & Brand Design',
    description: 'User experience research, interactive Figma prototypes, design systems, visual branding identities, and design audits.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'CAT-005',
    name: 'Cloud & DevOps Engineering',
    description: 'AWS & GCP infrastructure automation, Docker/Kubernetes container orchestration, CI/CD pipelines, and cloud security monitoring.',
    status: 'Active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const INITIAL_SERVICES: Service[] = [
  {
    id: 'SRV-001',
    name: 'Full-Stack React & Node.js Web App',
    categoryId: 'CAT-001',
    description: 'Modern single-page applications, responsive dashboards, secure JWT authentication, and REST/GraphQL APIs.',
    status: 'Active',
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'SRV-002',
    name: 'Custom ERP & CRM Development',
    categoryId: 'CAT-001',
    description: 'Tailored enterprise resource management software with role-based permissions, automated invoicing, and inventory control.',
    status: 'Active',
    createdAt: '2025-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'SRV-003',
    name: 'Flutter iOS/Android App Development',
    categoryId: 'CAT-002',
    description: 'High-performance cross-platform mobile apps with native UI components, offline-first local caching, and payment SDKs.',
    status: 'Active',
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'SRV-004',
    name: 'Technical SEO & Content Strategy',
    categoryId: 'CAT-003',
    description: 'Core Web Vitals optimization, semantic schema markup, programmatic SEO architecture, and keyword ranking strategy.',
    status: 'Active',
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'SRV-005',
    name: 'Performance Marketing (Meta & Google Ads)',
    categoryId: 'CAT-003',
    description: 'Data-driven paid customer acquisition campaigns, audience segmentation, remarketing funnels, and ROAS optimization.',
    status: 'Active',
    createdAt: '2025-02-10T00:00:00Z',
    updatedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'SRV-006',
    name: 'Design System & Interactive UI/UX Prototyping',
    categoryId: 'CAT-004',
    description: 'Complete component libraries in Figma, responsive typography & spacing scales, user journeys, and usability testing.',
    status: 'Active',
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
];

const INITIAL_PROJECTS: Project[] = [
  {
    id: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    serviceId: 'SRV-003',
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
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-09-15T11:00:00Z',
  },
  {
    id: 'DDI - CYBERSHIELD FINTECH LABS - FULL-STACK REACT & NODE.JS WEB APP - 1',
    clientId: 'CL-002',
    clientName: 'CyberShield Fintech Labs',
    serviceId: 'SRV-001',
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
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-09-28T14:30:00Z',
  },
  {
    id: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    clientId: 'CL-003',
    clientName: 'TechNova Enterprise Solutions',
    serviceId: 'SRV-002',
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
    createdAt: '2026-09-01T08:30:00Z',
    updatedAt: '2026-10-10T16:00:00Z',
  },
  {
    id: 'DDI - APEX SUPER-SPECIALITY HOSPITAL - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-004',
    clientName: 'Apex Super-Speciality Hospital',
    serviceId: 'SRV-003',
    proposalDate: '2026-09-01',
    contractDate: '2026-09-10',
    startDate: '2026-09-18',
    committedDays: 37,
    committedEndDate: '2026-10-25',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'Non GST Online',
    currency: 'INR',
    contract: 380000,
    exchangeRate: 1,
    contractValue: 380000,
    totalReceived: 190000,
    balance: 190000,
    projectManager: 'Deepak Varma',
    notes: 'WebRTC video consultation tested successfully; integrating Razorpay payment gateway.',
    createdAt: '2026-09-18T11:00:00Z',
    updatedAt: '2026-10-12T17:15:00Z',
  },
  {
    id: 'DDI - CLOUDMATRIX INFOTECH PUNE - PERFORMANCE MARKETING (META & GOOGLE ADS) - 1',
    clientId: 'CL-005',
    clientName: 'CloudMatrix Infotech Pune',
    serviceId: 'SRV-005',
    proposalDate: '2026-09-15',
    contractDate: '2026-09-25',
    startDate: '2026-10-01',
    committedDays: 60,
    committedEndDate: '2026-11-30',
    actualEndDate: '',
    status: 'In Progress',
    paymentMode: 'Cash',
    currency: 'INR',
    contract: 290000,
    exchangeRate: 1,
    contractValue: 290000,
    totalReceived: 0,
    balance: 290000,
    projectManager: 'Arjun Singhania',
    notes: 'Q4 lead-generation campaign launched across LinkedIn & Google Ads with 3.8x ROAS benchmark.',
    createdAt: '2026-10-01T09:30:00Z',
    updatedAt: '2026-10-13T10:00:00Z',
  },
  {
    id: 'DDI - BHARAT RETAIL VENTURES PVT LTD - FULL-STACK REACT & NODE.JS WEB APP - 1',
    clientId: 'CL-006',
    clientName: 'Bharat Retail Ventures Pvt Ltd',
    serviceId: 'SRV-001',
    proposalDate: '2026-04-15',
    contractDate: '2026-05-01',
    startDate: '2026-05-10',
    committedDays: 46,
    committedEndDate: '2026-06-25',
    actualEndDate: '2026-06-24',
    status: 'Completed',
    paymentMode: 'GST Invoice',
    currency: 'INR',
    contract: 520000,
    exchangeRate: 1,
    contractValue: 520000,
    totalReceived: 520000,
    balance: 0,
    projectManager: 'Karthik Ramanathan',
    notes: 'Successfully deployed on Vercel and AWS RDS with automated stock synchronization.',
    createdAt: '2026-05-10T09:00:00Z',
    updatedAt: '2026-06-26T12:00:00Z',
  },
];

const INITIAL_PAYMENTS: Payment[] = [
  {
    id: 'DDI-PAY-001',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
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
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
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
    projectId: 'DDI - CYBERSHIELD FINTECH LABS - FULL-STACK REACT & NODE.JS WEB APP - 1',
    clientId: 'CL-002',
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
    projectId: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    clientId: 'CL-003',
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
  {
    id: 'DDI-PAY-005',
    projectId: 'DDI - APEX SUPER-SPECIALITY HOSPITAL - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-004',
    clientName: 'Apex Super-Speciality Hospital',
    paymentMode: 'Non GST Online',
    paymentDate: '2026-09-18',
    dueDate: '2026-09-20',
    amountReceived: 190000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 190000,
    referenceUtr: 'UPI-SBI-6617283940',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Telemedicine integration milestone payment.',
    createdAt: '2026-09-18T12:00:00Z',
    updatedAt: '2026-09-19T10:30:00Z',
    amount: 190000,
    receivedAmount: 190000,
    outstandingAmount: 0,
    paymentMethod: 'Non GST Online',
  },
  {
    id: 'DDI-PAY-006',
    projectId: 'DDI - CLOUDMATRIX INFOTECH PUNE - PERFORMANCE MARKETING (META & GOOGLE ADS) - 1',
    clientId: 'CL-005',
    clientName: 'CloudMatrix Infotech Pune',
    paymentMode: 'Non GST Online',
    paymentDate: '2026-10-01',
    dueDate: '2026-10-10',
    amountReceived: 100000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 100000,
    referenceUtr: 'STRIPE-CHG-554182903',
    paymentStatus: 'Pending',
    daysOverdue: calculateDaysOverdue('2026-10-10', 'Pending'),
    notes: 'Ad spend management retainer invoice awaiting approval.',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    amount: 100000,
    receivedAmount: 0,
    outstandingAmount: 100000,
    paymentMethod: 'Non GST Online',
  },
  {
    id: 'DDI-PAY-007',
    projectId: 'DDI - BHARAT RETAIL VENTURES PVT LTD - FULL-STACK REACT & NODE.JS WEB APP - 1',
    clientId: 'CL-006',
    clientName: 'Bharat Retail Ventures Pvt Ltd',
    paymentMode: 'GST Invoice',
    paymentDate: '2026-06-25',
    dueDate: '2026-06-30',
    amountReceived: 520000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 520000,
    referenceUtr: 'UTR-KOTK-4418290192',
    paymentStatus: 'Received',
    daysOverdue: 0,
    notes: 'Complete project sign-off and final settlement.',
    createdAt: '2026-05-10T10:00:00Z',
    updatedAt: '2026-07-12T16:00:00Z',
    amount: 520000,
    receivedAmount: 520000,
    outstandingAmount: 0,
    paymentMethod: 'GST Invoice',
  },
];

const INITIAL_ROLES: EmployeeRole[] = [
  {
    id: 'ROL-001',
    roleName: 'Full-Stack Developer',
    department: 'Software Engineering',
    status: 'Active',
    description: 'React, Node.js, Next.js web application architecture, REST & GraphQL APIs, database modeling, and code quality reviews.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ROL-002',
    roleName: 'App Developer',
    department: 'Mobile Engineering',
    status: 'Active',
    description: 'Cross-platform Flutter iOS/Android application engineering, state management, mobile offline sync, native SDK integrations.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ROL-003',
    roleName: 'UI/UX Designer',
    department: 'Product Design',
    status: 'Active',
    description: 'Figma wireframing, high-fidelity UI prototypes, interactive user journeys, and responsive web design systems.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ROL-004',
    roleName: 'SEO Specialist',
    department: 'Digital Marketing & Growth',
    status: 'Active',
    description: 'Technical SEO audits, organic growth strategies, Google & Meta PPC ads, search visibility, and conversion funnels.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ROL-005',
    roleName: 'Project Manager',
    department: 'Delivery & Agile Operations',
    status: 'Active',
    description: 'Client communications, sprint planning, milestone delivery, resource allocation, and QA sign-offs.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ROL-006',
    roleName: 'Cloud & DevOps Engineer',
    department: 'Cloud Solutions & DevOps',
    status: 'Active',
    description: 'AWS/GCP infrastructure, Kubernetes orchestration, CI/CD automated deployment pipelines, and cloud security.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'DDI-EMP-001',
    name: 'Karthik Ramanathan',
    roleId: 'ROL-001',
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
    assignedProjectsCount: 4,
    createdAt: '2024-02-15T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-002',
    name: 'Deepak Varma',
    roleId: 'ROL-002',
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
    assignedProjectsCount: 3,
    createdAt: '2024-06-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-003',
    name: 'Sunita Menon',
    roleId: 'ROL-003',
    email: 'sunita.m@devicedoctor.in',
    status: 'Active',
    joiningDate: '2024-09-10',
    costOfEmployee: 88000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Product designer specializing in clean SaaS dashboards and mobile design systems in Figma.',
    joinedDate: '2024-09-10',
    salary: 88000,
    monthlyCost: 88000,
    phone: '+91 99203 77812',
    assignedProjectsCount: 4,
    createdAt: '2024-09-10T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-004',
    name: 'Arjun Singhania',
    roleId: 'ROL-004',
    email: 'arjun.s@devicedoctor.in',
    status: 'Active',
    joiningDate: '2025-01-20',
    costOfEmployee: 82000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'Handles Google Ads, Meta campaigns, technical on-page SEO, and backlink outreach.',
    joinedDate: '2025-01-20',
    salary: 82000,
    monthlyCost: 82000,
    phone: '+91 98104 55902',
    assignedProjectsCount: 5,
    createdAt: '2025-01-20T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-005',
    name: 'Meera Iyer',
    roleId: 'ROL-005',
    email: 'meera.i@devicedoctor.in',
    status: 'Active',
    joiningDate: '2025-04-12',
    costOfEmployee: 110000,
    employeeType: 'Salary Basis',
    comesUnderTds: 'Yes',
    notes: 'PMP certified. Oversees sprint planning, client communications, and on-time milestone delivery.',
    joinedDate: '2025-04-12',
    salary: 110000,
    monthlyCost: 110000,
    phone: '+91 94451 88204',
    assignedProjectsCount: 3,
    createdAt: '2025-04-12T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'DDI-EMP-006',
    name: 'Vikram Joshi',
    roleId: 'ROL-006',
    email: 'vikram.j@devicedoctor.in',
    status: 'Active',
    joiningDate: '2025-08-01',
    costOfEmployee: 65000,
    employeeType: 'Contract Basis',
    comesUnderTds: 'No',
    notes: 'External cloud infrastructure consultant for Kubernetes clusters and CI/CD pipelines.',
    joinedDate: '2025-08-01',
    salary: 65000,
    monthlyCost: 65000,
    phone: '+91 98331 44229',
    assignedProjectsCount: 2,
    createdAt: '2025-08-01T09:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
];

const INITIAL_ASSIGNMENTS: Assignment[] = [
  {
    id: 'DDI-ASN-001',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    employeeId: 'DDI-EMP-001',
    employeeName: 'Karthik Ramanathan',
    roleName: 'Full-Stack Developer',
    assignedDate: '2026-07-02',
    workAssigned: 'Backend API Architecture & Automated Driver Dispatch Module',
    amount: 180000,
    amountPaid: 180000,
    paymentStatus: 'Paid',
    employeeNotes: 'Completed driver dispatch APIs, JWT auth tokens, and warehouse webhook listeners. Fully tested in staging.',
    lastNoteUpdate: '2026-07-28 17:30',
    createdAt: '2026-07-02T10:00:00Z',
    updatedAt: '2026-07-28T17:30:00Z',
  },
  {
    id: 'DDI-ASN-002',
    projectId: 'DDI - CYBERSHIELD FINTECH LABS - CLOUD INFRASTRUCTURE & DEVSECOPS - 1',
    clientId: 'CL-002',
    clientName: 'CyberShield Fintech Labs',
    employeeId: 'DDI-EMP-003',
    employeeName: 'Sunita Menon',
    roleName: 'UI/UX Designer',
    assignedDate: '2026-08-05',
    workAssigned: 'Security Incident Dashboard & Audit Log UI Wireframes',
    amount: 95000,
    amountPaid: 50000,
    paymentStatus: 'Partially Paid',
    employeeNotes: 'Delivered high-fidelity Figma components for threat visualization and audit logs. Milestone 1 sign-off achieved.',
    lastNoteUpdate: '2026-08-20 14:15',
    createdAt: '2026-08-05T11:00:00Z',
    updatedAt: '2026-08-20T14:15:00Z',
  },
  {
    id: 'DDI-ASN-003',
    projectId: 'DDI - CLOUDMATRIX INFOTECH PUNE - PERFORMANCE MARKETING (META & GOOGLE ADS) - 1',
    clientId: 'CL-005',
    clientName: 'CloudMatrix Infotech Pune',
    employeeId: 'DDI-EMP-002',
    employeeName: 'Deepak Varma',
    roleName: 'Mobile App Developer',
    assignedDate: '2026-10-02',
    workAssigned: 'Ad Conversion Tracking SDK Integration & Mobile Deep Links',
    amount: 75000,
    amountPaid: 0,
    paymentStatus: 'Pending',
    employeeNotes: 'Configuring Branch.io deep linking and Google Analytics 4 conversion triggers in Flutter app.',
    lastNoteUpdate: '2026-10-05 11:45',
    createdAt: '2026-10-02T09:30:00Z',
    updatedAt: '2026-10-05T11:45:00Z',
  },
];

const INITIAL_EMPLOYEE_PAYMENTS: EmployeePayment[] = [
  {
    id: 'DDI-EPAY-001',
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
  {
    id: 'DDI-EPAY-003',
    assignmentId: 'DDI-ASN-002',
    projectId: 'DDI - CYBERSHIELD FINTECH LABS - CLOUD INFRASTRUCTURE & DEVSECOPS - 1',
    employeeId: 'DDI-EMP-003',
    employeeName: 'Sunita Menon',
    paymentDate: '2026-08-20',
    amountPaid: 50000,
    paymentMode: 'Cash',
    referenceUtr: 'EPAY-IMPS-88273619',
    notes: 'Threat monitoring dashboard UI component delivery payout.',
    createdAt: '2026-08-20T14:00:00Z',
    updatedAt: '2026-08-20T14:00:00Z',
  },
];

const INITIAL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    id: 'DDI-EXPCAT-001',
    name: 'Hosting',
    description: 'Web hosting, VPS, dedicated servers, and CDN hosting services.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-002',
    name: 'Domain',
    description: 'Domain name registration, DNS renewals, and SSL certification costs.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-003',
    name: 'Software / Subscription',
    description: 'Software licenses, Figma, GitHub, Jira, IDEs, and monthly SaaS subscriptions.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-004',
    name: 'Advertising',
    description: 'Meta Ads, Google Ads, LinkedIn marketing, and client performance campaigns.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-005',
    name: 'Freelancer',
    description: 'External contractors, specialist developer payouts, and 3D / motion artists.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-006',
    name: 'Travel',
    description: 'Local transit, cab fares, outstation client visits, and flight tickets.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-007',
    name: 'Client Meeting',
    description: 'Client hospitality, business lunches, stakeholder refreshments, and conferences.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-008',
    name: 'Server / Cloud',
    description: 'AWS, Google Cloud Platform, Azure VMs, container clusters, and storage.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-009',
    name: 'API / Service',
    description: 'Third-party developer APIs, OpenAI / Gemini tokens, SMS gateways, and webhook services.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-010',
    name: 'Printing',
    description: 'Marketing collateral, visiting cards, client contracts, and banner prints.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-011',
    name: 'Office',
    description: 'Office lease rent, broadband internet, power utilities, and facility maintenance.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-012',
    name: 'Other',
    description: 'Miscellaneous operational expenses and unforeseen contingency expenditures.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'DDI-EXPCAT-013',
    name: 'Salary',
    description: 'Core in-house employee monthly salaries and statutory allowances.',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'DDI-EXP-001',
    projectId: 'DDI - CYBERSHIELD FINTECH LABS - CLOUD INFRASTRUCTURE & DEVSECOPS - 1',
    clientId: 'CL-002',
    clientName: 'CyberShield Fintech Labs',
    expenseCategoryId: 'DDI-EXPCAT-008',
    expenseCategoryName: 'Server / Cloud',
    vendor: 'Amazon Web Services (AWS)',
    description: 'Dedicated Kubernetes cluster node pools & CloudWatch audit logging instances.',
    amount: 350,
    currency: 'USD',
    exchangeRate: 84.5,
    amountINR: 29575,
    expenseDate: '2026-08-15',
    paymentStatus: 'Paid',
    notes: 'Billed to CyberShield Fintech Labs dedicated cloud staging environment.',
    createdAt: '2026-08-15T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'DDI-EXP-002',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
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
    notes: 'Primary and webhook driver portal domains registered for Zenith Logistics ERP.',
    createdAt: '2026-07-10T11:00:00Z',
    updatedAt: '2026-07-10T11:00:00Z',
  },
  {
    id: 'DDI-EXP-003',
    projectId: 'NA',
    clientId: 'NA',
    clientName: 'NA',
    expenseCategoryId: 'DDI-EXPCAT-003',
    expenseCategoryName: 'Software / Subscription',
    vendor: 'Figma Inc',
    description: 'Annual agency team design seats and FigJam enterprise collaboration license.',
    amount: 45000,
    currency: 'INR',
    exchangeRate: 1,
    amountINR: 45000,
    expenseDate: '2026-09-05',
    paymentStatus: 'Pending',
    notes: 'Monthly software subscription invoice pending corporate account card clearance.',
    createdAt: '2026-09-05T09:30:00Z',
    updatedAt: '2026-09-05T09:30:00Z',
  },
];

const INITIAL_GST_INVOICES: GstInvoice[] = [
  {
    id: 'DDI-GST-001',
    paymentId: 'DDI-PAY-001',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
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
    paymentId: 'DDI-PAY-007',
    projectId: 'DDI - BHARAT RETAIL VENTURES PVT LTD - FULL-STACK REACT & NODE.JS WEB APP - 1',
    clientId: 'CL-006',
    clientName: 'Bharat Retail Ventures Pvt Ltd',
    paymentDate: '2026-06-25',
    amountReceived: 520000,
    currency: 'INR',
    amountINR: 520000,
    gstAmountINR: 93600,
    invoiceNumber: 'INV-2026-002',
    uploadedToGstPortal: 'Yes',
    gstPortalUploadDate: '2026-07-10',
    notes: 'Bharat Retail Ventures Q1 final invoice uploaded to GST portal.',
    createdAt: '2026-06-25T10:00:00Z',
    updatedAt: '2026-07-10T14:00:00Z',
  },
  {
    id: 'DDI-GST-003',
    paymentId: 'DDI-PAY-004',
    projectId: 'DDI - TECHNOVA ENTERPRISE SOLUTIONS - FLUTTER IOS/ANDROID APP DEVELOPMENT - 1',
    clientId: 'CL-003',
    clientName: 'TechNova Enterprise Solutions',
    paymentDate: '2026-09-01',
    amountReceived: 440000,
    currency: 'INR',
    amountINR: 440000,
    gstAmountINR: 79200,
    invoiceNumber: 'INV-2026-003',
    uploadedToGstPortal: 'No',
    gstPortalUploadDate: '',
    notes: 'TechNova mobile advance invoice created in Zoho Books; pending upload to GST portal.',
    createdAt: '2026-09-01T09:00:00Z',
    updatedAt: '2026-09-01T09:00:00Z',
  },
  {
    id: 'DDI-GST-004',
    paymentId: 'DDI-PAY-002',
    projectId: 'DDI - ZENITH LOGISTICS & SUPPLY CHAIN LTD - CUSTOM ERP & CRM DEVELOPMENT - 1',
    clientId: 'CL-001',
    clientName: 'Zenith Logistics & Supply Chain Ltd',
    paymentDate: '2026-09-01',
    amountReceived: 150000,
    currency: 'INR',
    amountINR: 150000,
    gstAmountINR: 27000,
    invoiceNumber: 'INV-2026-004',
    uploadedToGstPortal: 'No',
    gstPortalUploadDate: '',
    notes: 'Zenith Logistics milestone 2 invoice drafted in Zoho Books; awaiting payment clearance.',
    createdAt: '2026-08-10T11:00:00Z',
    updatedAt: '2026-08-10T11:00:00Z',
  },
];

const DEFAULT_AUTH_USER: AuthUser = {
  id: 'USR-001',
  name: 'Admin Desk (Device Doctor India)',
  email: 'devicedoctorindia.in@gmail.com',
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

  // --- Initializer ---
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

    // Migrate existing records in localStorage to ensure strictly the 4 exact payment modes
    const MIGRATION_KEY = 'ddi_payment_modes_v4_migrated';
    if (!localStorage.getItem(MIGRATION_KEY)) {
      try {
        const rawPayments = localStorage.getItem(STORAGE_KEYS.PAYMENTS);
        if (rawPayments) {
          const list: Payment[] = JSON.parse(rawPayments);
          const updated = list.map((p) => ({
            ...p,
            paymentMode: normalizePaymentMode(p.paymentMode),
            paymentMethod: normalizePaymentMode(p.paymentMethod),
          }));
          localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(updated));
        }

        const rawProjects = localStorage.getItem(STORAGE_KEYS.PROJECTS);
        if (rawProjects) {
          const list: Project[] = JSON.parse(rawProjects);
          const updated = list.map((p) => ({
            ...p,
            paymentMode: normalizePaymentMode(p.paymentMode),
          }));
          localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updated));
        }

        const rawEmployeePayments = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS);
        if (rawEmployeePayments) {
          const list: EmployeePayment[] = JSON.parse(rawEmployeePayments);
          const updated = list.map((p) => ({
            ...p,
            paymentMode: normalizePaymentMode(p.paymentMode),
          }));
          localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(updated));
        }
        localStorage.setItem(MIGRATION_KEY, 'true');
      } catch {
        // ignore migration errors
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

  // --- ID Generation ---
  public generateId(
    prefix:
      | 'CL'
      | 'CAT'
      | 'SRV'
      | 'PRJ'
      | 'PAY'
      | 'DDI-PAY'
      | 'ROL'
      | 'EMP'
      | 'DDI-EMP'
      | 'ASN'
      | 'DDI-ASN'
      | 'EPAY'
      | 'DDI-EPAY'
      | 'EXPCAT'
      | 'DDI-EXPCAT'
      | 'EXP'
      | 'DDI-EXP'
  ): string {
    if (prefix === 'DDI-EXP' || prefix === 'EXP') {
      const exps = this.getExpenses();
      const numbers = exps.map((item) => {
        const parts = item.id.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return `DDI-EXP-${String(max + 1).padStart(3, '0')}`;
    }

    if (prefix === 'DDI-EXPCAT' || prefix === 'EXPCAT') {
      const cats = this.getExpenseCategories();
      const numbers = cats.map((item) => {
        const parts = item.id.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return `DDI-EXPCAT-${String(max + 1).padStart(3, '0')}`;
    }

    if (prefix === 'DDI-EPAY' || prefix === 'EPAY') {
      const epays = this.getEmployeePayments();
      const numbers = epays.map((item) => {
        const parts = item.id.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return `DDI-EPAY-${String(max + 1).padStart(3, '0')}`;
    }

    if (prefix === 'DDI-ASN' || prefix === 'ASN') {
      const assignments = this.getAssignments();
      const numbers = assignments.map((item) => {
        const parts = item.id.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return `DDI-ASN-${String(max + 1).padStart(3, '0')}`;
    }

    if (prefix === 'DDI-PAY' || prefix === 'PAY') {
      const payments = this.getPayments();
      const numbers = payments.map((item) => {
        const parts = item.id.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return `DDI-PAY-${String(max + 1).padStart(3, '0')}`;
    }

    if (prefix === 'DDI-EMP' || prefix === 'EMP') {
      const employees = this.getEmployees();
      const numbers = employees.map((item) => {
        const parts = item.id.split('-');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        return isNaN(num) ? 0 : num;
      });
      const max = numbers.length > 0 ? Math.max(...numbers) : 0;
      return `DDI-EMP-${String(max + 1).padStart(3, '0')}`;
    }

    let list: Array<{ id: string }> = [];
    switch (prefix) {
      case 'CL': list = this.getClients(); break;
      case 'CAT': list = this.getCategories(); break;
      case 'SRV': list = this.getServices(); break;
      case 'PRJ': list = this.getProjects(); break;
      case 'ROL': list = this.getRoles(); break;
    }

    const numbers = list.map((item) => {
      const parts = item.id.split('-');
      const num = parseInt(parts[1], 10);
      return isNaN(num) ? 0 : num;
    });

    const max = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = max + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  }

  // --- Smart Dynamic Project ID Generator (Format: DDI - [CLIENT NAME] - [SERVICE NAME] - [SEQUENCE]) ---
  public generateSmartProjectId(
    clientName: string,
    serviceName: string,
    clientId?: string,
    serviceId?: string,
    currentProjectId?: string
  ): string {
    const cleanClient = (clientName || 'CLIENT').trim().toUpperCase();
    const cleanService = (serviceName || 'SERVICE').trim().toUpperCase();
    const projects = this.getProjects();

    const matchingProjects = projects.filter((p) => {
      if (currentProjectId && p.id === currentProjectId) return false;
      const matchById = clientId && serviceId && p.clientId === clientId && p.serviceId === serviceId;
      const matchByPattern = p.id.startsWith(`DDI - ${cleanClient} - ${cleanService} - `);
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
    return `DDI - ${cleanClient} - ${cleanService} - ${nextSeq}`;
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
        client.id = this.generateId('CL');
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
        reason: `Cannot delete client because they have ${linkedProjects.length} linked Project(s).`,
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

    const duplicate = categories.find(
      (c) => c.id !== category.id && c.name.trim().toLowerCase() === category.name.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Category name "${category.name}" already exists. Category names must be strictly unique.` };
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
        category.id = this.generateId('CAT');
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

  // --- SERVICES (Strictly 5 fields: id, name, categoryId, description, status) ---
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
        cleanService.id = this.generateId('SRV');
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
      const list: Project[] = raw ? JSON.parse(raw) : INITIAL_PROJECTS;
      return list.map((p) => ({
        ...p,
        paymentMode: normalizePaymentMode(p.paymentMode),
      }));
    } catch {
      return INITIAL_PROJECTS;
    }
  }

  public syncProjectFinancials(projectId: string) {
    if (!projectId) return;
    const payments = this.getPayments().filter(
      (p) => p.projectId === projectId && p.paymentStatus === 'Received'
    );
    const totalReceived = payments.reduce(
      (acc, p) => acc + (p.amountINR ?? (Number(p.amountReceived || 0) * Number(p.exchangeRate || 1))),
      0
    );
    const projects = this.getProjects();
    const pIndex = projects.findIndex((p) => p.id === projectId);
    if (pIndex >= 0) {
      const contractVal = projects[pIndex].contractValue || 0;
      projects[pIndex].totalReceived = totalReceived;
      projects[pIndex].balance = Math.max(0, contractVal - totalReceived);
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
      this.notifyListeners();
    }
  }

  public saveProject(project: Project): { success: boolean; error?: string } {
    const projects = this.getProjects();
    const existingIndex = projects.findIndex((p) => p.id === project.id);
    const now = new Date().toISOString();

    // Auto-fill client name from Client if available
    const client = this.getClients().find((c) => c.id === project.clientId);
    if (client) {
      project.clientName = client.name;
    }
    const service = this.getServices().find((s) => s.id === project.serviceId);

    // Auto-calculate Committed End Date: Project Start Date + Committed Days
    if (project.startDate && project.committedDays !== undefined) {
      const d = new Date(project.startDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + (Number(project.committedDays) || 0));
        project.committedEndDate = d.toISOString().slice(0, 10);
      }
    }

    // Auto-calculate Contract Value in INR: Contract * Exchange Rate
    const contractAmount = Number(project.contract) || 0;
    const rate = Number(project.exchangeRate) || 1;
    project.contractValue = Math.round(contractAmount * rate);
    project.paymentMode = normalizePaymentMode(project.paymentMode || 'GST Invoice');

    if (existingIndex >= 0) {
      const existingProject = projects[existingIndex];
      const payments = this.getPayments().filter(
        (p) => p.projectId === project.id && p.paymentStatus === 'Received'
      );
      const totalRec = payments.reduce((acc, p) => acc + (p.amountINR || 0), 0);
      project.totalReceived = totalRec;
      project.balance = Math.max(0, project.contractValue - totalRec);

      projects[existingIndex] = {
        ...existingProject,
        ...project,
        updatedAt: now,
      };
    } else {
      if (!project.id || project.id.startsWith('PRJ-')) {
        project.id = this.generateSmartProjectId(
          client?.name || 'CLIENT',
          service?.name || 'SERVICE',
          project.clientId,
          project.serviceId
        );
      }
      project.totalReceived = 0;
      project.balance = project.contractValue;
      project.createdAt = now;
      project.updatedAt = now;
      projects.unshift(project);
    }

    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteProject(projectId: string): { allowed: boolean; reason?: string; linkedCount: number; blockType?: 'payments' | 'assignments' | 'expenses' } {
    const payments = this.getPayments().filter((p) => p.projectId === projectId);
    const assignments = this.getAssignments().filter((a) => a.projectId === projectId);
    const expenses = this.getExpenses().filter((e) => e.projectId === projectId);

    if (payments.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete project because ${payments.length} Payment record(s) are attached to it. You can mark this project as Cancelled instead.`,
        linkedCount: payments.length,
        blockType: 'payments',
      };
    }

    if (assignments.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete project because ${assignments.length} Employee Assignment(s) are linked to it. You can mark this project as Cancelled instead.`,
        linkedCount: assignments.length,
        blockType: 'assignments',
      };
    }

    if (expenses.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete project because ${expenses.length} Expense record(s) are linked to it. You can mark this project as Cancelled instead.`,
        linkedCount: expenses.length,
        blockType: 'expenses',
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
      const list: Payment[] = raw ? JSON.parse(raw) : INITIAL_PAYMENTS;
      return list.map((p) => ({
        ...p,
        paymentMode: normalizePaymentMode(p.paymentMode),
      }));
    } catch {
      return INITIAL_PAYMENTS;
    }
  }

  public savePayment(payment: Payment): { success: boolean; error?: string } {
    const payments = this.getPayments();
    const projects = this.getProjects();
    const project = projects.find((p) => p.id === payment.projectId);

    if (!payment.projectId || !project) {
      return { success: false, error: 'Please select a valid Project from the dropdown.' };
    }

    payment.paymentMode = normalizePaymentMode(payment.paymentMode);

    // Auto-fill Client ID and Client Name from Project
    payment.clientId = project.clientId;
    payment.clientName = project.clientName || this.getClients().find((c) => c.id === project.clientId)?.name || '';

    // Calculate Amount INR
    const amountReceived = Number(payment.amountReceived) || 0;
    const exchangeRate = Number(payment.exchangeRate) || 1;
    payment.amountINR = Math.round(amountReceived * exchangeRate);
    payment.amount = payment.amountINR;
    payment.receivedAmount = payment.paymentStatus === 'Received' ? payment.amountINR : 0;
    payment.outstandingAmount = payment.paymentStatus === 'Received' ? 0 : payment.amountINR;

    // Calculate Days Overdue: If status is 'Pending' and Today > Due Date, diff in days; else 0
    payment.daysOverdue = calculateDaysOverdue(payment.dueDate, payment.paymentStatus);

    // Enforce unique Reference / UTR
    if (!payment.referenceUtr || !payment.referenceUtr.trim()) {
      return { success: false, error: 'Reference / UTR is required.' };
    }
    const cleanUtr = payment.referenceUtr.trim();
    const dupUtr = payments.find(
      (p) => p.id !== payment.id && p.referenceUtr?.trim().toLowerCase() === cleanUtr.toLowerCase()
    );
    if (dupUtr) {
      return {
        success: false,
        error: `Reference / UTR "${cleanUtr}" is already in use by Payment ${dupUtr.id}. Reference / UTR must be strictly unique across all payments.`,
      };
    }
    payment.referenceUtr = cleanUtr;

    // Check project balance for 'Received' payments
    const otherPayments = payments.filter(
      (p) => p.projectId === payment.projectId && p.id !== payment.id && p.paymentStatus === 'Received'
    );
    const previouslyReceived = otherPayments.reduce((acc, p) => acc + (p.amountINR || 0), 0);
    const remainingBalance = Math.max(0, (project.contractValue || 0) - previouslyReceived);

    if (payment.paymentStatus === 'Received' && payment.amountINR > remainingBalance) {
      return {
        success: false,
        error: `Payment amount of ₹${payment.amountINR.toLocaleString('en-IN')} exceeds the project's remaining balance of ₹${remainingBalance.toLocaleString('en-IN')} (Contract Value: ₹${(project.contractValue || 0).toLocaleString('en-IN')}, Already Received: ₹${previouslyReceived.toLocaleString('en-IN')}).`,
      };
    }

    const existingIndex = payments.findIndex((p) => p.id === payment.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      payments[existingIndex] = {
        ...payments[existingIndex],
        ...payment,
        updatedAt: now,
      };
    } else {
      if (!payment.id) {
        payment.id = this.generateId('DDI-PAY');
      }
      payment.createdAt = now;
      payment.updatedAt = now;
      payments.unshift(payment);
    }

    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));
    this.syncProjectFinancials(payment.projectId);
    this.notifyListeners();
    return { success: true };
  }

  public deletePayment(paymentId: string): { success: boolean; error?: string } {
    const payments = this.getPayments();
    const targetPayment = payments.find((p) => p.id === paymentId);
    const projectId = targetPayment?.projectId;
    const remaining = payments.filter((p) => p.id !== paymentId);
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(remaining));
    if (projectId) {
      this.syncProjectFinancials(projectId);
    }
    this.notifyListeners();
    return { success: true };
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
    const duplicate = roles.find(
      (r) => r.id !== role.id && r.roleName.trim().toLowerCase() === role.roleName.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: `Role name "${role.roleName}" already exists.` };
    }

    const existingIndex = roles.findIndex((r) => r.id === role.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      roles[existingIndex] = {
        ...roles[existingIndex],
        ...role,
        roleName: role.roleName.trim(),
        updatedAt: now,
      };
    } else {
      if (!role.id) {
        role.id = this.generateId('ROL');
      }
      role.roleName = role.roleName.trim();
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
        reason: `Cannot delete role because ${linked.length} Employee(s) are assigned to this role. You can mark this role as Inactive instead.`,
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

    // 1. Validate required name
    if (!employee.name || !employee.name.trim()) {
      return { success: false, error: 'Employee Name is required.' };
    }

    // 2. Validate roleId
    if (!employee.roleId) {
      return { success: false, error: 'Please select an Employee Role.' };
    }

    // 3. Validate and enforce unique email
    const cleanEmail = (employee.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Email address is required.' };
    }
    const dupEmail = employees.find(
      (e) => e.id !== employee.id && e.email?.trim().toLowerCase() === cleanEmail
    );
    if (dupEmail) {
      return {
        success: false,
        error: `Email "${employee.email.trim()}" is already registered to ${dupEmail.name} (${dupEmail.id}). Email must be strictly unique across all employees.`,
      };
    }
    employee.email = cleanEmail;

    // 4. Cost of Employee (INR)
    const costOfEmployee = Number(employee.costOfEmployee ?? employee.monthlyCost ?? employee.salary) || 0;
    employee.costOfEmployee = costOfEmployee;
    employee.salary = costOfEmployee;
    employee.monthlyCost = costOfEmployee;

    // Fallback defaults
    if (!employee.status) employee.status = 'Active';
    if (!employee.employeeType) employee.employeeType = 'Salary Basis';
    if (!employee.comesUnderTds) employee.comesUnderTds = 'Yes';
    if (!employee.joiningDate) {
      employee.joiningDate = employee.joinedDate || new Date().toISOString().slice(0, 10);
    }
    employee.joinedDate = employee.joiningDate;

    const existingIndex = employees.findIndex((e) => e.id === employee.id);
    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      employees[existingIndex] = {
        ...employees[existingIndex],
        ...employee,
        name: employee.name.trim(),
        updatedAt: now,
      };
    } else {
      if (!employee.id) {
        employee.id = this.generateId('DDI-EMP');
      }
      employee.name = employee.name.trim();
      employee.createdAt = now;
      employee.updatedAt = now;
      employees.push(employee);
    }

    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    this.notifyListeners();
    return { success: true };
  }

  public canDeleteEmployee(employeeId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const assignments = this.getAssignments().filter((a) => a.employeeId === employeeId);
    if (assignments.length > 0) {
      return {
        allowed: false,
        reason: `Cannot delete employee because ${assignments.length} Project Assignment(s) are allocated to this employee. You can mark this employee as Inactive instead.`,
        linkedCount: assignments.length,
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
      const list: Assignment[] = raw ? JSON.parse(raw) : INITIAL_ASSIGNMENTS;
      const epays = this.getEmployeePayments();

      return list.map((a) => {
        const linkedPayments = epays.filter((p) => p.assignmentId === a.id);
        if (linkedPayments.length > 0) {
          const totalPaid = linkedPayments.reduce((s, p) => s + (Number(p.amountPaid) || 0), 0);
          let status = a.paymentStatus;
          if (a.paymentStatus !== 'Cancelled' && a.paymentStatus !== 'On Hold') {
            if (a.amount > 0 && totalPaid >= a.amount) {
              status = 'Paid';
            } else if (totalPaid > 0 && totalPaid < a.amount) {
              status = 'Partially Paid';
            } else if (totalPaid === 0) {
              status = 'Pending';
            }
          }
          return {
            ...a,
            amountPaid: totalPaid,
            paymentStatus: status,
          };
        }
        return a;
      });
    } catch {
      return INITIAL_ASSIGNMENTS;
    }
  }

  public canDeleteAssignment(assignmentId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const linked = this.getEmployeePayments().filter((p) => p.assignmentId === assignmentId);
    if (linked.length > 0) {
      return {
        allowed: false,
        reason: `Assignment ${assignmentId} has ${linked.length} linked Employee Payment record(s). Deletion is blocked to preserve financial transaction logs. You can mark this assignment as Cancelled or On Hold instead.`,
        linkedCount: linked.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public syncAssignmentWithPayments(assignmentId: string): void {
    const raw = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
    const assignments: Assignment[] = raw ? JSON.parse(raw) : INITIAL_ASSIGNMENTS;
    const epays = this.getEmployeePayments().filter((p) => p.assignmentId === assignmentId);
    const totalPaid = epays.reduce((s, p) => s + (Number(p.amountPaid) || 0), 0);

    const index = assignments.findIndex((a) => a.id === assignmentId);
    if (index >= 0) {
      const target = assignments[index];
      target.amountPaid = totalPaid;
      if (target.paymentStatus !== 'Cancelled' && target.paymentStatus !== 'On Hold') {
        if (target.amount > 0 && totalPaid >= target.amount) {
          target.paymentStatus = 'Paid';
        } else if (totalPaid > 0 && totalPaid < target.amount) {
          target.paymentStatus = 'Partially Paid';
        } else if (totalPaid === 0) {
          target.paymentStatus = 'Pending';
        }
      }
      target.updatedAt = new Date().toISOString();
      assignments[index] = target;
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    }
  }

  public saveAssignment(assignment: Assignment): { success: boolean; error?: string } {
    const assignments = this.getAssignments();
    const projects = this.getProjects();
    const employees = this.getEmployees();
    const clients = this.getClients();
    const roles = this.getRoles();

    // 1. Validate project
    if (!assignment.projectId) {
      return { success: false, error: 'Please select a Project from the dropdown.' };
    }
    const project = projects.find((p) => p.id === assignment.projectId);
    if (!project) {
      return { success: false, error: 'Selected Project not found.' };
    }

    // 2. Validate employee
    if (!assignment.employeeId) {
      return { success: false, error: 'Please select an Employee from the dropdown.' };
    }
    const employee = employees.find((e) => e.id === assignment.employeeId);
    if (!employee) {
      return { success: false, error: 'Selected Employee not found.' };
    }

    // 3. Relational Auto-fill & Sync
    const client = clients.find((c) => c.id === project.clientId);
    const role = roles.find((r) => r.id === employee.roleId);

    assignment.clientId = project.clientId;
    assignment.clientName = client?.name || project.clientName || '';
    assignment.employeeName = employee.name;
    assignment.roleName = role?.roleName || '';

    // 4. Validate work assigned
    if (!assignment.workAssigned || !assignment.workAssigned.trim()) {
      return { success: false, error: 'Work / Module Assigned description is required.' };
    }
    assignment.workAssigned = assignment.workAssigned.trim();

    // 5. Validate amounts
    const amount = Number(assignment.amount) || 0;
    const amountPaid = Number(assignment.amountPaid) || 0;
    if (amount < 0) {
      return { success: false, error: 'Amount cannot be negative.' };
    }
    if (amountPaid < 0) {
      return { success: false, error: 'Amount Paid cannot be negative.' };
    }
    if (amountPaid > amount) {
      return {
        success: false,
        error: `Amount Paid (₹${amountPaid.toLocaleString('en-IN')}) cannot exceed total allocated Amount (₹${amount.toLocaleString('en-IN')}).`,
      };
    }
    assignment.amount = amount;
    assignment.amountPaid = amountPaid;

    // 6. Assigned Date default
    if (!assignment.assignedDate) {
      assignment.assignedDate = new Date().toISOString().slice(0, 10);
    }

    // 7. Payment status default or auto-suggest
    if (!assignment.paymentStatus) {
      if (amountPaid === amount && amount > 0) {
        assignment.paymentStatus = 'Paid';
      } else if (amountPaid > 0) {
        assignment.paymentStatus = 'Partially Paid';
      } else {
        assignment.paymentStatus = 'Pending';
      }
    }

    const existingIndex = assignments.findIndex((a) => a.id === assignment.id);
    const now = new Date().toISOString();
    const formattedNow = new Date().toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (existingIndex >= 0) {
      const existing = assignments[existingIndex];
      const notesChanged = (existing.employeeNotes || '').trim() !== (assignment.employeeNotes || '').trim();
      if (notesChanged) {
        assignment.lastNoteUpdate = formattedNow;
      } else {
        assignment.lastNoteUpdate = existing.lastNoteUpdate || (assignment.employeeNotes ? formattedNow : '');
      }

      assignments[existingIndex] = {
        ...existing,
        ...assignment,
        updatedAt: now,
      };
    } else {
      if (!assignment.id) {
        assignment.id = this.generateId('DDI-ASN');
      }
      if (assignment.employeeNotes && assignment.employeeNotes.trim()) {
        assignment.lastNoteUpdate = formattedNow;
      } else {
        assignment.lastNoteUpdate = '';
      }
      assignment.createdAt = now;
      assignment.updatedAt = now;
      assignments.unshift(assignment);
    }

    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    this.notifyListeners();
    return { success: true };
  }

  public deleteAssignment(assignmentId: string): { success: boolean; error?: string } {
    const check = this.canDeleteAssignment(assignmentId);
    if (!check.allowed) {
      return { success: false, error: check.reason };
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
      const list: EmployeePayment[] = raw ? JSON.parse(raw) : INITIAL_EMPLOYEE_PAYMENTS;
      return list.map((p) => ({
        ...p,
        paymentMode: normalizePaymentMode(p.paymentMode),
      }));
    } catch {
      return INITIAL_EMPLOYEE_PAYMENTS;
    }
  }

  public saveEmployeePayment(payment: EmployeePayment): { success: boolean; error?: string } {
    const payments = this.getEmployeePayments();
    const assignments = this.getAssignments();

    // 1. Validate Assignment ID
    if (!payment.assignmentId) {
      return { success: false, error: 'Please select an Assignment ID from the dropdown.' };
    }
    const assignment = assignments.find((a) => a.id === payment.assignmentId);
    if (!assignment) {
      return { success: false, error: `Assignment "${payment.assignmentId}" not found.` };
    }

    // 2. Auto-fill from Assignment
    payment.projectId = assignment.projectId;
    payment.employeeId = assignment.employeeId;
    payment.employeeName = assignment.employeeName;

    // 3. Payment Date
    if (!payment.paymentDate) {
      payment.paymentDate = new Date().toISOString().slice(0, 10);
    }

    // 4. Validate Amount Paid & Remaining Balance
    const amountPaid = Number(payment.amountPaid) || 0;
    if (amountPaid <= 0) {
      return { success: false, error: 'Amount Paid must be greater than zero.' };
    }

    // Calculate other payments already made on this assignment
    const otherPayments = payments.filter((p) => p.assignmentId === payment.assignmentId && p.id !== payment.id);
    const otherPaymentsTotal = otherPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
    const remainingBalance = Math.max(0, (Number(assignment.amount) || 0) - otherPaymentsTotal);

    if (amountPaid > remainingBalance) {
      return {
        success: false,
        error: `Amount Paid (₹${amountPaid.toLocaleString('en-IN')}) cannot exceed the remaining unpaid balance of ₹${remainingBalance.toLocaleString('en-IN')} for assignment ${assignment.id}.`,
      };
    }
    payment.amountPaid = amountPaid;

    // 5. Payment Mode (strictly 4 options, default GST Invoice)
    payment.paymentMode = normalizePaymentMode(payment.paymentMode || 'GST Invoice');

    // 6. Unique Reference / UTR check across all employee payments if provided
    if (payment.referenceUtr && payment.referenceUtr.trim()) {
      const trimmedRef = payment.referenceUtr.trim().toLowerCase();
      const duplicate = payments.find(
        (p) => p.id !== payment.id && (p.referenceUtr || '').trim().toLowerCase() === trimmedRef
      );
      if (duplicate) {
        return {
          success: false,
          error: `Reference / UTR "${payment.referenceUtr.trim()}" is already recorded on payment ${duplicate.id}. Must be unique.`,
        };
      }
      payment.referenceUtr = payment.referenceUtr.trim();
    } else {
      payment.referenceUtr = '';
    }

    // 7. Auto-generate ID if missing
    if (!payment.id) {
      payment.id = this.generateId('DDI-EPAY');
    }

    const now = new Date().toISOString();
    const existingIndex = payments.findIndex((p) => p.id === payment.id);
    if (existingIndex >= 0) {
      payments[existingIndex] = {
        ...payments[existingIndex],
        ...payment,
        updatedAt: now,
      };
    } else {
      payment.createdAt = now;
      payment.updatedAt = now;
      payments.unshift(payment);
    }

    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(payments));

    // Live Two-Way Sync: Update the Assignment's amountPaid and paymentStatus
    this.syncAssignmentWithPayments(payment.assignmentId);

    this.notifyListeners();
    return { success: true };
  }

  public deleteEmployeePayment(paymentId: string): { success: boolean; error?: string } {
    const payments = this.getEmployeePayments();
    const target = payments.find((p) => p.id === paymentId);
    if (!target) {
      return { success: false, error: 'Employee payment record not found.' };
    }

    const updated = payments.filter((p) => p.id !== paymentId);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEE_PAYMENTS, JSON.stringify(updated));

    // Live Two-Way Sync: Update the Assignment's amountPaid and paymentStatus
    this.syncAssignmentWithPayments(target.assignmentId);

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

  public canDeleteExpenseCategory(categoryId: string): { allowed: boolean; reason?: string; linkedCount: number } {
    const expenses = this.getExpenses().filter((e) => e.expenseCategoryId === categoryId);
    if (expenses.length > 0) {
      return {
        allowed: false,
        reason: `Expense Category is currently assigned to ${expenses.length} recorded expense(s). Deletion is prohibited to preserve accounting logs.`,
        linkedCount: expenses.length,
      };
    }
    return { allowed: true, linkedCount: 0 };
  }

  public saveExpenseCategory(category: ExpenseCategory): { success: boolean; error?: string } {
    const categories = this.getExpenseCategories();

    if (!category.name || !category.name.trim()) {
      return { success: false, error: 'Category Name is required.' };
    }
    const trimmedName = category.name.trim();

    // Strictly UNIQUE validation (case-insensitive) across all other categories
    const duplicate = categories.find(
      (c) => c.id !== category.id && c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      return {
        success: false,
        error: `An Expense Category named "${trimmedName}" already exists. Category names must be strictly unique.`,
      };
    }

    category.name = trimmedName;
    category.status = category.status || 'Active';
    category.description = category.description ? category.description.trim() : '';

    const now = new Date().toISOString();
    const existingIndex = categories.findIndex((c) => c.id === category.id);
    if (existingIndex >= 0) {
      categories[existingIndex] = {
        ...categories[existingIndex],
        ...category,
        updatedAt: now,
      };
    } else {
      if (!category.id) {
        category.id = this.generateId('DDI-EXPCAT');
      }
      category.createdAt = now;
      category.updatedAt = now;
      categories.push(category);
    }

    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(categories));
    this.notifyListeners();
    return { success: true };
  }

  public deleteExpenseCategory(categoryId: string): { success: boolean; error?: string } {
    const check = this.canDeleteExpenseCategory(categoryId);
    if (!check.allowed) {
      return { success: false, error: check.reason };
    }

    const categories = this.getExpenseCategories().filter((c) => c.id !== categoryId);
    localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(categories));
    this.notifyListeners();
    return { success: true };
  }

  public setExpenseCategoryStatus(categoryId: string, status: ExpenseCategoryStatus): { success: boolean } {
    const categories = this.getExpenseCategories();
    const index = categories.findIndex((c) => c.id === categoryId);
    if (index >= 0) {
      categories[index].status = status;
      categories[index].updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(categories));
      this.notifyListeners();
    }
    return { success: true };
  }

  // --- OTHER EXPENSES ---
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
    const projects = this.getProjects();
    const categories = this.getExpenseCategories();

    // 1. Relational auto-fill for Project & Client
    if (expense.projectId && expense.projectId !== 'NA') {
      const project = projects.find((p) => p.id === expense.projectId);
      if (project) {
        expense.clientId = project.clientId;
        expense.clientName = project.clientName;
      }
    } else {
      expense.projectId = 'NA';
      expense.clientId = 'NA';
      expense.clientName = 'NA';
    }

    // 2. Relational auto-fill for Expense Category Name
    if (expense.expenseCategoryId) {
      const cat = categories.find((c) => c.id === expense.expenseCategoryId);
      if (cat) {
        expense.expenseCategoryName = cat.name;
      }
    }

    // 3. Vendor Validation
    if (!expense.vendor || !expense.vendor.trim()) {
      return { success: false, error: 'Vendor name is required.' };
    }
    expense.vendor = expense.vendor.trim();

    // 4. Financial Calculations
    const amount = Number(expense.amount) || 0;
    if (amount < 0) {
      return { success: false, error: 'Amount cannot be negative.' };
    }
    expense.amount = amount;

    const rate = Number(expense.exchangeRate) || 1;
    if (rate <= 0) {
      return { success: false, error: 'Exchange rate must be greater than zero.' };
    }
    expense.exchangeRate = rate;
    expense.amountINR = Math.round(amount * rate);

    if (!expense.currency) {
      expense.currency = 'INR';
    }

    if (!expense.expenseDate) {
      expense.expenseDate = new Date().toISOString().slice(0, 10);
    }

    if (!expense.paymentStatus) {
      expense.paymentStatus = 'Paid';
    }

    const now = new Date().toISOString();
    const existingIndex = expenses.findIndex((e) => e.id === expense.id);
    if (existingIndex >= 0) {
      expenses[existingIndex] = {
        ...expenses[existingIndex],
        ...expense,
        updatedAt: now,
      };
    } else {
      if (!expense.id) {
        expense.id = this.generateId('DDI-EXP');
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

  public getProjectExpenses(projectId: string): Expense[] {
    if (!projectId || projectId === 'NA') return [];
    return this.getExpenses().filter((e) => e.projectId === projectId);
  }

  public getProjectExpensesTotalINR(projectId: string): number {
    return this.getProjectExpenses(projectId).reduce((sum, e) => sum + (Number(e.amountINR) || 0), 0);
  }
}

export const storageService = new StorageService();
