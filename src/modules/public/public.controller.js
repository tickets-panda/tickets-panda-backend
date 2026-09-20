import * as publicService from './public.service.js';
import { success } from '../../utils/apiResponse.js';

export const getTenant = async (req, res) => success(res, { tenant: await publicService.getTenantBySlug(req.params.tenantSlug) });

export const listEvents = async (req, res) => success(res, await publicService.listTenantEvents(req.params.tenantSlug));

export const listAllEvents = async (req, res) => success(res, { events: await publicService.listAllPublicEvents(req.query) });

export const getEvent = async (req, res) => success(res, await publicService.getPublicEvent(req.params.tenantSlug, req.params.eventSlug));

export const getActivity = async (req, res) => success(res, await publicService.getPublicActivity(req.params.tenantSlug, req.params.eventSlug, req.params.activitySlug));

export const getForm = async (req, res) => success(res, { formFields: await publicService.getPublicForm(req.params.tenantSlug, req.params.eventSlug) });

export const verifyToken = async (req, res) => success(res, await publicService.resolveVerificationToken(req.params.token));

export default { getTenant, listEvents, listAllEvents, getEvent, getActivity, getForm, verifyToken };
