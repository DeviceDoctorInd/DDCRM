import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export interface AuthTokenPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  brand: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export const JWT_SECRET = process.env.JWT_SECRET || 'ddi-crm-production-jwt-secret-key-2026';
export const JWT_EXPIRES_IN = '7d';

/**
 * Generate a cryptographically signed JWT session token
 */
export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode a JWT token string
 */
export function verifyJwtToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Express middleware to validate JWT session tokens from the Authorization header
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No authentication token provided.',
    });
  }

  const decoded = verifyJwtToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session token. Please sign in again.',
    });
  }

  req.user = decoded;
  next();
}

/**
 * Optional token authentication middleware (attaches req.user if token is present and valid, doesn't block)
 */
export function optionalAuthenticateToken(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  if (token) {
    const decoded = verifyJwtToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
}

/**
 * Securely compare provided plaintext password with stored hash or exact string
 */
export async function comparePasswords(provided: string, storedHash: string): Promise<boolean> {
  if (!provided || !storedHash) return false;
  const cleanProvided = String(provided).trim();
  const cleanStored = String(storedHash).trim();
  if (!cleanProvided || !cleanStored) return false;

  // If stored password is a standard bcrypt hash
  if (cleanStored.startsWith('$2a$') || cleanStored.startsWith('$2b$') || cleanStored.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(cleanProvided, cleanStored);
    } catch {
      return false;
    }
  }
  // Fallback to exact comparison for unhashed legacy records
  return cleanProvided === cleanStored;
}

/**
 * Hash a password using bcrypt with salt rounds = 10
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}
