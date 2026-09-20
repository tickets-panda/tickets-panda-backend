import prisma from '../../lib/prisma.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors.js';
import { uniqueSlug } from '../../utils/generators.js';
import { pick } from '../../utils/helpers.js';
import { parsePagination, buildPagination } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';
import { isEventScopedRole } from '../../middleware/role.middleware.js';

const EVENT_FIELDS = [
  'title',
  'shortDescription',
  'description',
  'bannerUrl',
  'venueName',
  'venueAddress',
  'venueMapUrl',
  'eventDate',
  'eventTimeStart',
  'eventTimeEnd',
  'startAt',
  'endAt',
  'maxCapacity',
  'registrationDeadline',
  'registrationOpenAt',
  'registrationCloseAt',
  'rules',
  'faqJson',
  'contactJson',
  'galleryUrls',
  'settings',
  'status',
];

/** Restricts query scope for roles limited to specific events. */
const applyScope = (where, scope) => {
  if (scope && isEventScopedRole(scope.role)) {
    const ids = Array.isArray(scope.assignedEvents) ? scope.assignedEvents : [];
    where.id = { in: ids.length ? ids : [0] };
  }
  return where;
};

const sanitizeEventData = (payload) => {
  const data = pick(payload, EVENT_FIELDS);
  if (data.eventDate && typeof data.eventDate === 'string') {
    data.eventDate = new Date(data.eventDate);
  }
  if (data.startAt && typeof data.startAt === 'string') {
    data.startAt = new Date(data.startAt);
  }
  if (data.endAt && typeof data.endAt === 'string') {
    data.endAt = new Date(data.endAt);
  }
  if (data.registrationDeadline && typeof data.registrationDeadline === 'string') {
    data.registrationDeadline = new Date(data.registrationDeadline);
  }
  if (data.registrationOpenAt && typeof data.registrationOpenAt === 'string') {
    data.registrationOpenAt = new Date(data.registrationOpenAt);
  }
  if (data.registrationCloseAt && typeof data.registrationCloseAt === 'string') {
    data.registrationCloseAt = new Date(data.registrationCloseAt);
  }
  return data;
};

export async function createEvent(tenantId, userId, payload, req) {
  const tId = Number(tenantId);
  const slug = await uniqueSlug(payload.title, async (candidate) =>
    Boolean(await prisma.event.findFirst({ where: { tenantId: tId, slug: candidate } })),
  );

  const event = await prisma.event.create({
    data: {
      ...sanitizeEventData(payload),
      slug,
      tenantId: tId,
      createdBy: userId ? Number(userId) : null,
      status: payload.status || 'DRAFT',
    },
  });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.EVENT_CREATED,
    entityType: 'event',
    entityId: event.id,
    details: { title: event.title, slug },
    req,
  });

  return event;
}

export async function listEvents(tenantId, query, scope) {
  const { page, limit, offset } = parsePagination(query);
  const tId = Number(tenantId);
  const where = applyScope({ tenantId: tId }, scope);
  if (query.status) where.status = query.status;
  if (query.search) where.title = { contains: query.search };

  const [count, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        ticketTypes: {
          select: { id: true, name: true, price: true, quantity: true, soldCount: true, isActive: true },
        },
        registrations: {
          select: { id: true, quantity: true, status: true },
        },
      },
    }),
  ]);

  const withCounts = rows.map((row) => {
    const confirmed = (row.registrations || []).filter((r) => r.status === 'CONFIRMED');
    return {
      ...row,
      stats: {
        confirmedRegistrations: confirmed.length,
        ticketsSold: confirmed.reduce((sum, r) => sum + r.quantity, 0),
      },
      registrations: undefined,
    };
  });

  return { rows: withCounts, pagination: buildPagination(count, page, limit) };
}

export async function getEvent(tenantId, id, scope, { withChildren = true } = {}) {
  const tId = Number(tenantId);
  const eventId = Number(id);
  const where = applyScope({ id: eventId, tenantId: tId }, scope);

  const include = withChildren
    ? {
        activities: {
          orderBy: { sortOrder: 'asc' },
          include: { ticketTypes: { orderBy: { sortOrder: 'asc' } } },
        },
        ticketTypes: { orderBy: { sortOrder: 'asc' } },
        registrationForms: { orderBy: { sortOrder: 'asc' } },
      }
    : undefined;

  const event = await prisma.event.findFirst({ where, include });
  if (!event) throw new NotFoundError('Event not found');

  const [confirmedRegistrations, ticketsSold, checkedIn] = await Promise.all([
    prisma.registration.count({ where: { eventId: event.id, tenantId: tId, status: 'CONFIRMED' } }),
    prisma.ticket.count({ where: { eventId: event.id, tenantId: tId } }),
    prisma.checkin.count({ where: { eventId: event.id, tenantId: tId } }),
  ]);

  const eventObj = {
    ...event,
    formFields: event.registrationForms || [],
  };

  return { event: eventObj, stats: { confirmedRegistrations, ticketsSold, checkedIn } };
}

export async function updateEvent(tenantId, id, payload, userId, req, scope) {
  const tId = Number(tenantId);
  const eventId = Number(id);
  const where = applyScope({ id: eventId, tenantId: tId }, scope);
  const event = await prisma.event.findFirst({ where });
  if (!event) throw new NotFoundError('Event not found');

  const changes = sanitizeEventData(payload);
  if (changes.title && changes.title !== event.title) {
    changes.slug = await uniqueSlug(changes.title, async (candidate) =>
      Boolean(await prisma.event.findFirst({ where: { tenantId: tId, slug: candidate, id: { not: eventId } } })),
    );
  }
  if (changes.settings) {
    changes.settings = { ...(event.settings || {}), ...changes.settings };
  }

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: changes,
  });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.EVENT_UPDATED,
    entityType: 'event',
    entityId: event.id,
    details: Object.keys(changes),
    req,
  });

  return updated;
}

export async function changeEventStatus(tenantId, id, status, userId, req, scope) {
  const tId = Number(tenantId);
  const eventId = Number(id);
  const where = applyScope({ id: eventId, tenantId: tId }, scope);
  const event = await prisma.event.findFirst({ where });
  if (!event) throw new NotFoundError('Event not found');

  if (status === 'LIVE') {
    const ticketTypeCount = await prisma.ticketType.count({ where: { eventId: event.id, isActive: true } });
    if (!ticketTypeCount) throw new ConflictError('Add at least one active ticket type before publishing');
  }

  const previousStatus = event.status;
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { status },
  });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.EVENT_STATUS_CHANGED,
    entityType: 'event',
    entityId: event.id,
    details: { from: previousStatus, to: status },
    req,
  });

  return updated;
}

export async function deleteEvent(tenantId, id, userId, req) {
  const tId = Number(tenantId);
  const eventId = Number(id);
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: tId } });
  if (!event) throw new NotFoundError('Event not found');

  const confirmed = await prisma.registration.count({ where: { eventId, tenantId: tId, status: 'CONFIRMED' } });
  if (confirmed > 0) throw new ConflictError('This event has confirmed bookings — cancel it instead of deleting');

  await prisma.event.delete({ where: { id: event.id } });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.EVENT_DELETED,
    entityType: 'event',
    entityId: eventId,
    details: { title: event.title },
    req,
  });

  return { id: eventId };
}

export async function assertEventInTenant(tenantId, eventId) {
  const event = await prisma.event.findFirst({
    where: { id: Number(eventId), tenantId: Number(tenantId) },
  });
  if (!event) throw new NotFoundError('Event not found');
  return event;
}

export { ForbiddenError };
