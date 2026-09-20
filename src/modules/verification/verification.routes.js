import { Router } from 'express';
import * as controller from './verification.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/role.middleware.js';
import { attachTenant } from '../../middleware/tenant.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { staffRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { verifyTicketSchema, checkinSchema } from './verification.validator.js';

const router = Router();

router.use(authenticate, attachTenant, staffRateLimiter);

const GATE = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER', 'CHECKIN_STAFF'];

router.post('/verify', authorize(...GATE), validate(verifyTicketSchema), catchAsync(controller.verify));
router.post('/checkin', authorize(...GATE), validate(checkinSchema), catchAsync(controller.checkin));
router.get('/event/:eventId/gate-stats', authorize(...GATE), catchAsync(controller.gateStats));
router.get('/event/:eventId/checkins', authorize(...GATE), catchAsync(controller.eventCheckins));

export default router;
