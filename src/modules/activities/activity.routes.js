import { Router } from 'express';
import * as controller from './activity.controller.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { createActivitySchema, updateActivitySchema, statusSchema } from './activity.validator.js';

// Auth + tenant context + rate limiting are applied once by routes/tenant.js.
const router = Router();

const READERS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER', 'FINANCE_VIEWER', 'CHECKIN_STAFF'];
const EDITORS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER'];

// Nested under events: /events/:eventId/activities
router.post('/events/:eventId/activities', authorize(...EDITORS), validate(createActivitySchema), catchAsync(controller.createActivity));
router.get('/events/:eventId/activities', authorize(...READERS), catchAsync(controller.listActivities));

// Direct activity routes: /activities/:id
router.get('/activities/:id', authorize(...READERS), catchAsync(controller.getActivity));
router.put('/activities/:id', authorize(...EDITORS), validate(updateActivitySchema), catchAsync(controller.updateActivity));
router.patch('/activities/:id/status', authorize(...EDITORS), validate(statusSchema), catchAsync(controller.changeStatus));
router.delete('/activities/:id', authorize('TENANT_OWNER', 'TENANT_ADMIN'), catchAsync(controller.deleteActivity));

export default router;
