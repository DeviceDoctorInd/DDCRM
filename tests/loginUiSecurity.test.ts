import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import request from 'supertest';
import { createTestApp } from './testApp';

// Mock CrmContext so LoginScreen can render in node test environment
vi.mock('../src/context/CrmContext', () => ({
  useCrm: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    selectBrandWorkspace: vi.fn(),
    authUser: null,
    hasConfirmedWorkspace: false,
    theme: 'light',
    toggleTheme: vi.fn(),
    databaseStatus: { connected: true, server: 'mock-server', database: 'mock-db' },
  }),
}));

import { LoginScreen } from '../src/components/auth/LoginScreen';

const app = createTestApp();

describe('Login Page Security & Default Account Disclosure Removal', () => {
  describe('Rendered UI Verification', () => {
    it('should NOT render the "Standard Initial Accounts" section, heading, or description', () => {
      const html = renderToStaticMarkup(React.createElement(LoginScreen));

      expect(html).not.toContain('Standard Initial Accounts');
      expect(html).not.toContain('1-Click Live Test');
      expect(html).not.toContain('If you updated your Admin ID or password in User Settings');
    });

    it('should NOT render any default role or account cards', () => {
      const html = renderToStaticMarkup(React.createElement(LoginScreen));

      expect(html).not.toContain('Super Admin');
      expect(html).not.toContain('DDI Primary Admin');
      expect(html).not.toContain('Brand Admin (Codestro)');
      expect(html).not.toContain('Brand Admin (DUNS)');
      expect(html).not.toContain('Project Manager');
      expect(html).not.toContain('Accountant');
    });

    it('should NOT expose any default credentials or email addresses in the login screen markup', () => {
      const html = renderToStaticMarkup(React.createElement(LoginScreen));

      expect(html).not.toContain('devicedoctorindia.in@gmail.com');
      expect(html).not.toContain('admin@codestro.com');
      expect(html).not.toContain('admin@duns.com');
      expect(html).not.toContain('karthik.pm@devicedoctor.in');
      expect(html).not.toContain('finance@devicedoctor.in');
      expect(html).not.toContain('Admin@2026');
      expect(html).not.toContain('Codestro@2026');
      expect(html).not.toContain('Duns@2026');
      expect(html).not.toContain('Project@2026');
      expect(html).not.toContain('Finance@2026');
    });

    it('should preserve manual credential inputs and authentication submit button', () => {
      const html = renderToStaticMarkup(React.createElement(LoginScreen));

      // Label and input for Work Email / Admin ID
      expect(html).toContain('Work Email Address / Admin ID');
      expect(html).toContain('placeholder="Enter Work Email or Admin ID (e.g. USR-001)"');
      expect(html).toContain('type="text"');

      // Label and input for Security Password
      expect(html).toContain('Security Password');
      expect(html).toContain('placeholder="Enter security password"');
      expect(html).toContain('type="password"');

      // Submit action button
      expect(html).toContain('Authenticate &amp; Continue to Workspace Selection');
      expect(html).toContain('type="submit"');
    });
  });

  describe('Manual Authentication API Flow Verification', () => {
    it('should successfully authenticate when legitimate credentials are submitted manually', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'Admin@2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('rathorehemant114@gmail.com');
    });

    it('should reject authentication when invalid credentials are manually provided', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rathorehemant114@gmail.com',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.token).toBeUndefined();
    });

    it('should reject empty credentials without bypassing authentication', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: '',
          password: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
