import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { attachTenant } from '../middleware/tenant.middleware.js';
import { tenantRateLimiter } from '../middleware/rateLimiter.middleware.js';
import tenantRoutes from '../modules/tenants/tenant.routes.js';
import eventRoutes from '../modules/events/events.routes.js';
import activityRoutes from '../modules/activities/activity.routes.js';
import ticketTypeRoutes from '../modules/ticketTypes/ticketType.routes.js';
import formFieldRoutes from '../modules/registrationForms/formField.routes.js';

/**
 * All /tenant/* traffic passes through auth + tenant isolation + rate limiting
 * exactly once, then is delegated to the resource routers.
 */
const router = Router();

router.use(authenticate, attachTenant, tenantRateLimiter);
router.use(tenantRoutes);
router.use(eventRoutes);
router.use(activityRoutes);
router.use(ticketTypeRoutes);
router.use(formFieldRoutes);

export default router;
