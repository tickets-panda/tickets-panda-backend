import * as service from './verification.service.js';
import { success, paginated } from '../../utils/apiResponse.js';

export const verify = async (req, res) => {
  const result = await service.verifyTicket(req.user, req.assignedEvents, req.body, req);
  return success(res, result, result.valid ? 'Ticket is valid' : 'Ticket cannot be used');
};

export const checkin = async (req, res) => {
  const result = await service.checkIn(req.user, req.assignedEvents, req.body, req);
  return success(res, result, 'Checked in successfully');
};

export const gateStats = async (req, res) => {
  const data = await service.gateStats(req.user, req.assignedEvents, req.params.eventId);
  return success(res, data);
};

export const eventCheckins = async (req, res) => {
  const { rows, pagination } = await service.eventCheckins(req.tenantId, req.params.eventId, req.query);
  return paginated(res, rows, pagination);
};

export default { verify, checkin, gateStats, eventCheckins };
