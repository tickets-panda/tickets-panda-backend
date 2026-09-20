import { Router } from 'express';
import * as controller from './customer.controller.js';
import { authenticateCustomer } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { otpRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { sendOtpSchema, verifyOtpSchema } from './customer.validator.js';

const router = Router();

router.post('/otp/send', otpRateLimiter, validate(sendOtpSchema), catchAsync(controller.sendOtp));
router.post('/otp/verify', otpRateLimiter, validate(verifyOtpSchema), catchAsync(controller.verifyOtp));
router.get('/my-tickets', authenticateCustomer, catchAsync(controller.myTickets));

export default router;
