import { Router } from 'express';
import * as controller from './webhook.controller.js';
import { catchAsync } from '../../utils/helpers.js';

const router = Router();

// No rate limiter — Razorpay delivers from its own infrastructure.
router.post('/razorpay', catchAsync(controller.razorpayWebhook));

export default router;
