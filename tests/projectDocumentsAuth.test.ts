import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './testApp';
import { getValidToken, getViewerToken } from './helpers/auth';

const app = createTestApp();
const validToken = getValidToken();
const viewerToken = getViewerToken();
const sampleProjectId = 'DDI-TECHCORP-INFOTECH-PVT-LTD-ENTERPRISE-SERVER-MAINTENANCE-AMC-1';

describe('Project Documents Route Security - GET /api/projects/:id/documents/:docType', () => {
  it('1. should reject request without token with 401 Unauthorized', async () => {
    const res = await request(app).get(`/api/projects/${sampleProjectId}/documents/proposal`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. should reject request with invalid/malformed token with 401 Unauthorized', async () => {
    const res = await request(app)
      .get(`/api/projects/${sampleProjectId}/documents/proposal`)
      .set('Authorization', 'Bearer invalid-token-string');
    expect(res.status).toBe(401);
  });

  it('3. should allow logged-in user with valid token to download/preview document (expect 200)', async () => {
    const res = await request(app)
      .get(`/api/projects/${sampleProjectId}/documents/proposal`)
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
  });

  it('4. should allow normal logged-in user (Viewer role) to download/preview document (expect 200)', async () => {
    const res = await request(app)
      .get(`/api/projects/${sampleProjectId}/documents/proposal`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it('5. should return 404 when project does not exist (with valid token)', async () => {
    const res = await request(app)
      .get('/api/projects/NON-EXISTENT-PROJECT-9999/documents/proposal')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
  });
});
