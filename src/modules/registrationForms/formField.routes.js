import { Router } from 'express';
import * as controller from './formField.controller.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { catchAsync } from '../../utils/helpers.js';
import { createFormFieldSchema, updateFormFieldSchema } from './formField.validator.js';

// Auth + tenant context + rate limiting are applied once by routes/tenant.js.
const router = Router();

const EDITORS = ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER'];
const READERS = [...EDITORS, 'FINANCE_VIEWER'];

router.get('/events/:eventId/form-fields', authorize(...READERS), catchAsync(controller.list));
router.post('/events/:eventId/form-fields', authorize(...EDITORS), validate(createFormFieldSchema), catchAsync(controller.create));
router.put('/form-fields/:id', authorize(...EDITORS), validate(updateFormFieldSchema), catchAsync(controller.update));
router.delete('/form-fields/:id', authorize(...EDITORS), catchAsync(controller.remove));

export default router;
