import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/login - Strict database verification
router.post('/login', (req, res) => {
  authController.login(req, res);
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
