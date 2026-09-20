import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import platformRoutes from '../modules/platform/platform.routes.js';
import tenantRouter from './tenant.js';
import verificationRoutes from '../modules/verification/verification.routes.js';
import publicRoutes from '../modules/public/public.routes.js';
import bookingRoutes from '../modules/booking/booking.routes.js';
import webhookRoutes from '../modules/payments/webhook.routes.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Ticket Panda API',
    data: { version: 'v1', docs: '/api/v1' },
  });
});

router.use('/auth', authRoutes);
router.use('/customer', customerRoutes);
router.use('/platform', platformRoutes);
router.use('/tenant', tenantRouter);
router.use('/staff', verificationRoutes);
router.use('/public', publicRoutes);
router.use('/booking', bookingRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
