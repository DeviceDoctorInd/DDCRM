import { Request, Response } from 'express';
import { getOrInitPool } from '../db/azureSql';
import { mockStore } from '../db/mockStore';
import { generateToken, comparePasswords, hashPassword, verifyJwtToken, AuthenticatedRequest } from '../middleware/auth';

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
      const authHeader = req.headers['authorization'];
      const tokenString = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const caller = req.user || (tokenString ? verifyJwtToken(tokenString) : null);

      const {
        id,
        adminId,
        email,
        name,
        currentPassword,
        newPassword,
        password,
        brand,
      } = req.body;

      // Identify target user: from payload ID, payload email, or authenticated session
      const rawTargetId = (id || adminId || '').trim();
      const rawTargetEmail = (email || '').trim().toLowerCase();

      const targetId = rawTargetId || (caller ? caller.id : '');
      const targetEmail = rawTargetEmail || (caller ? caller.email.toLowerCase() : '');

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
              ISNULL(avatar, '') AS avatar,
              created_at
            FROM app_users
            WHERE (NULLIF(@targetId, '') IS NOT NULL AND (id = @targetId OR CAST(id AS NVARCHAR(100)) = @targetId))
               OR (NULLIF(@targetEmail, '') IS NOT NULL AND LOWER(email) = @targetEmail)
          `);

        const existingUser = findQuery.recordset[0] || null;

        if (!existingUser) {
          return res.status(404).json({
            success: false,
            error: 'User account not found.',
          });
        }

        const existingPasswordHash = (existingUser.password_hash || '').trim();
        const hasExistingPassword = existingPasswordHash.length > 0;

        // Rule: Unauthenticated request ONLY allowed if password is not set yet (first-time setup)
        if (!caller) {
          if (hasExistingPassword) {
            return res.status(401).json({
              success: false,
              error: 'Access denied. Password has already been configured for this account. Authentication token is required.',
            });
          }
          if (!rawNewPassword) {
            return res.status(400).json({
              success: false,
              error: 'Security password is required for initial account setup.',
            });
          }
        } else {
          // Rule: Authenticated request can ONLY modify caller's own account
          const callerId = (caller.id || '').trim().toLowerCase();
          const callerEmail = (caller.email || '').trim().toLowerCase();
          const targetUserId = (existingUser.id || '').trim().toLowerCase();
          const targetUserEmail = (existingUser.email || '').trim().toLowerCase();

          const isOwnAccount = callerId === targetUserId || callerEmail === targetUserEmail;
          if (!isOwnAccount) {
            return res.status(403).json({
              success: false,
              error: 'Access denied. You can only update credentials for your own account.',
            });
          }

          // Rule: currentPassword is MANDATORY for authenticated updates
          const cleanCurrentPassword = (currentPassword || '').trim();
          if (!cleanCurrentPassword) {
            return res.status(400).json({
              success: false,
              error: 'Current password is required to update credentials.',
            });
          }

          const isCurrentValid = await comparePasswords(cleanCurrentPassword, existingPasswordHash);
          if (!isCurrentValid) {
            return res.status(401).json({
              success: false,
              error: 'Current password verification failed. Please enter your existing password correctly.',
            });
          }
        }

        // Rule: Role cannot be changed via this route; preserve existing role strictly
        const finalRole = existingUser.role;
        const finalId = existingUser.id;
        const finalName = (name || existingUser.name || 'User').trim();
        const finalEmail = (email || existingUser.email).trim().toLowerCase();
        const finalBrand = existingUser.brand || brand || 'All';
        const finalStatus = existingUser.status || 'Active';
        const finalAvatar = existingUser.avatar || '';

        // Determine password_hash
        let finalPasswordHash = existingPasswordHash;
        if (rawNewPassword) {
          finalPasswordHash = await hashPassword(rawNewPassword);
        }

        // Execute parameterized UPDATE query with atomic transaction
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
          updateRequest.input('existingId', existingUser.id);
          updateRequest.input('existingEmail', existingUser.email.toLowerCase());

          await updateRequest.query(`
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
               OR LOWER(email) = @existingEmail;
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
          createdAt: existingUser.created_at || now,
          updatedAt: now,
        });

        // Issue fresh cryptographically signed session token only on valid update
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
      const allUsers = mockStore.getUsers();
      const existingUser = allUsers.find(
        (u) =>
          (targetId && (u.id.toLowerCase() === targetId.toLowerCase() || (u as any).adminId === targetId)) ||
          (targetEmail && u.email.toLowerCase() === targetEmail)
      ) || null;

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User account not found.',
        });
      }

      const existingPassword = (existingUser.password || (existingUser as any).password_hash || '').trim();
      const hasExistingPassword = existingPassword.length > 0;

      // Rule: Unauthenticated request ONLY allowed if password is not set yet (first-time setup)
      if (!caller) {
        if (hasExistingPassword) {
          return res.status(401).json({
            success: false,
            error: 'Access denied. Password has already been configured for this account. Authentication token is required.',
          });
        }
        if (!rawNewPassword) {
          return res.status(400).json({
            success: false,
            error: 'Security password is required for initial account setup.',
          });
        }
      } else {
        // Rule: Authenticated request can ONLY modify caller's own account
        const callerId = (caller.id || '').trim().toLowerCase();
        const callerEmail = (caller.email || '').trim().toLowerCase();
        const targetUserId = (existingUser.id || '').trim().toLowerCase();
        const targetUserEmail = (existingUser.email || '').trim().toLowerCase();

        const isOwnAccount = callerId === targetUserId || callerEmail === targetUserEmail;
        if (!isOwnAccount) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. You can only update credentials for your own account.',
          });
        }

        // Rule: currentPassword is MANDATORY for authenticated updates
        const cleanCurrentPassword = (currentPassword || '').trim();
        if (!cleanCurrentPassword) {
          return res.status(400).json({
            success: false,
            error: 'Current password is required to update credentials.',
          });
        }

        const isCurrentValid = await comparePasswords(cleanCurrentPassword, existingPassword);
        if (!isCurrentValid) {
          return res.status(401).json({
            success: false,
            error: 'Current password verification failed. Please enter your existing password correctly.',
          });
        }
      }

      // Rule: Role cannot be changed via this route; preserve existing role strictly
      const finalRole = existingUser.role;
      const finalId = existingUser.id;
      const finalName = (name || existingUser.name || 'User').trim();
      const finalEmail = (email || existingUser.email).trim().toLowerCase();
      const finalBrand = existingUser.brand || brand || 'All';
      const finalStatus = existingUser.status || 'Active';
      const finalAvatar = existingUser.avatar || '';

      const user = mockStore.saveUser({
        id: finalId,
        name: finalName,
        email: finalEmail,
        password: rawNewPassword || existingPassword || undefined,
        role: finalRole as any,
        brand: finalBrand as any,
        status: finalStatus as any,
        avatar: finalAvatar,
        createdAt: existingUser.createdAt || now,
        updatedAt: now,
      });

      // Issue fresh cryptographically signed session token only on valid update
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
