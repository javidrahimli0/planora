import { Router } from 'express';
import {
	register,
	login,
	getMe,
	updateMe,
	deleteMe,
	verifyEmailCode,
	resendVerificationCode,
	requestPasswordReset,
	resetPassword,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/verify-email
router.post('/verify-email', verifyEmailCode);

// POST /api/auth/resend-verification
router.post('/resend-verification', resendVerificationCode);

// POST /api/auth/request-password-reset
router.post('/request-password-reset', requestPasswordReset);

// POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

// GET /api/auth/me  (protected)
router.get('/me', authenticate, getMe);

// PATCH /api/auth/me (protected)
router.patch('/me', authenticate, updateMe);

// DELETE /api/auth/me (protected)
router.delete('/me', authenticate, deleteMe);

export default router;
