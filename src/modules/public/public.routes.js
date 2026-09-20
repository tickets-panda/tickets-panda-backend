import { Router } from 'express';
import * as controller from './public.controller.js';
import { publicRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { catchAsync } from '../../utils/helpers.js';

const router = Router();

router.use(publicRateLimiter);

router.get('/t/:tenantSlug', catchAsync(controller.getTenant));
router.get('/t/:tenantSlug/events', catchAsync(controller.listEvents));
router.get('/t/:tenantSlug/events/:eventSlug', catchAsync(controller.getEvent));
router.get('/t/:tenantSlug/events/:eventSlug/activities/:activitySlug', catchAsync(controller.getActivity));
router.get('/t/:tenantSlug/events/:eventSlug/form', catchAsync(controller.getForm));
router.get('/verify/:token', catchAsync(controller.verifyToken));

export default router;
