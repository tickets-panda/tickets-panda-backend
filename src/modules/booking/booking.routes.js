import { Router } from 'express';
import * as controller from './booking.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { bookingRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { initiateBookingSchema, verifyPaymentSchema, retryPaymentSchema } from './booking.validator.js';

const router = Router();

router.post('/initiate', bookingRateLimiter, validate(initiateBookingSchema), catchAsync(controller.initiate));
router.post('/verify-payment', bookingRateLimiter, validate(verifyPaymentSchema), catchAsync(controller.verifyPayment));
router.get('/checkout/:orderRef', catchAsync(controller.checkoutDetails));
router.post('/retry-payment', bookingRateLimiter, validate(retryPaymentSchema), catchAsync(controller.retryPayment));
router.get('/confirmation/:orderRef', catchAsync(controller.confirmation));
router.get('/confirmation/:orderRef/pdf', catchAsync(controller.downloadPdf));

export default router;
