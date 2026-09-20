import { Router } from 'express';
import * as controller from './auth.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import {
  registerTenantSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validator.js';

const router = Router();

router.post('/register/tenant', authRateLimiter, validate(registerTenantSchema), catchAsync(controller.registerTenant));
router.post('/login', authRateLimiter, validate(loginSchema), catchAsync(controller.login));
router.post('/refresh-token', catchAsync(controller.refreshToken));
router.post('/logout', catchAsync(controller.logout));
router.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), catchAsync(controller.forgotPassword));
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), catchAsync(controller.resetPassword));
router.get('/me', authenticate, catchAsync(controller.me));

export default router;
