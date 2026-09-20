import { Router } from 'express';
import * as controller from './ticketType.controller.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { createTicketTypeSchema, updateTicketTypeSchema } from './ticketType.validator.js';

// Auth + tenant context + rate limiting are applied once by routes/tenant.js.
const router = Router();

const EDITORS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER'];
const READERS = [...EDITORS, 'FINANCE_VIEWER'];

router.get('/events/:eventId/ticket-types', authorize(...READERS), catchAsync(controller.list));
router.post('/events/:eventId/ticket-types', authorize(...EDITORS), validate(createTicketTypeSchema), catchAsync(controller.create));
router.put('/ticket-types/:id', authorize(...EDITORS), validate(updateTicketTypeSchema), catchAsync(controller.update));
router.delete('/ticket-types/:id', authorize(...EDITORS), catchAsync(controller.remove));

export default router;
