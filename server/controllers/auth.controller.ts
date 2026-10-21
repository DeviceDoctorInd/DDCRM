import { Request, Response } from 'express';
import { getOrInitPool } from '../db/azureSql';
import { mockStore } from '../db/mockStore';
import { generateToken, comparePasswords, AuthenticatedRequest } from '../middleware/auth';

export class AuthController {
  /**
   * POST /api/auth/login
   * Authenticate user strictly against live Azure SQL records (or mockStore when DB is offline)
   * NO hardcoded credential bypasses permitted.
   */
  public async login(req: Request, res: Response): Promise<Response> {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email address and password are required.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const pool = await getOrInitPool();

    // 1. LIVE AZURE SQL DATABASE QUERY
    if (pool) {
      try {
        const queryResult = await pool
          .request()
          .input('email', cleanEmail)
          .query(`
            SELECT 
              CAST(id AS NVARCHAR(100)) AS id,
              ISNULL(name, ISNULL(full_name, 'User')) AS name,
              email,
              password_hash,
              role,
              ISNULL(brand, 'All') AS brand,
              ISNULL(status, 'Active') AS status,
              ISNULL(avatar, '') AS avatar
            FROM app_users
            WHERE LOWER(email) = @email
          `);

        if (queryResult.recordset.length === 0) {
          // Strictly reject non-existent user - no hardcoded demo fallback
          return res.status(401).json({
            success: false,
            error: 'Invalid email address or password.',
          });
        }

        const dbUser = queryResult.recordset[0];

        // Verify account is active
        if (dbUser.status !== 'Active') {
          return res.status(403).json({
            success: false,
            error: 'User account is deactivated. Please contact an administrator.',
          });
        }

        // Strict password verification against database password_hash
        const isPasswordValid = await comparePasswords(cleanPassword, dbUser.password_hash || '');
        if (!isPasswordValid) {
          return res.status(401).json({
            success: false,
            error: 'Invalid email address or password.',
          });
        }

        // Generate cryptographically signed JWT token
        const tokenPayload = {
          id: String(dbUser.id),
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          brand: dbUser.brand,
        };
        const token = generateToken(tokenPayload);

        return res.json({
          success: true,
          message: 'Authenticated successfully against database.',
          token,
          user: {
            id: String(dbUser.id),
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            brand: dbUser.brand,
            avatar: dbUser.avatar,
          },
        });
      } catch (err: unknown) {
        console.error('[AuthController.login] Azure SQL query error:', err);
        return res.status(500).json({
          success: false,
          error: 'An error occurred while validating credentials against Azure SQL.',
        });
      }
    }

    // 2. FALLBACK IN-MEMORY STORE (ONLY when Azure SQL pool is completely disconnected)
    console.warn('[AuthController.login] Azure SQL offline — validating against in-memory store.');
    const user = mockStore.authenticate(cleanEmail, cleanPassword);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email address or password.',
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated. Please contact an administrator.',
      });
    }

    const tokenPayload = {
      id: String(user.id),
      email: user.email,
      name: user.name || 'User',
      role: user.role,
      brand: user.brand || 'All',
    };
    const token = generateToken(tokenPayload);

    return res.json({
      success: true,
      message: 'Authenticated successfully.',
      token,
      user: {
        id: String(user.id),
        name: user.name || 'User',
        email: user.email,
        role: user.role,
        brand: user.brand || 'All',
        avatar: user.avatar || '',
      },
    });
  }

  /**
   * GET /api/auth/me
   * Validate session token and return up-to-date user permissions from database
   */
  public async getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<Response> {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Session not found.',
      });
    }

    const pool = await getOrInitPool();
    if (pool) {
      try {
        const queryResult = await pool
          .request()
          .input('email', req.user.email.toLowerCase())
          .query(`
            SELECT 
              CAST(id AS NVARCHAR(100)) AS id,
              ISNULL(name, ISNULL(full_name, 'User')) AS name,
              email,
              role,
              ISNULL(brand, 'All') AS brand,
              ISNULL(status, 'Active') AS status,
              ISNULL(avatar, '') AS avatar
            FROM app_users
            WHERE LOWER(email) = @email
          `);

        if (queryResult.recordset.length === 0) {
          return res.status(401).json({
            success: false,
            error: 'User record no longer exists in database.',
          });
        }

        const dbUser = queryResult.recordset[0];
        if (dbUser.status !== 'Active') {
          return res.status(403).json({
            success: false,
            error: 'User account has been deactivated.',
          });
        }

        return res.json({
          success: true,
          user: {
            id: String(dbUser.id),
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            brand: dbUser.brand,
            avatar: dbUser.avatar,
          },
        });
      } catch (err: unknown) {
        console.error('[AuthController.getCurrentUser] Query error:', err);
      }
    }

    // If pool is offline or in mock mode
    const mockUser = mockStore.getUsers().find((u) => u.email.toLowerCase() === req.user?.email.toLowerCase());
    if (mockUser) {
      if (mockUser.status !== 'Active') {
        return res.status(403).json({
          success: false,
          error: 'User account has been deactivated.',
        });
      }
      return res.json({
        success: true,
        user: {
          id: String(mockUser.id),
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
          brand: mockUser.brand || 'All',
          avatar: mockUser.avatar || '',
        },
      });
    }

    return res.json({
      success: true,
      user: req.user,
    });
  }

  /**
   * POST /api/auth/logout
   */
  public async logout(_req: Request, res: Response): Promise<Response> {
    return res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  }
}

export const authController = new AuthController();
