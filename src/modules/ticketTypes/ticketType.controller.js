import * as service from './ticketType.service.js';
import { success, created } from '../../utils/apiResponse.js';

export const list = async (req, res) => success(res, { ticketTypes: await service.listTicketTypes(req.tenantId, req.params.eventId) });

export const create = async (req, res) =>
  created(res, { ticketType: await service.createTicketType(req.tenantId, req.params.eventId, req.body) }, 'Ticket type created successfully');

export const update = async (req, res) =>
  success(res, { ticketType: await service.updateTicketType(req.tenantId, req.params.id, req.body) }, 'Ticket type updated successfully');

export const remove = async (req, res) => {
  await service.deleteTicketType(req.tenantId, req.params.id);
  return success(res, null, 'Ticket type deleted successfully');
};

export default { list, create, update, remove };
