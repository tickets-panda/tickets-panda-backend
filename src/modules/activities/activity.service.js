import prisma from '../../lib/prisma.js';
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

const sanitizeActivityData = (payload) => {
  const data = pick(payload, ACTIVITY_FIELDS);
  if (data.startsAt && typeof data.startsAt === 'string') {
    data.startsAt = new Date(data.startsAt);
  }
  if (data.endsAt && typeof data.endsAt === 'string') {
    data.endsAt = new Date(data.endsAt);
  }
  if (data.capacity !== undefined && data.capacity !== null) {
    data.capacity = Number(data.capacity);
  }
  if (data.sortOrder !== undefined && data.sortOrder !== null) {
    data.sortOrder = Number(data.sortOrder);
  }
  return data;
};

export async function createActivity(tenantId, eventId, userId, payload, req) {
  const tId = Number(tenantId);
  const eId = Number(eventId);
  await assertEventInTenant(tId, eId);

  const slug = await uniqueSlug(payload.title, async (candidate) =>
    Boolean(await prisma.activity.findFirst({ where: { eventId: eId, slug: candidate } })),
  );

  const activity = await prisma.activity.create({
    data: {
      ...sanitizeActivityData(payload),
      slug,
      tenantId: tId,
      eventId: eId,
      status: payload.status || 'DRAFT',
    },
  });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_CREATED,
    entityType: 'activity',
    entityId: activity.id,
    details: { title: activity.title, slug, eventId: eId },
    req,
  });

  return activity;
}

export async function listActivities(tenantId, eventId, query) {
  const tId = Number(tenantId);
  const eId = Number(eventId);
  await assertEventInTenant(tId, eId);

  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: tId, eventId: eId };
  if (query.status) where.status = query.status;
  if (query.search) where.title = { contains: query.search };

  const [count, rows] = await Promise.all([
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        ticketTypes: {
          select: { id: true, name: true, price: true, quantity: true, soldCount: true, isActive: true },
        },
      },
    }),
  ]);

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function getActivity(tenantId, activityId) {
  const tId = Number(tenantId);
  const aId = Number(activityId);
  const activity = await prisma.activity.findFirst({
    where: { id: aId, tenantId: tId },
    include: {
      event: { select: { id: true, title: true, slug: true, status: true } },
      ticketTypes: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!activity) throw new NotFoundError('Activity not found');

  const [confirmedRegistrations, ticketsSold, checkedIn] = await Promise.all([
    prisma.registration.count({ where: { activityId: activity.id, tenantId: tId, status: 'CONFIRMED' } }),
    prisma.ticket.count({ where: { activityId: activity.id, tenantId: tId } }),
    prisma.checkin.count({ where: { activityId: activity.id, tenantId: tId } }),
  ]);

  return { activity, stats: { confirmedRegistrations, ticketsSold, checkedIn } };
}

export async function updateActivity(tenantId, activityId, payload, userId, req) {
  const tId = Number(tenantId);
  const aId = Number(activityId);
  const activity = await prisma.activity.findFirst({ where: { id: aId, tenantId: tId } });
  if (!activity) throw new NotFoundError('Activity not found');

  const changes = sanitizeActivityData(payload);
  if (changes.title && changes.title !== activity.title) {
    changes.slug = await uniqueSlug(changes.title, async (candidate) =>
      Boolean(await prisma.activity.findFirst({ where: { eventId: activity.eventId, slug: candidate, id: { not: aId } } })),
    );
  }

  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: changes,
  });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_UPDATED,
    entityType: 'activity',
    entityId: activity.id,
    details: Object.keys(changes),
    req,
  });

  return updated;
}

export async function changeActivityStatus(tenantId, activityId, status, userId, req) {
  const tId = Number(tenantId);
  const aId = Number(activityId);
  const activity = await prisma.activity.findFirst({ where: { id: aId, tenantId: tId } });
  if (!activity) throw new NotFoundError('Activity not found');

  if (status === 'PUBLISHED') {
    const ticketTypeCount = await prisma.ticketType.count({ where: { activityId: activity.id, isActive: true } });
    if (!ticketTypeCount) throw new ConflictError('Add at least one active ticket type before publishing');
  }

  const previousStatus = activity.status;
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { status },
  });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_STATUS_CHANGED,
    entityType: 'activity',
    entityId: activity.id,
    details: { from: previousStatus, to: status },
    req,
  });

  return updated;
}

export async function deleteActivity(tenantId, activityId, userId, req) {
  const tId = Number(tenantId);
  const aId = Number(activityId);
  const activity = await prisma.activity.findFirst({ where: { id: aId, tenantId: tId } });
  if (!activity) throw new NotFoundError('Activity not found');

  const confirmed = await prisma.registration.count({ where: { activityId: aId, tenantId: tId, status: 'CONFIRMED' } });
  if (confirmed > 0) throw new ConflictError('This activity has confirmed bookings — cancel it instead of deleting');

  await prisma.activity.delete({ where: { id: activity.id } });

  await recordAudit({
    tenantId: tId,
    userId,
    action: AUDIT_ACTIONS.ACTIVITY_DELETED,
    entityType: 'activity',
    entityId: aId,
    details: { title: activity.title },
    req,
  });

  return { id: aId };
}

export async function assertActivityInTenant(tenantId, activityId) {
  const activity = await prisma.activity.findFirst({
    where: { id: Number(activityId), tenantId: Number(tenantId) },
  });
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
