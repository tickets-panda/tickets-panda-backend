import { Router } from 'express';
import Joi from 'joi';
import * as controller from './platform.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { platformRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { TENANT_STATUS } from '../../utils/constants.js';

const router = Router();

router.use(authenticate, authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN'), platformRateLimiter);

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  search: Joi.string().trim().max(150).allow(''),
  status: Joi.string().trim().max(30).allow(''),
  tenantId: Joi.number().integer(),
});

const statusSchema = Joi.object({ status: Joi.string().valid(...TENANT_STATUS).required() });

router.get('/dashboard/stats', catchAsync(controller.dashboardStats));
router.get('/tenants', validate(listQuerySchema, 'query'), catchAsync(controller.listTenants));
router.get('/tenants/:id', catchAsync(controller.getTenant));
router.patch('/tenants/:id/status', validate(statusSchema), catchAsync(controller.changeTenantStatus));
router.get('/bookings', validate(listQuerySchema, 'query'), catchAsync(controller.listBookings));
router.get('/payments', validate(listQuerySchema, 'query'), catchAsync(controller.listPayments));
router.get('/audit-logs', validate(listQuerySchema, 'query'), catchAsync(controller.listAuditLogs));

export default router;
