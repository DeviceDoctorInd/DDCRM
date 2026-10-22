import { Request, Response } from 'express';
import { getOrInitPool } from '../db/azureSql';
import { mockStore } from '../db/mockStore';
import { generateToken, comparePasswords, hashPassword, AuthenticatedRequest } from '../middleware/auth';

export class AuthController {
  /**
   * POST /api/auth/login
   * Authenticate user strictly against live Azure SQL records (or mockStore when DB is offline)
   * NO hardcoded credential bypasses, no silent fallbacks to old default credentials.
   */
  public async login(req: Request, res: Response): Promise<Response> {
    const { email, password, username, identifier } = req.body;
    const loginIdentifier = (email || username || identifier || '').trim();
    const loginPassword = (password || '').trim();

    if (!loginIdentifier || !loginPassword) {
      return res.status(400).json({
        success: false,
        error: 'Work Email Address / Admin ID and Security Password are required.',
      });
    }

    const cleanIdentifier = loginIdentifier.toLowerCase();
    const pool = await getOrInitPool();

    // 1. LIVE AZURE SQL DATABASE QUERY
    if (pool) {
      try {
        const queryResult = await pool
          .request()
          .input('identifier', cleanIdentifier)
          .query(`
            SELECT 
              CAST(id AS NVARCHAR(100)) AS id,
              ISNULL(name, 'User') AS name,
              email,
              password_hash,
              role,
              ISNULL(brand, 'All') AS brand,
              ISNULL(status, 'Active') AS status,
              ISNULL(avatar, '') AS avatar
            FROM app_users
            WHERE LOWER(LTRIM(RTRIM(email))) = @identifier
               OR LOWER(LTRIM(RTRIM(CAST(id AS NVARCHAR(100))))) = @identifier
               OR LOWER(LTRIM(RTRIM(name))) = @identifier
          `);

        if (queryResult.recordset.length === 0) {
          // Strictly reject non-existent user - no hardcoded demo fallback
          return res.status(401).json({
            success: false,
            error: 'Authentication failed: User account not found in Azure SQL app_users table.',
          });
        }

        const dbUser = queryResult.recordset[0];

        // Verify account status
        if (dbUser.status !== 'Active') {
          return res.status(403).json({
            success: false,
            error: 'User account is deactivated. Please contact an administrator.',
          });
        }

        // Strict password verification against database password_hash (bcrypt or exact)
        const storedHash = (dbUser.password_hash || '').trim();
        const isPasswordValid = await comparePasswords(loginPassword, storedHash);

        if (!isPasswordValid) {
          return res.status(401).json({
            success: false,
            error: 'Authentication failed: Invalid security password.',
          });
        }

        // Generate cryptographically signed JWT token with updated database user details
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
          message: 'Authenticated successfully against Azure SQL database.',
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
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[AuthController.login] Azure SQL query error:', errMsg);
        return res.status(500).json({
          success: false,
          error: `Azure SQL query failure: ${errMsg}`,
        });
      }
    }

    // 2. FALLBACK IN-MEMORY STORE (ONLY when Azure SQL pool is completely disconnected)
    console.warn('[AuthController.login] Azure SQL offline — validating against in-memory store.');
    const user = mockStore.authenticate(cleanIdentifier, loginPassword);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed: Invalid email address or security password.',
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
   * PUT /api/auth/update-credentials (and POST /api/auth/update-credentials)
   * Updates admin/user credentials (email, name, password, role) in live Azure SQL
   * Automatically hashes new password using bcrypt before persisting.
   * Returns fresh session token and user payload.
   */
  public async updateCredentials(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const {
        id,
        adminId,
        email,
        name,
        currentPassword,
        newPassword,
        password,
        role,
        brand,
      } = req.body;

      // Identify target user: from payload ID, payload email, or authenticated session
      const targetId = (id || adminId || req.user?.id || '').trim();
      const targetEmail = (email || req.user?.email || '').trim().toLowerCase();

      if (!targetId && !targetEmail) {
        return res.status(400).json({
          success: false,
          error: 'User ID or Email is required to update credentials.',
        });
      }

      const rawNewPassword = (newPassword || password || '').trim();
      if (rawNewPassword && rawNewPassword.length < 4) {
        return res.status(400).json({
          success: false,
          error: 'New security password must be at least 4 characters long.',
        });
      }

      const pool = await getOrInitPool();
      const now = new Date().toISOString();

      // 1. UPDATE LIVE AZURE SQL DATABASE
      if (pool) {
        // First look up existing user
        const findQuery = await pool
          .request()
          .input('targetId', targetId)
          .input('targetEmail', targetEmail)
          .query(`
            SELECT 
              CAST(id AS NVARCHAR(100)) AS id,
              ISNULL(name, 'User') AS name,
              email,
              password_hash,
              role,
              ISNULL(brand, 'All') AS brand,
              ISNULL(status, 'Active') AS status,
              ISNULL(avatar, '') AS avatar
            FROM app_users
            WHERE (NULLIF(@targetId, '') IS NOT NULL AND (id = @targetId OR CAST(id AS NVARCHAR(100)) = @targetId))
               OR (NULLIF(@targetEmail, '') IS NOT NULL AND LOWER(email) = @targetEmail)
          `);

        const existingUser = findQuery.recordset[0] || null;

        // If currentPassword was provided, verify it unless caller is a Super Admin
        if (currentPassword && existingUser && req.user?.role !== 'Super Admin') {
          const isCurrentValid = await comparePasswords(currentPassword.trim(), existingUser.password_hash || '');
          if (!isCurrentValid) {
            return res.status(401).json({
              success: false,
              error: 'Current password verification failed. Please enter your existing password correctly.',
            });
          }
        }

        // Determine updated fields
        const finalId = targetId || existingUser?.id || `USR-${Date.now().toString().slice(-4)}`;
        const finalName = (name || existingUser?.name || targetEmail.split('@')[0] || 'User').trim();
        const finalEmail = (email || existingUser?.email || targetEmail).trim().toLowerCase();
        const finalRole = role || existingUser?.role || 'Super Admin';
        const finalBrand = brand || existingUser?.brand || 'All';
        const finalStatus = existingUser?.status || 'Active';
        const finalAvatar = existingUser?.avatar || '';

        // Determine password_hash
        let finalPasswordHash = existingUser?.password_hash || '';
        if (rawNewPassword) {
          finalPasswordHash = await hashPassword(rawNewPassword);
        } else if (!finalPasswordHash) {
          finalPasswordHash = await hashPassword('Admin@2026');
        }

        // Execute parameterized UPSERT query with atomic transaction
        const transaction = pool.transaction();
        await transaction.begin();

        try {
          const updateRequest = transaction.request();
          updateRequest.input('id', finalId);
          updateRequest.input('name', finalName);
          updateRequest.input('email', finalEmail);
          updateRequest.input('password_hash', finalPasswordHash);
          updateRequest.input('role', finalRole);
          updateRequest.input('brand', finalBrand);
          updateRequest.input('status', finalStatus);
          updateRequest.input('avatar', finalAvatar);
          updateRequest.input('updated_at', now);
          updateRequest.input('created_at', existingUser?.created_at || now);
          updateRequest.input('existingId', existingUser ? existingUser.id : finalId);
          updateRequest.input('existingEmail', existingUser ? existingUser.email.toLowerCase() : finalEmail);

          await updateRequest.query(`
            IF EXISTS (
              SELECT 1 FROM app_users 
              WHERE id = @existingId 
                 OR CAST(id AS NVARCHAR(100)) = @existingId 
                 OR LOWER(email) = @existingEmail
                 OR id = @id
                 OR LOWER(email) = @email
            )
            BEGIN
              UPDATE app_users
              SET 
                name = @name,
                email = @email,
                password_hash = @password_hash,
                role = @role,
                brand = @brand,
                status = @status,
                avatar = @avatar,
                updated_at = @updated_at
              WHERE id = @existingId 
                 OR CAST(id AS NVARCHAR(100)) = @existingId 
                 OR LOWER(email) = @existingEmail
                 OR id = @id
                 OR LOWER(email) = @email;
            END
            ELSE
            BEGIN
              INSERT INTO app_users (id, name, email, password_hash, role, brand, status, avatar, created_at, updated_at)
              VALUES (@id, @name, @email, @password_hash, @role, @brand, @status, @avatar, @created_at, @updated_at);
            END
          `);

          await transaction.commit();
          console.log(`[AuthController.updateCredentials] Successfully committed credentials update for ${finalEmail} (ID: ${finalId})`);
        } catch (txErr) {
          await transaction.rollback();
          throw txErr;
        }

        // Also sync in-memory store so fallback stays identical
        mockStore.saveUser({
          id: finalId,
          name: finalName,
          email: finalEmail,
          password: rawNewPassword || undefined,
          role: finalRole as any,
          brand: finalBrand as any,
          status: finalStatus as any,
          avatar: finalAvatar,
          createdAt: existingUser?.created_at || now,
          updatedAt: now,
        });

        // Issue fresh cryptographically signed session token
        const freshToken = generateToken({
          id: finalId,
          email: finalEmail,
          name: finalName,
          role: finalRole,
          brand: finalBrand,
        });

        return res.json({
          success: true,
          message: 'Admin credentials successfully updated and committed to Azure SQL Database.',
          token: freshToken,
          user: {
            id: finalId,
            name: finalName,
            email: finalEmail,
            role: finalRole,
            brand: finalBrand,
            avatar: finalAvatar,
          },
        });
      }

      // 2. FALLBACK IN-MEMORY STORE (When pool is not connected)
      console.warn('[AuthController.updateCredentials] Azure SQL offline — updating in-memory store.');
      const user = mockStore.saveUser({
        id: targetId || `USR-${Date.now().toString().slice(-4)}`,
        name: name || targetEmail.split('@')[0] || 'User',
        email: targetEmail,
        password: rawNewPassword || undefined,
        role: (role as any) || 'Super Admin',
        brand: (brand as any) || 'All',
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      });

      const freshToken = generateToken({
        id: String(user.id),
        email: user.email,
        name: user.name || 'User',
        role: user.role,
        brand: user.brand || 'All',
      });

      return res.json({
        success: true,
        message: 'Admin credentials updated in store.',
        token: freshToken,
        user: {
          id: String(user.id),
          name: user.name || 'User',
          email: user.email,
          role: user.role,
          brand: user.brand || 'All',
          avatar: user.avatar || '',
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[AuthController.updateCredentials] Error:', errMsg);
      return res.status(500).json({
        success: false,
        error: `Failed to update credentials in Azure SQL: ${errMsg}`,
      });
    }
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
              ISNULL(name, 'User') AS name,
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
