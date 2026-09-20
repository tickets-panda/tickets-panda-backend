import prisma from '../../lib/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { resolveVerificationToken } from '../customers/customer.service.js';

const tenantIsPublic = (tenant) => tenant && tenant.status === 'ACTIVE';

const remainingFor = (ticketType) => Math.max(0, ticketType.quantity - ticketType.soldCount);

/** Public tenant profile shown on the tenant's event landing page. */
export async function getTenantBySlug(slug) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      websiteUrl: true,
      description: true,
      address: true,
      settings: true,
      status: true,
    },
  });
  if (!tenant || !tenantIsPublic(tenant)) throw new NotFoundError('This organizer page is not available');
  return tenant;
}

/** Live events for a tenant. */
export async function listTenantEvents(slug) {
  const tenant = await getTenantBySlug(slug);

  const events = await prisma.event.findMany({
    where: { tenantId: tenant.id, status: 'LIVE' },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      bannerUrl: true,
      venueName: true,
      venueAddress: true,
      eventDate: true,
      eventTimeStart: true,
      eventTimeEnd: true,
      maxCapacity: true,
      ticketTypes: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          currency: true,
          quantity: true,
          soldCount: true,
          minPerOrder: true,
          maxPerOrder: true,
        },
      },
    },
    orderBy: { eventDate: 'asc' },
  });

  return {
    tenant,
    events: events.map((event) => {
      const ticketTypes = (event.ticketTypes || []).map((t) => ({ ...t, remaining: remainingFor(t) }));
      return {
        ...event,
        ticketTypes,
        priceFrom: ticketTypes.length ? Math.min(...ticketTypes.map((t) => Number(t.price))) : null,
        soldOut: ticketTypes.length > 0 && ticketTypes.every((t) => t.remaining === 0),
      };
    }),
  };
}

/** Full public event detail including activities, ticket availability and the registration form. */
export async function getPublicEvent(slug, eventSlug) {
  const tenant = await getTenantBySlug(slug);

  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug, status: 'LIVE' },
    include: {
      ticketTypes: { where: { isActive: true } },
      registrationForms: true,
      activities: {
        where: { status: 'PUBLISHED' },
        include: {
          ticketTypes: { where: { isActive: true } },
        },
      },
    },
  });

  if (!event) throw new NotFoundError('Event not found or not open for registration');

  const ticketTypes = (event.ticketTypes || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ ...t, remaining: remainingFor(t) }));

  const activities = (event.activities || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((act) => ({
      id: act.id,
      title: act.title,
      slug: act.slug,
      shortDescription: act.shortDescription,
      description: act.description,
      posterUrl: act.posterUrl,
      rules: act.rules,
      eligibility: act.eligibility,
      startsAt: act.startsAt,
      endsAt: act.endsAt,
      venue: act.venue,
      capacity: act.capacity,
      ticketTypes: (act.ticketTypes || [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({ ...t, remaining: remainingFor(t) })),
    }));

  const formFields = (event.registrationForms || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({
      id: f.id,
      fieldName: f.fieldName,
      fieldLabel: f.fieldLabel,
      fieldType: f.fieldType,
      options: f.options,
      isRequired: f.isRequired,
      placeholder: f.placeholder,
      helpText: f.helpText,
      fileConfig: f.fileConfig,
    }));

  const [confirmedRegistrations, checkedIn, claimedAgg] = await Promise.all([
    prisma.registration.count({ where: { eventId: event.id, tenantId: tenant.id, status: 'CONFIRMED' } }),
    prisma.checkin.count({ where: { eventId: event.id, tenantId: tenant.id } }),
    prisma.registration.aggregate({
      _sum: { quantity: true },
      where: { eventId: event.id, tenantId: tenant.id, status: 'CONFIRMED' },
    }),
  ]);

  const seatsClaimed = Number(claimedAgg._sum.quantity || 0);
  const registrationOpen = !event.registrationDeadline || new Date(event.registrationDeadline) > new Date();

  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl },
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      shortDescription: event.shortDescription,
      bannerUrl: event.bannerUrl,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      venueMapUrl: event.venueMapUrl,
      eventDate: event.eventDate,
      eventTimeStart: event.eventTimeStart,
      eventTimeEnd: event.eventTimeEnd,
      startAt: event.startAt,
      endAt: event.endAt,
      rules: event.rules,
      faqJson: event.faqJson,
      contactJson: event.contactJson,
      galleryUrls: event.galleryUrls,
      registrationDeadline: event.registrationDeadline,
      registrationOpenAt: event.registrationOpenAt,
      registrationCloseAt: event.registrationCloseAt,
      settings: event.settings,
      registrationOpen,
    },
    activities,
    ticketTypes,
    formFields,
    stats: {
      confirmedRegistrations,
      seatsClaimed,
      checkedIn,
      maxCapacity: event.maxCapacity,
      seatsRemaining: event.maxCapacity ? Math.max(0, event.maxCapacity - seatsClaimed) : null,
    },
  };
}

/** Public activity detail with ticket types and form. */
export async function getPublicActivity(tenantSlug, eventSlug, activitySlug) {
  const tenant = await getTenantBySlug(tenantSlug);

  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: eventSlug, status: 'LIVE' },
    select: { id: true, title: true, slug: true, eventDate: true, eventTimeStart: true, venueName: true },
  });
  if (!event) throw new NotFoundError('Event not found or not open');

  const activity = await prisma.activity.findFirst({
    where: { eventId: event.id, tenantId: tenant.id, slug: activitySlug, status: 'PUBLISHED' },
    include: {
      ticketTypes: { where: { isActive: true } },
      formFields: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!activity) throw new NotFoundError('Activity not found or not open for registration');

  const ticketTypes = (activity.ticketTypes || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ ...t, remaining: remainingFor(t) }));

  const formFields = (activity.formFields || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({
      id: f.id,
      fieldName: f.fieldName,
      fieldLabel: f.fieldLabel,
      fieldType: f.fieldType,
      options: f.options,
      isRequired: f.isRequired,
      placeholder: f.placeholder,
      helpText: f.helpText,
      fileConfig: f.fileConfig,
    }));

  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl },
    event: { id: event.id, title: event.title, slug: event.slug },
    activity: {
      id: activity.id,
      title: activity.title,
      slug: activity.slug,
      shortDescription: activity.shortDescription,
      description: activity.description,
      posterUrl: activity.posterUrl,
      rules: activity.rules,
      eligibility: activity.eligibility,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      venue: activity.venue,
      capacity: activity.capacity,
    },
    ticketTypes,
    formFields,
  };
}

/** Form fields only (used to render the registration wizard). */
export async function getPublicForm(slug, eventSlug) {
  const { formFields } = await getPublicEvent(slug, eventSlug);
  return formFields;
}

/** Lists all live public events across all active tenants. */
export async function listAllPublicEvents({ search, limit = 50 } = {}) {
  const where = {
    status: 'LIVE',
    tenant: { status: 'ACTIVE' },
  };
  if (search) {
    where.title = { contains: search };
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      tenant: {
        select: { id: true, name: true, slug: true, logoUrl: true },
      },
      ticketTypes: {
        where: { isActive: true },
        select: { id: true, name: true, price: true, currency: true, quantity: true, soldCount: true },
      },
      activities: {
        where: { status: 'PUBLISHED' },
        select: { id: true, title: true, slug: true, capacity: true },
      },
    },
    orderBy: { eventDate: 'asc' },
    take: Math.min(Number(limit) || 50, 100),
  });

  return events.map((event) => {
    const ticketTypes = (event.ticketTypes || []).map((t) => ({ ...t, remaining: remainingFor(t) }));
    return {
      ...event,
      ticketTypes,
      priceFrom: ticketTypes.length ? Math.min(...ticketTypes.map((t) => Number(t.price))) : null,
      soldOut: ticketTypes.length > 0 && ticketTypes.every((t) => t.remaining === 0),
    };
  });
}

export default {
  getTenantBySlug,
  listTenantEvents,
  listAllPublicEvents,
  getPublicEvent,
  getPublicActivity,
  getPublicForm,
  resolveVerificationToken,
};
