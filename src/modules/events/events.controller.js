import * as eventService from './events.service.js';
import { success, created, paginated } from '../../utils/apiResponse.js';

const scopeOf = (req) => ({ role: req.user.role, assignedEvents: req.assignedEvents });

export const createEvent = async (req, res) => {
  const event = await eventService.createEvent(req.tenantId, req.user.id, req.body, req);
  return created(res, { event }, 'Event created successfully');
};

export const listEvents = async (req, res) => {
  const { rows, pagination } = await eventService.listEvents(req.tenantId, req.query, scopeOf(req));
  return paginated(res, rows, pagination);
};

export const getEvent = async (req, res) => {
  const { event, stats } = await eventService.getEvent(req.tenantId, req.params.id, scopeOf(req));
  return success(res, { event, stats });
};

export const updateEvent = async (req, res) => {
  const event = await eventService.updateEvent(req.tenantId, req.params.id, req.body, req.user.id, req, scopeOf(req));
  return success(res, { event }, 'Event updated successfully');
};

export const changeStatus = async (req, res) => {
  const event = await eventService.changeEventStatus(req.tenantId, req.params.id, req.body.status, req.user.id, req, scopeOf(req));
  return success(res, { event }, 'Event status updated');
};

export const deleteEvent = async (req, res) => {
  await eventService.deleteEvent(req.tenantId, req.params.id, req.user.id, req);
  return success(res, null, 'Event deleted successfully');
};

export default { createEvent, listEvents, getEvent, updateEvent, changeStatus, deleteEvent };
