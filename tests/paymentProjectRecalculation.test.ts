import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken } from './helpers/auth';

const app = createTestApp();
const authHeader = `Bearer ${getValidToken()}`;

describe('Payment & Project Financial Recalculation Integrity Tests', () => {
  const project1Id = 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1';
  const project2Id = 'DDI-APOLLO-DIAGNOSTICS-CENTRE-HYBRID-CLOUD-ARCHITECTURE-AWS-AZURE-MIGRATION-1';

  it('1. should NOT count payment with status "Pending" into project totalReceived or balance', async () => {
    // Step 1: Read initial project figures
    const projRes1 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1Before = projRes1.body.find((p: any) => p.id === project1Id);
    expect(p1Before).toBeDefined();
    const initialReceived = Number(p1Before.totalReceived);
    const initialBalance = Number(p1Before.balance);

    // Step 2: Post a Pending payment
    const pendingAmount = 25000;
    const addRes = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send({
        brand: 'Device Doctor India',
        projectId: project1Id,
        clientId: p1Before.clientId,
        clientName: p1Before.clientName,
        amountReceived: pendingAmount,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: pendingAmount,
        paymentMode: 'GST Invoice',
        paymentDate: '2026-03-01',
        paymentStatus: 'Pending',
      });
    expect(addRes.status).toBe(200);
    const pendingPayId = addRes.body.payment.id;

    // Step 3: Verify project figures did NOT change for Pending payment
    const projRes2 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1After = projRes2.body.find((p: any) => p.id === project1Id);
    expect(Number(p1After.totalReceived)).toBe(initialReceived);
    expect(Number(p1After.balance)).toBe(initialBalance);

    // Cleanup
    await request(app)
      .delete(`/api/payments/${pendingPayId}`)
      .set('Authorization', authHeader);
  });

  it('2. should correctly update balance on payment create and restore on delete', async () => {
    // Step 1: Read initial project figures
    const projRes1 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1Before = projRes1.body.find((p: any) => p.id === project1Id);
    const initialReceived = Number(p1Before.totalReceived);
    const initialBalance = Number(p1Before.balance);

    // Step 2: Add Received payment of 45000
    const payAmount = 45000;
    const addRes = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send({
        brand: 'Device Doctor India',
        projectId: project1Id,
        clientId: p1Before.clientId,
        clientName: p1Before.clientName,
        amountReceived: payAmount,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: payAmount,
        paymentMode: 'Non GST Online',
        paymentDate: '2026-03-02',
        paymentStatus: 'Received',
      });
    expect(addRes.status).toBe(200);
    const paymentId = addRes.body.payment.id;

    // Step 3: Verify project received increased and balance decreased
    const projRes2 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1AfterAdd = projRes2.body.find((p: any) => p.id === project1Id);
    expect(Number(p1AfterAdd.totalReceived)).toBe(initialReceived + payAmount);
    expect(Number(p1AfterAdd.balance)).toBe(initialBalance - payAmount);

    // Step 4: Delete the payment
    const delRes = await request(app)
      .delete(`/api/payments/${paymentId}`)
      .set('Authorization', authHeader);
    expect(delRes.status).toBe(200);

    // Step 5: Verify project values restored exactly to initial
    const projRes3 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1AfterDel = projRes3.body.find((p: any) => p.id === project1Id);
    expect(Number(p1AfterDel.totalReceived)).toBe(initialReceived);
    expect(Number(p1AfterDel.balance)).toBe(initialBalance);
  });

  it('3. should recalculate both projects when payment projectId is changed during edit', async () => {
    // Step 1: Read initial figures of both projects
    const projRes1 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1Before = projRes1.body.find((p: any) => p.id === project1Id);
    const p2Before = projRes1.body.find((p: any) => p.id === project2Id);
    expect(p1Before).toBeDefined();
    expect(p2Before).toBeDefined();

    const p1InitialReceived = Number(p1Before.totalReceived);
    const p1InitialBalance = Number(p1Before.balance);
    const p2InitialReceived = Number(p2Before.totalReceived);
    const p2InitialBalance = Number(p2Before.balance);

    // Step 2: Create a payment of 60000 on Project 1
    const shiftAmount = 60000;
    const addRes = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader)
      .send({
        brand: 'Device Doctor India',
        projectId: project1Id,
        clientId: p1Before.clientId,
        clientName: p1Before.clientName,
        amountReceived: shiftAmount,
        currency: 'INR',
        exchangeRate: 1,
        amountINR: shiftAmount,
        paymentMode: 'Non GST Online',
        paymentDate: '2026-03-03',
        paymentStatus: 'Received',
      });
    expect(addRes.status).toBe(200);
    const shiftPayId = addRes.body.payment.id;

    // Verify Project 1 increased
    const projRes2 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1AfterAdd = projRes2.body.find((p: any) => p.id === project1Id);
    expect(Number(p1AfterAdd.totalReceived)).toBe(p1InitialReceived + shiftAmount);

    // Step 3: Edit payment to point to Project 2 instead
    const editRes = await request(app)
      .put(`/api/payments/${shiftPayId}`)
      .set('Authorization', authHeader)
      .send({
        projectId: project2Id,
        clientId: p2Before.clientId,
        clientName: p2Before.clientName,
        amountReceived: shiftAmount,
        amountINR: shiftAmount,
        paymentStatus: 'Received',
      });
    expect(editRes.status).toBe(200);

    // Step 4: Verify Project 1 decreased back, and Project 2 increased
    const projRes3 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p1AfterShift = projRes3.body.find((p: any) => p.id === project1Id);
    const p2AfterShift = projRes3.body.find((p: any) => p.id === project2Id);

    expect(Number(p1AfterShift.totalReceived)).toBe(p1InitialReceived);
    expect(Number(p1AfterShift.balance)).toBe(p1InitialBalance);

    expect(Number(p2AfterShift.totalReceived)).toBe(p2InitialReceived + shiftAmount);
    expect(Number(p2AfterShift.balance)).toBe(p2InitialBalance - shiftAmount);

    // Cleanup: Delete the payment
    await request(app)
      .delete(`/api/payments/${shiftPayId}`)
      .set('Authorization', authHeader);

    // Verify Project 2 restored
    const projRes4 = await request(app)
      .get('/api/projects')
      .set('Authorization', authHeader);
    const p2Final = projRes4.body.find((p: any) => p.id === project2Id);
    expect(Number(p2Final.totalReceived)).toBe(p2InitialReceived);
    expect(Number(p2Final.balance)).toBe(p2InitialBalance);
  });
});
