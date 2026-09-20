import { Op } from 'sequelize';
import {
  Event,
  Activity,
  TicketType,
  RegistrationForm,
  Registration,
  Checkin,
  Ticket,
} from '../../database/models/index.js';
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
    where.id = { [Op.in]: ids.length ? ids : [0] };
  }
  return where;
};

export async function createEvent(tenantId, userId, payload, req) {
  const slug = await uniqueSlug(payload.title, async (candidate) =>
    Boolean(await Event.findOne({ where: { tenantId, slug: candidate } })),
  );

  const event = await Event.create({
    ...pick(payload, EVENT_FIELDS),
    slug,
    tenantId,
    createdBy: userId,
    status: payload.status || 'DRAFT',
  });

  await recordAudit({
    tenantId,
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
  const where = applyScope({ tenantId }, scope);
  if (query.status) where.status = query.status;
  if (query.search) where.title = { [Op.like]: `%${query.search}%` };

  const { rows, count } = await Event.findAndCountAll({
    where,
    include: [
      { model: TicketType, as: 'ticketTypes', attributes: ['id', 'name', 'price', 'quantity', 'soldCount', 'isActive'] },
      {
        model: Registration,
        as: 'registrations',
        attributes: ['id', 'quantity', 'status'],
        required: false,
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  const withCounts = rows.map((row) => {
    const plain = row.toJSON();
    const confirmed = (plain.registrations || []).filter((r) => r.status === 'CONFIRMED');
    return {
      ...plain,
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
  const where = applyScope({ id, tenantId }, scope);
  const include = withChildren
    ? [
        { model: Activity, as: 'activities', separate: true, order: [['sortOrder', 'ASC']],
          include: [{ model: TicketType, as: 'ticketTypes', separate: true, order: [['sortOrder', 'ASC']] }],
        },
        { model: TicketType, as: 'ticketTypes', separate: true, order: [['sortOrder', 'ASC']] },
        { model: RegistrationForm, as: 'formFields', separate: true, order: [['sortOrder', 'ASC']] },
      ]
    : [];

  const event = await Event.findOne({ where, include });
  if (!event) throw new NotFoundError('Event not found');

  const [confirmedRegistrations, ticketsSold, checkedIn] = await Promise.all([
    Registration.count({ where: { eventId: event.id, tenantId, status: 'CONFIRMED' } }),
    Ticket.count({ where: { eventId: event.id, tenantId } }),
    Checkin.count({ where: { eventId: event.id, tenantId } }),
  ]);

  return { event, stats: { confirmedRegistrations, ticketsSold, checkedIn } };
}

export async function updateEvent(tenantId, id, payload, userId, req, scope) {
  const where = applyScope({ id, tenantId }, scope);
  const event = await Event.findOne({ where });
  if (!event) throw new NotFoundError('Event not found');

  const changes = pick(payload, EVENT_FIELDS);
  if (changes.title && changes.title !== event.title) {
    changes.slug = await uniqueSlug(changes.title, async (candidate) =>
      Boolean(await Event.findOne({ where: { tenantId, slug: candidate, id: { [Op.ne]: id } } })),
    );
  }
  if (changes.settings) changes.settings = { ...(event.settings || {}), ...changes.settings };

  await event.update(changes);

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.EVENT_UPDATED,
    entityType: 'event',
    entityId: event.id,
    details: Object.keys(changes),
    req,
  });

  return event;
}

export async function changeEventStatus(tenantId, id, status, userId, req, scope) {
  const where = applyScope({ id, tenantId }, scope);
  const event = await Event.findOne({ where });
  if (!event) throw new NotFoundError('Event not found');

  if (status === 'LIVE') {
    const ticketTypeCount = await TicketType.count({ where: { eventId: event.id, isActive: true } });
    if (!ticketTypeCount) throw new ConflictError('Add at least one active ticket type before publishing');
  }

  await event.update({ status });

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.EVENT_STATUS_CHANGED,
    entityType: 'event',
    entityId: event.id,
    details: { from: event.previous('status'), to: status },
    req,
  });

  return event;
}

export async function deleteEvent(tenantId, id, userId, req) {
  const event = await Event.findOne({ where: { id, tenantId } });
  if (!event) throw new NotFoundError('Event not found');

  const confirmed = await Registration.count({ where: { eventId: id, tenantId, status: 'CONFIRMED' } });
  if (confirmed > 0) throw new ConflictError('This event has confirmed bookings — cancel it instead of deleting');

  await event.destroy();

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.EVENT_DELETED,
    entityType: 'event',
    entityId: id,
    details: { title: event.title },
    req,
  });

  return { id };
}

export async function assertEventInTenant(tenantId, eventId) {
  const event = await Event.findOne({ where: { id: eventId, tenantId } });
  if (!event) throw new NotFoundError('Event not found');
  return event;
}

export { ForbiddenError };
