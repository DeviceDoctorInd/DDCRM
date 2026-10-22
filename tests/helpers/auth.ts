import jwt from 'jsonwebtoken';
import { JWT_SECRET, AuthTokenPayload } from '../../server/middleware/auth';

export function getValidToken(overrides?: Partial<AuthTokenPayload>): string {
  const payload: AuthTokenPayload = {
    id: 'USR-001',
    email: 'rathorehemant114@gmail.com',
    name: 'Hemant Rathore',
    role: 'Super Admin',
    brand: 'All',
    ...overrides,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function getViewerToken(overrides?: Partial<AuthTokenPayload>): string {
  const payload: AuthTokenPayload = {
    id: 'USR-006',
    email: 'viewer@devicedoctor.in',
    name: 'Executive Reviewer',
    role: 'Viewer',
    brand: 'All',
    ...overrides,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function getExpiredToken(): string {
  const payload: AuthTokenPayload = {
    id: 'USR-001',
    email: 'rathorehemant114@gmail.com',
    name: 'Hemant Rathore',
    role: 'Super Admin',
    brand: 'All',
  };
  // Token created with negative expiry (expired 1 hour ago)
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' });
}
