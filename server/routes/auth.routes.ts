import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/login - Strict database verification against Azure SQL app_users
router.post('/login', (req, res) => {
  authController.login(req, res);
});

// PUT /api/auth/update-credentials - Update user/admin credentials in live Azure SQL
router.put('/update-credentials', optionalAuthenticateToken, (req, res) => {
  authController.updateCredentials(req, res);
});

// POST /api/auth/update-credentials - Backward compatibility for clients posting updates
router.post('/update-credentials', optionalAuthenticateToken, (req, res) => {
  authController.updateCredentials(req, res);
});

// GET /api/auth/me - Validate session and fetch latest user info
router.get('/me', authenticateToken, (req, res) => {
  authController.getCurrentUser(req, res);
});

// POST /api/auth/logout - Terminate session
router.post('/logout', (req, res) => {
  authController.logout(req, res);
});

export default router;
