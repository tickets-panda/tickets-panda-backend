import { TicketType, Event, Ticket } from '../../database/models/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';
import { pick } from '../../utils/helpers.js';

const FIELDS = ['name', 'description', 'price', 'currency', 'quantity', 'minPerOrder', 'maxPerOrder', 'sortOrder', 'isActive', 'activityId'];

const assertEvent = async (tenantId, eventId) => {
  const event = await Event.findOne({ where: { id: eventId, tenantId } });
  if (!event) throw new NotFoundError('Event not found');
  return event;
};

export async function listTicketTypes(tenantId, eventId) {
  await assertEvent(tenantId, eventId);
  return TicketType.findAll({ where: { tenantId, eventId }, order: [['sortOrder', 'ASC']] });
}

export async function createTicketType(tenantId, eventId, payload) {
  await assertEvent(tenantId, eventId);

  if (payload.maxPerOrder && payload.minPerOrder && payload.maxPerOrder < payload.minPerOrder) {
    throw new ValidationError('maxPerOrder cannot be lower than minPerOrder');
  }

  return TicketType.create({ ...pick(payload, FIELDS), tenantId, eventId });
}

export async function updateTicketType(tenantId, id, payload) {
  const ticketType = await TicketType.findOne({ where: { id, tenantId } });
  if (!ticketType) throw new NotFoundError('Ticket type not found');

  const changes = pick(payload, FIELDS);

  if (changes.quantity !== undefined && changes.quantity < ticketType.soldCount) {
    throw new ConflictError(`Quantity cannot be lower than the ${ticketType.soldCount} tickets already sold`);
  }
  if (changes.maxPerOrder !== undefined && changes.maxPerOrder < (changes.minPerOrder ?? ticketType.minPerOrder)) {
    throw new ValidationError('maxPerOrder cannot be lower than minPerOrder');
  }

  await ticketType.update(changes);
  return ticketType;
}

export async function deleteTicketType(tenantId, id) {
  const ticketType = await TicketType.findOne({ where: { id, tenantId } });
  if (!ticketType) throw new NotFoundError('Ticket type not found');

  const issued = await Ticket.count({ where: { ticketTypeId: id, tenantId } });
  if (issued > 0) throw new ConflictError('Tickets have already been issued for this type — deactivate it instead');

  await ticketType.destroy();
  return { id };
}

export default { listTicketTypes, createTicketType, updateTicketType, deleteTicketType };
