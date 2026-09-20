import { Op } from 'sequelize';
import {
  Activity,
  Event,
  TicketType,
  Registration,
  Ticket,
  Checkin,
} from '../../database/models/index.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';
import { uniqueSlug } from '../../utils/generators.js';
import { pick } from '../../utils/helpers.js';
import { parsePagination, buildPagination } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';
import { assertEventInTenant } from '../events/events.service.js';

const ACTIVITY_FIELDS = [
  'title',
  'shortDescription',
  'description',
  'posterUrl',
  'rules',
  'eligibility',
  'startsAt',
  'endsAt',
  'venue',
  'capacity',
  'status',
  'sortOrder',
];

export async function createActivity(tenantId, eventId, userId, payload, req) {
  await assertEventInTenant(tenantId, eventId);

  const slug = await uniqueSlug(payload.title, async (candidate) =>
    Boolean(await Activity.findOne({ where: { eventId, slug: candidate } })),
  );

  const activity = await Activity.create({
    ...pick(payload, ACTIVITY_FIELDS),
    slug,
    tenantId,
    eventId,
    status: payload.status || 'DRAFT',
  });

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_CREATED,
    entityType: 'activity',
    entityId: activity.id,
    details: { title: activity.title, slug, eventId },
    req,
  });

  return activity;
}

export async function listActivities(tenantId, eventId, query) {
  await assertEventInTenant(tenantId, eventId);

  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId, eventId };
  if (query.status) where.status = query.status;
  if (query.search) where.title = { [Op.like]: `%${query.search}%` };

  const { rows, count } = await Activity.findAndCountAll({
    where,
    include: [
      { model: TicketType, as: 'ticketTypes', attributes: ['id', 'name', 'price', 'quantity', 'soldCount', 'isActive'] },
    ],
    order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function getActivity(tenantId, activityId) {
  const activity = await Activity.findOne({
    where: { id: activityId, tenantId },
    include: [
      { model: Event, as: 'event', attributes: ['id', 'title', 'slug', 'status'] },
      { model: TicketType, as: 'ticketTypes', separate: true, order: [['sortOrder', 'ASC']] },
    ],
  });
  if (!activity) throw new NotFoundError('Activity not found');

  const [confirmedRegistrations, ticketsSold, checkedIn] = await Promise.all([
    Registration.count({ where: { activityId: activity.id, tenantId, status: 'CONFIRMED' } }),
    Ticket.count({ where: { activityId: activity.id, tenantId } }),
    Checkin.count({ where: { activityId: activity.id, tenantId } }),
  ]);

  return { activity, stats: { confirmedRegistrations, ticketsSold, checkedIn } };
}

export async function updateActivity(tenantId, activityId, payload, userId, req) {
  const activity = await Activity.findOne({ where: { id: activityId, tenantId } });
  if (!activity) throw new NotFoundError('Activity not found');

  const changes = pick(payload, ACTIVITY_FIELDS);
  if (changes.title && changes.title !== activity.title) {
    changes.slug = await uniqueSlug(changes.title, async (candidate) =>
      Boolean(await Activity.findOne({ where: { eventId: activity.eventId, slug: candidate, id: { [Op.ne]: activityId } } })),
    );
  }

  await activity.update(changes);

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_UPDATED,
    entityType: 'activity',
    entityId: activity.id,
    details: Object.keys(changes),
    req,
  });

  return activity;
}

export async function changeActivityStatus(tenantId, activityId, status, userId, req) {
  const activity = await Activity.findOne({ where: { id: activityId, tenantId } });
  if (!activity) throw new NotFoundError('Activity not found');

  if (status === 'PUBLISHED') {
    const ticketTypeCount = await TicketType.count({ where: { activityId: activity.id, isActive: true } });
    if (!ticketTypeCount) throw new ConflictError('Add at least one active ticket type before publishing');
  }

  const previousStatus = activity.status;
  await activity.update({ status });

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_STATUS_CHANGED,
    entityType: 'activity',
    entityId: activity.id,
    details: { from: previousStatus, to: status },
    req,
  });

  return activity;
}

export async function deleteActivity(tenantId, activityId, userId, req) {
  const activity = await Activity.findOne({ where: { id: activityId, tenantId } });
  if (!activity) throw new NotFoundError('Activity not found');

  const confirmed = await Registration.count({ where: { activityId, tenantId, status: 'CONFIRMED' } });
  if (confirmed > 0) throw new ConflictError('This activity has confirmed bookings — cancel it instead of deleting');

  await activity.destroy();

  await recordAudit({
    tenantId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_DELETED,
    entityType: 'activity',
    entityId: activityId,
    details: { title: activity.title },
    req,
  });

  return { id: activityId };
}

export async function assertActivityInTenant(tenantId, activityId) {
  const activity = await Activity.findOne({ where: { id: activityId, tenantId } });
  if (!activity) throw new NotFoundError('Activity not found');
  return activity;
}

export default {
  createActivity,
  listActivities,
  getActivity,
  updateActivity,
  changeActivityStatus,
  deleteActivity,
  assertActivityInTenant,
};
