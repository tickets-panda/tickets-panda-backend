import { sequelize, Ticket, Checkin, Event, Activity, TicketType, Customer, Order } from '../../database/models/index.js';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../utils/errors.js';
import { parsePagination, buildPagination } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';
import { isEventScopedRole } from '../../middleware/role.middleware.js';

/** Extracts a token from a scanned URL such as https://app/verify/<token>. */
const normaliseToken = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
};

const ticketInclude = [
  { model: Event, as: 'event', attributes: ['id', 'title', 'eventDate', 'eventTimeStart', 'venueName'] },
  { model: Activity, as: 'activity', attributes: ['id', 'title', 'slug', 'venue', 'startsAt'] },
  { model: TicketType, as: 'ticketType', attributes: ['id', 'name'] },
  { model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
  { model: Checkin, as: 'checkin', attributes: ['id', 'checkedInAt', 'gateName'] },
  { model: Order, as: 'order', attributes: ['id', 'orderRef'] },
];

/** Resolves a ticket by key or verification token, scoped to the staff member's tenant. */
async function resolveTicket(tenantId, { ticketKey, verificationToken, token }) {
  const where = { tenantId };
  if (ticketKey) where.ticketKey = String(ticketKey).trim().toUpperCase();
  else if (verificationToken) where.verificationToken = normaliseToken(verificationToken);
  else if (token) where.verificationToken = normaliseToken(token);
  else throw new ValidationError('Provide a ticket key or a scanned QR token');

  const ticket = await Ticket.findOne({ where, include: ticketInclude });
  return ticket;
}

const assertEventAccess = (user, assignedEvents, eventId) => {
  if (isEventScopedRole(user.role) && Array.isArray(assignedEvents) && assignedEvents.length && !assignedEvents.includes(Number(eventId))) {
    throw new ForbiddenError('You are not assigned to this event');
  }
};

function describe(ticket) {
  const plain = ticket.toJSON();
  const base = {
    ticketKey: plain.ticketKey,
    status: plain.status,
    holder: plain.customer ? { name: plain.customer.name, email: plain.customer.email } : null,
    ticketType: plain.ticketType?.name || null,
    event: plain.event,
    activity: plain.activity ? { id: plain.activity.id, title: plain.activity.title, slug: plain.activity.slug } : null,
    order: plain.order?.orderRef || null,
    checkedInAt: plain.checkin?.checkedInAt || null,
    gateName: plain.checkin?.gateName || null,
  };

  if (plain.status === 'ACTIVE') return { valid: true, result: 'VALID', ...base };
  if (plain.status === 'USED') return { valid: false, result: 'ALREADY_USED', ...base };
  return { valid: false, result: plain.status, ...base };
}

/** Read-only verification (scan preview) — never mutates state. */
export async function verifyTicket(user, assignedEvents, payload, req) {
  const ticket = await resolveTicket(user.tenantId, payload);

  if (!ticket) {
    await recordAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: AUDIT_ACTIONS.CHECKIN_REJECTED,
      entityType: 'ticket',
      details: { reason: 'NOT_FOUND', provided: payload.ticketKey || payload.verificationToken || payload.token },
      req,
    });
    return { valid: false, result: 'NOT_FOUND', message: 'No ticket found for those details' };
  }

  assertEventAccess(user, assignedEvents, ticket.eventId);
  if (payload.eventId && Number(payload.eventId) !== ticket.eventId) {
    throw new ValidationError('This ticket belongs to a different event');
  }
  if (payload.activityId && ticket.activityId && Number(payload.activityId) !== ticket.activityId) {
    throw new ValidationError('This ticket belongs to a different activity');
  }

  const described = describe(ticket);

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: AUDIT_ACTIONS.TICKET_VERIFIED,
    entityType: 'ticket',
    entityId: ticket.id,
    details: { result: described.result },
    req,
  });

  return described;
}

/** Marks a ticket as used and records the gate entry. */
export async function checkIn(user, assignedEvents, payload, req) {
  const preview = await verifyTicket(user, assignedEvents, payload, req);

  if (!preview.valid) {
    if (preview.result === 'ALREADY_USED') {
      throw new ConflictError(`This ticket was already used at ${preview.checkedInAt ? new Date(preview.checkedInAt).toISOString() : 'an earlier time'}`);
    }
    throw new NotFoundError(preview.message || 'Ticket is not valid for entry');
  }

  const ticket = await Ticket.findOne({ where: { tenantId: user.tenantId, ticketKey: preview.ticketKey } });

  const checkin = await sequelize.transaction(async (t) => {
    // Re-lock the ticket so two scanners cannot both check it in.
    const locked = await Ticket.findByPk(ticket.id, { lock: t.LOCK.UPDATE, transaction: t });
    if (locked.status !== 'ACTIVE') throw new ConflictError('This ticket has already been checked in');

    await locked.update({ status: 'USED' }, { transaction: t });
    return Checkin.create(
      {
        ticketId: locked.id,
        tenantId: locked.tenantId,
        eventId: locked.eventId,
        activityId: locked.activityId || null,
        checkedInBy: user.id,
        gateName: payload.gateName || null,
        checkedInAt: new Date(),
      },
      { transaction: t },
    );
  });

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: AUDIT_ACTIONS.TICKET_CHECKED_IN,
    entityType: 'ticket',
    entityId: ticket.id,
    details: { gateName: payload.gateName || null },
    req,
  });

  // Spread the preview first so the check-in result overrides its VALID result.
  return {
    ...preview,
    valid: true,
    result: 'CHECKED_IN',
    status: 'USED',
    checkedInAt: checkin.checkedInAt,
    gateName: checkin.gateName,
  };
}

/** Live gate statistics for an event. */
export async function gateStats(user, assignedEvents, eventId) {
  assertEventAccess(user, assignedEvents, eventId);

  const event = await Event.findOne({ where: { id: eventId, tenantId: user.tenantId } });
  if (!event) throw new NotFoundError('Event not found');

  const totalTickets = await Ticket.count({ where: { tenantId: user.tenantId, eventId } });
  const checkedIn = await Checkin.count({ where: { tenantId: user.tenantId, eventId } });

  const ticketTypes = await TicketType.findAll({
    where: { tenantId: user.tenantId, eventId },
    attributes: ['id', 'name', 'quantity'],
    raw: true,
  });

  const byTicketType = await Promise.all(
    ticketTypes.map(async (type) => {
      const [total, entered] = await Promise.all([
        Ticket.count({ where: { tenantId: user.tenantId, eventId, ticketTypeId: type.id } }),
        Checkin.count({
          where: { tenantId: user.tenantId, eventId },
          include: [{ model: Ticket, as: 'ticket', where: { ticketTypeId: type.id }, attributes: [] }],
        }),
      ]);
      return { name: type.name, total, checkedIn: entered };
    }),
  );

  const recent = await Checkin.findAll({
    where: { tenantId: user.tenantId, eventId },
    include: [
      { model: Ticket, as: 'ticket', attributes: ['ticketKey'], include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }] },
    ],
    order: [['checkedInAt', 'DESC']],
    limit: 10,
  });

  return {
    eventTitle: event.title,
    totalTickets,
    checkedIn,
    remaining: Math.max(0, totalTickets - checkedIn),
    percentEntered: totalTickets ? Number(((checkedIn / totalTickets) * 100).toFixed(1)) : 0,
    byTicketType,
    recentCheckins: recent.map((c) => ({
      name: c.ticket?.customer?.name || 'Guest',
      ticketKey: c.ticket?.ticketKey,
      time: c.checkedInAt,
      gate: c.gateName,
    })),
  };
}

/** Paginated check-in list for a single event (tenant-facing). */
export async function eventCheckins(tenantId, eventId, query) {
  const { page, limit, offset } = parsePagination(query);
  const { rows, count } = await Checkin.findAndCountAll({
    where: { tenantId, eventId },
    include: [{ model: Ticket, as: 'ticket', attributes: ['id', 'ticketKey'] }],
    order: [['checkedInAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  return { rows, pagination: buildPagination(count, page, limit) };
}

export default { verifyTicket, checkIn, gateStats, eventCheckins };
