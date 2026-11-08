import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';
import { mockStore } from '../server/db/mockStore';
import { Payment, Project, Client } from '../src/types/crm';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Payment Recording Fix & Full CRUD Verification (Cliffhangers India)', () => {
  const brand = 'Device Doctor India';
  const hdfcAccountId = 'DDI-BNK-001';
  const cliffClientId = 'DDI-CLIFFHANGERS-INDIA';
  const cliffProjectId = 'DDI-CLIFFHANGERS-INDIA-EXPEDITION-BOOKING-PORTAL-1';

  beforeEach(() => {
    // Ensure Client exists in mockStore
    const client: Client = {
      id: cliffClientId,
      brand,
      name: 'Cliffhangers India',
      email: 'info@cliffhangersindia.com',
      phone: '+91 98765 43210',
      contactPerson: 'Cliffhangers India Expeditions Pvt Ltd',
      preferredCurrency: 'INR',
      clientSince: '2026-01-01',
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockStore.saveClient(client);

    // Ensure Project exists in mockStore with contractValue = 200,000 INR
    const project: Project = {
      id: cliffProjectId,
      brand,
      clientId: cliffClientId,
      clientName: 'Cliffhangers India',
      serviceId: 'DDI-SRV-001',
      proposalDate: '2026-01-01',
      contractDate: '2026-01-05',
      startDate: '2026-01-10',
      committedDays: 60,
      committedEndDate: '2026-03-10',
      actualEndDate: '',
      status: 'In Progress',
      paymentMode: 'GST Invoice',
      currency: 'INR',
      contract: 200000,
      exchangeRate: 1,
      contractValue: 200000,
      totalReceived: 0,
      balance: 200000,
      projectManager: 'Karthik Rao',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockStore.saveProject(project);
  });

  afterEach(() => {
    // Clean up created payments
    const payments = mockStore.getPayments(brand);
    for (const p of payments) {
      if (p.projectId === cliffProjectId) {
        mockStore.deletePayment(p.id);
        mockStore.deleteGstInvoiceByPaymentId(p.id);
      }
    }
  });

  it('(a) & (b): Creates a GST Invoice payment for Cliffhangers India with HDFC Device Doctor account', async () => {
    const payload = {
      brand,
      projectId: cliffProjectId,
      clientId: cliffClientId,
      clientName: 'Cliffhangers India',
      paymentMode: 'GST Invoice',
      bankAccountId: hdfcAccountId,
      bankAccountName: 'HDFC Bank - Current Account (A/C: 50200088921478)',
      paymentDate: '2026-11-08',
      dueDate: '2026-11-08',
      amountReceived: 80000,
      currency: 'INR',
      exchangeRate: 1,
      amountINR: 80000,
      referenceUtr: 'HDFC-CLIFF-UTR-001',
      paymentStatus: 'Received',
      notes: 'Phase 1 portal mobilization advance payment',
      isNew: true,
    };

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.id).toMatch(/^DDI-PAY-/);
    expect(res.body.payment.bankAccountId).toBe(hdfcAccountId);
    expect(res.body.payment.amountINR).toBe(80000);
    expect(res.body.gstInvoiceSynced).toBe(true);
    expect(res.body.gstInvoice).toBeDefined();
    expect(res.body.gstInvoice.gstAmountINR).toBe(14400); // 18% of 80000

    // Verify Project financials updated
    const updatedProj = mockStore.getProjectById(cliffProjectId);
    expect(updatedProj).toBeDefined();
    expect(updatedProj!.totalReceived).toBe(80000);
    expect(updatedProj!.balance).toBe(120000);
  });

  it('(c): Creates a Non-GST payment for Cliffhangers India and verifies no GST invoice is generated', async () => {
    const payload = {
      brand,
      projectId: cliffProjectId,
      clientId: cliffClientId,
      clientName: 'Cliffhangers India',
      paymentMode: 'Non GST Online',
      bankAccountId: hdfcAccountId,
      bankAccountName: 'HDFC Bank - Current Account',
      paymentDate: '2026-11-08',
      amountReceived: 40000,
      currency: 'INR',
      exchangeRate: 1,
      amountINR: 40000,
      referenceUtr: 'RAZORPAY-CLIFF-UTR-002',
      paymentStatus: 'Received',
      notes: 'Direct online checkout settlement',
      isNew: true,
    };

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.gstInvoiceSynced).toBe(false);
    expect(res.body.gstInvoice).toBeNull();

    // Verify no GST invoice exists for this payment
    const allGst = mockStore.getGstInvoices(brand);
    const linkedGst = allGst.find((g) => g.paymentId === res.body.payment.id);
    expect(linkedGst).toBeUndefined();
  });

  it('(d): Records an amount above remaining balance as Advance/Extra payment', async () => {
    // Current project balance = 200,000. We record 250,000 (excess 50,000)
    const payload = {
      brand,
      projectId: cliffProjectId,
      clientId: cliffClientId,
      clientName: 'Cliffhangers India',
      paymentMode: 'GST Invoice',
      bankAccountId: hdfcAccountId,
      bankAccountName: 'HDFC Bank',
      paymentDate: '2026-11-08',
      amountReceived: 250000,
      currency: 'INR',
      exchangeRate: 1,
      amountINR: 250000,
      referenceUtr: 'HDFC-ADVANCE-CLIFF-999',
      paymentStatus: 'Received',
      notes: 'Annual expedition advance retainer [Advance/Extra Payment]',
      isNew: true,
    };

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.payment.notes).toContain('[Advance/Extra Payment]');
    expect(res.body.payment.amountINR).toBe(250000);

    // Project balance should reflect excess (contractValue 200,000 - received 250,000 = -50,000 balance)
    const updatedProj = mockStore.getProjectById(cliffProjectId);
    expect(updatedProj!.totalReceived).toBe(250000);
    expect(updatedProj!.balance).toBe(-50000);
  });

  it('Full CRUD: READ, UPDATE, and DELETE operations operate seamlessly', async () => {
    // 1. CREATE
    const createRes = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send({
        brand,
        projectId: cliffProjectId,
        clientId: cliffClientId,
        clientName: 'Cliffhangers India',
        paymentMode: 'GST Invoice',
        bankAccountId: hdfcAccountId,
        amountReceived: 50000,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: 50000,
        referenceUtr: 'CRUD-TEST-UTR-100',
        paymentStatus: 'Received',
        isNew: true,
      });

    expect(createRes.status).toBe(200);
    const createdId = createRes.body.payment.id;
    expect(createdId).toBeDefined();

    // 2. READ (List & Single)
    const listRes = await request(app)
      .get(`/api/payments?brand=${encodeURIComponent(brand)}`)
      .set('Authorization', authHeader);

    expect(listRes.status).toBe(200);
    const found = listRes.body.find((p: any) => p.id === createdId);
    expect(found).toBeDefined();
    expect(found.amountReceived).toBe(50000);

    // 3. UPDATE (Change amount to 65000 and update UTR)
    const updateRes = await request(app)
      .put(`/api/payments/${createdId}`)
      .set('Authorization', authHeader)
      .send({
        ...found,
        isNew: false,
        isUpdate: true,
        amountReceived: 65000,
        amountINR: 65000,
        referenceUtr: 'CRUD-TEST-UTR-100-UPDATED',
        notes: 'Updated tranche reconciliation',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.payment.amountINR).toBe(65000);
    expect(updateRes.body.payment.referenceUtr).toBe('CRUD-TEST-UTR-100-UPDATED');

    // Verify project total updated
    const projAfterUpdate = mockStore.getProjectById(cliffProjectId);
    expect(projAfterUpdate!.totalReceived).toBe(65000);
    expect(projAfterUpdate!.balance).toBe(135000);

    // 4. DELETE
    const deleteRes = await request(app)
      .delete(`/api/payments/${createdId}`)
      .set('Authorization', authHeader);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify deletion
    const listAfterDelete = await request(app)
      .get(`/api/payments?brand=${encodeURIComponent(brand)}`)
      .set('Authorization', authHeader);
    const stillExists = listAfterDelete.body.find((p: any) => p.id === createdId);
    expect(stillExists).toBeUndefined();

    // Verify project total recalculated back to 0
    const projAfterDelete = mockStore.getProjectById(cliffProjectId);
    expect(projAfterDelete!.totalReceived).toBe(0);
    expect(projAfterDelete!.balance).toBe(200000);

    // Verify linked unfiled GST invoice is cleaned up
    const gstList = mockStore.getGstInvoices(brand);
    const lingeringGst = gstList.find((g) => g.paymentId === createdId);
    expect(lingeringGst).toBeUndefined();
  });
});
