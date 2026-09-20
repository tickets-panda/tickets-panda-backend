import { Router } from 'express';
import * as controller from './tenant.controller.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { updateProfileSchema, addMemberSchema, updateMemberSchema, listQuerySchema } from './tenant.validator.js';

// Auth + tenant context + rate limiting are applied once by routes/tenant.js.
const router = Router();

const MANAGERS = ['TENANT_OWNER', 'TENANT_ADMIN'];
const OPS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER', 'FINANCE_VIEWER'];
const GATE = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER', 'CHECKIN_STAFF'];

router.get('/profile', authorize(...OPS, 'CHECKIN_STAFF'), catchAsync(controller.getProfile));
router.put('/profile', authorize(...MANAGERS), validate(updateProfileSchema), catchAsync(controller.updateProfile));

router.get('/dashboard/stats', authorize(...OPS), catchAsync(controller.getDashboardStats));
router.get('/analytics', authorize(...OPS), catchAsync(controller.getAnalytics));

router.get('/members', authorize(...MANAGERS), catchAsync(controller.listMembers));
router.post('/members', authorize(...MANAGERS), validate(addMemberSchema), catchAsync(controller.addMember));
router.put('/members/:id', authorize(...MANAGERS), validate(updateMemberSchema), catchAsync(controller.updateMember));
router.delete('/members/:id', authorize(...MANAGERS), catchAsync(controller.removeMember));

router.get('/registrations', authorize(...OPS), validate(listQuerySchema, 'query'), catchAsync(controller.listRegistrations));
router.get('/registrations/:id', authorize(...OPS), catchAsync(controller.getRegistration));
router.get('/orders', authorize(...OPS), validate(listQuerySchema, 'query'), catchAsync(controller.listOrders));
router.get('/payments', authorize(...OPS), validate(listQuerySchema, 'query'), catchAsync(controller.listPayments));
router.get('/tickets', authorize(...OPS), validate(listQuerySchema, 'query'), catchAsync(controller.listTickets));
router.get('/tickets/:id', authorize(...OPS), catchAsync(controller.getTicket));
router.get('/checkins', authorize(...GATE), validate(listQuerySchema, 'query'), catchAsync(controller.listCheckins));
router.get('/audit-logs', authorize(...MANAGERS), validate(listQuerySchema, 'query'), catchAsync(controller.listAuditLogs));

export default router;
