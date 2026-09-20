import prisma from '../../lib/prisma.js';
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

const ticketInclude = {
  event: { select: { id: true, title: true, eventDate: true, eventTimeStart: true, venueName: true } },
  activity: { select: { id: true, title: true, slug: true, venue: true, startsAt: true } },
  ticketType: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  checkins: { select: { id: true, checkedInAt: true, gateName: true } },
  order: { select: { id: true, orderRef: true } },
};

/** Resolves a ticket by key or verification token, scoped to the staff member's tenant. */
async function resolveTicket(tenantId, { ticketKey, verificationToken, token }) {
  const tId = Number(tenantId);
  const where = { tenantId: tId };
  if (ticketKey) where.ticketKey = String(ticketKey).trim().toUpperCase();
  else if (verificationToken) where.verificationToken = normaliseToken(verificationToken);
  else if (token) where.verificationToken = normaliseToken(token);
  else throw new ValidationError('Provide a ticket key or a scanned QR token');

  const ticket = await prisma.ticket.findFirst({ where, include: ticketInclude });
  if (!ticket) return null;

  return {
    ...ticket,
    checkin: ticket.checkins?.[0] || null,
  };
}

const assertEventAccess = (user, assignedEvents, eventId) => {
  if (isEventScopedRole(user.role) && Array.isArray(assignedEvents) && assignedEvents.length && !assignedEvents.includes(Number(eventId))) {
    throw new ForbiddenError('You are not assigned to this event');
  }
};

function describe(ticket) {
  const base = {
    ticketKey: ticket.ticketKey,
    status: ticket.status,
    holder: ticket.customer ? { name: ticket.customer.name, email: ticket.customer.email } : null,
    ticketType: ticket.ticketType?.name || null,
    event: ticket.event,
    activity: ticket.activity ? { id: ticket.activity.id, title: ticket.activity.title, slug: ticket.activity.slug } : null,
    order: ticket.order?.orderRef || null,
    checkedInAt: ticket.checkin?.checkedInAt || null,
    gateName: ticket.checkin?.gateName || null,
  };

  if (ticket.status === 'ACTIVE') return { valid: true, result: 'VALID', ...base };
  if (ticket.status === 'USED') return { valid: false, result: 'ALREADY_USED', ...base };
  return { valid: false, result: ticket.status, ...base };
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

  const ticket = await prisma.ticket.findFirst({
    where: { tenantId: Number(user.tenantId), ticketKey: preview.ticketKey },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');

  const checkin = await prisma.$transaction(async (tx) => {
    // Re-lock the ticket in MySQL so two scanners cannot both check it in.
    const [locked] = await tx.$queryRaw`SELECT * FROM tickets WHERE id = ${ticket.id} FOR UPDATE`;
    if (!locked) throw new NotFoundError('Ticket not found');
    if (locked.status !== 'ACTIVE') throw new ConflictError('This ticket has already been checked in');

    await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED' },
    });

    return tx.checkin.create({
      data: {
        ticketId: ticket.id,
        tenantId: ticket.tenantId,
        eventId: ticket.eventId,
        activityId: ticket.activityId || null,
        checkedInBy: user.id ? Number(user.id) : null,
        gateName: payload.gateName || null,
        checkedInAt: new Date(),
      },
    });
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
  const tId = Number(user.tenantId);
  const eId = Number(eventId);
  assertEventAccess(user, assignedEvents, eId);

  const event = await prisma.event.findFirst({ where: { id: eId, tenantId: tId } });
  if (!event) throw new NotFoundError('Event not found');

  const [totalTickets, checkedIn, ticketTypes] = await Promise.all([
    prisma.ticket.count({ where: { tenantId: tId, eventId: eId } }),
    prisma.checkin.count({ where: { tenantId: tId, eventId: eId } }),
    prisma.ticketType.findMany({
      where: { tenantId: tId, eventId: eId },
      select: { id: true, name: true, quantity: true },
    }),
  ]);

  const byTicketType = await Promise.all(
    ticketTypes.map(async (type) => {
      const [total, entered] = await Promise.all([
        prisma.ticket.count({ where: { tenantId: tId, eventId: eId, ticketTypeId: type.id } }),
        prisma.checkin.count({
          where: {
            tenantId: tId,
            eventId: eId,
            ticket: { ticketTypeId: type.id },
          },
        }),
      ]);
      return { name: type.name, total, checkedIn: entered };
    }),
  );

  const recent = await prisma.checkin.findMany({
    where: { tenantId: tId, eventId: eId },
    include: {
      ticket: {
        select: {
          ticketKey: true,
          customer: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { checkedInAt: 'desc' },
    take: 10,
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
  const tId = Number(tenantId);
  const eId = Number(eventId);
  const { page, limit, offset } = parsePagination(query);

  const [count, rows] = await Promise.all([
    prisma.checkin.count({ where: { tenantId: tId, eventId: eId } }),
    prisma.checkin.findMany({
      where: { tenantId: tId, eventId: eId },
      skip: offset,
      take: limit,
      orderBy: { checkedInAt: 'desc' },
      include: {
        ticket: { select: { id: true, ticketKey: true } },
      },
    }),
  ]);

  return { rows, pagination: buildPagination(count, page, limit) };
}

export default { verifyTicket, checkIn, gateStats, eventCheckins };
