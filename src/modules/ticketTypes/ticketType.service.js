import prisma from '../../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';
import { pick } from '../../utils/helpers.js';

const FIELDS = ['name', 'description', 'price', 'currency', 'quantity', 'minPerOrder', 'maxPerOrder', 'sortOrder', 'isActive', 'activityId'];

const assertEvent = async (tenantId, eventId) => {
  const event = await prisma.event.findFirst({
    where: { id: Number(eventId), tenantId: Number(tenantId) },
  });
  if (!event) throw new NotFoundError('Event not found');
  return event;
};

const sanitizeTicketTypeData = (payload) => {
  const data = pick(payload, FIELDS);
  if (data.price !== undefined && data.price !== null) {
    data.price = Number(data.price);
  }
  if (data.quantity !== undefined && data.quantity !== null) {
    data.quantity = Number(data.quantity);
  }
  if (data.minPerOrder !== undefined && data.minPerOrder !== null) {
    data.minPerOrder = Number(data.minPerOrder);
  }
  if (data.maxPerOrder !== undefined && data.maxPerOrder !== null) {
    data.maxPerOrder = Number(data.maxPerOrder);
  }
  if (data.sortOrder !== undefined && data.sortOrder !== null) {
    data.sortOrder = Number(data.sortOrder);
  }
  if (data.activityId !== undefined) {
    data.activityId = data.activityId ? Number(data.activityId) : null;
  }
  return data;
};

export async function listTicketTypes(tenantId, eventId) {
  const tId = Number(tenantId);
  const eId = Number(eventId);
  await assertEvent(tId, eId);
  return prisma.ticketType.findMany({
    where: { tenantId: tId, eventId: eId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createTicketType(tenantId, eventId, payload) {
  const tId = Number(tenantId);
  const eId = Number(eventId);
  await assertEvent(tId, eId);

  if (payload.maxPerOrder && payload.minPerOrder && payload.maxPerOrder < payload.minPerOrder) {
    throw new ValidationError('maxPerOrder cannot be lower than minPerOrder');
  }

  const data = sanitizeTicketTypeData(payload);

  return prisma.ticketType.create({
    data: {
      ...data,
      tenantId: tId,
      eventId: eId,
    },
  });
}

export async function updateTicketType(tenantId, id, payload) {
  const tId = Number(tenantId);
  const ttId = Number(id);
  const ticketType = await prisma.ticketType.findFirst({ where: { id: ttId, tenantId: tId } });
  if (!ticketType) throw new NotFoundError('Ticket type not found');

  const changes = sanitizeTicketTypeData(payload);

  if (changes.quantity !== undefined && changes.quantity < ticketType.soldCount) {
    throw new ConflictError(`Quantity cannot be lower than the ${ticketType.soldCount} tickets already sold`);
  }
  if (changes.maxPerOrder !== undefined && changes.maxPerOrder < (changes.minPerOrder ?? ticketType.minPerOrder)) {
    throw new ValidationError('maxPerOrder cannot be lower than minPerOrder');
  }

  return prisma.ticketType.update({
    where: { id: ticketType.id },
    data: changes,
  });
}

export async function deleteTicketType(tenantId, id) {
  const tId = Number(tenantId);
  const ttId = Number(id);
  const ticketType = await prisma.ticketType.findFirst({ where: { id: ttId, tenantId: tId } });
  if (!ticketType) throw new NotFoundError('Ticket type not found');

  const issued = await prisma.ticket.count({ where: { ticketTypeId: ttId, tenantId: tId } });
  if (issued > 0) throw new ConflictError('Tickets have already been issued for this type — deactivate it instead');

  await prisma.ticketType.delete({ where: { id: ticketType.id } });
  return { id: ttId };
}

export default { listTicketTypes, createTicketType, updateTicketType, deleteTicketType };
