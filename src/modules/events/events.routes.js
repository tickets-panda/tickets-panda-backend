import { Router } from 'express';
import * as controller from './events.controller.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { createEventSchema, updateEventSchema, statusSchema } from './events.validator.js';

// Auth + tenant context + rate limiting are applied once by routes/tenant.js.
const router = Router();

const READERS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER', 'FINANCE_VIEWER', 'CHECKIN_STAFF'];
const EDITORS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER'];

router.post('/events', authorize(...EDITORS), validate(createEventSchema), catchAsync(controller.createEvent));
router.get('/events', authorize(...READERS), catchAsync(controller.listEvents));
router.get('/events/:id', authorize(...READERS), catchAsync(controller.getEvent));
router.put('/events/:id', authorize(...EDITORS), validate(updateEventSchema), catchAsync(controller.updateEvent));
router.patch('/events/:id/status', authorize(...EDITORS), validate(statusSchema), catchAsync(controller.changeStatus));
router.delete('/events/:id', authorize('TENANT_OWNER', 'TENANT_ADMIN'), catchAsync(controller.deleteEvent));

export default router;
