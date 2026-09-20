import { Op } from 'sequelize';
import {
  Tenant,
  Event,
  Activity,
  TicketType,
  RegistrationForm,
  Registration,
  Checkin,
} from '../../database/models/index.js';
import { NotFoundError } from '../../utils/errors.js';
import { resolveVerificationToken } from '../customers/customer.service.js';

const tenantIsPublic = (tenant) => tenant && tenant.status === 'ACTIVE';

const remainingFor = (ticketType) => Math.max(0, ticketType.quantity - ticketType.soldCount);

/** Public tenant profile shown on the tenant's event landing page. */
export async function getTenantBySlug(slug) {
  const tenant = await Tenant.findOne({
    where: { slug, status: { [Op.ne]: 'INACTIVE' } },
    attributes: ['id', 'name', 'slug', 'logoUrl', 'websiteUrl', 'description', 'address', 'settings', 'status'],
  });
  if (!tenant || !tenantIsPublic(tenant)) throw new NotFoundError('This organizer page is not available');
  return tenant;
}

/** Live events for a tenant. */
export async function listTenantEvents(slug) {
  const tenant = await getTenantBySlug(slug);

  const events = await Event.findAll({
    where: { tenantId: tenant.id, status: 'LIVE' },
    attributes: ['id', 'title', 'slug', 'description', 'bannerUrl', 'venueName', 'venueAddress', 'eventDate', 'eventTimeStart', 'eventTimeEnd', 'maxCapacity'],
    include: [{ model: TicketType, as: 'ticketTypes', where: { isActive: true }, required: false, attributes: ['id', 'name', 'price', 'currency', 'quantity', 'soldCount', 'minPerOrder', 'maxPerOrder'] }],
    order: [['eventDate', 'ASC']],
  });

  return {
    tenant,
    events: events.map((event) => {
      const plain = event.toJSON();
      const ticketTypes = (plain.ticketTypes || []).map((t) => ({ ...t, remaining: remainingFor(t) }));
      return {
        ...plain,
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

  const event = await Event.findOne({
    where: { tenantId: tenant.id, slug: eventSlug, status: 'LIVE' },
    include: [
      { model: TicketType, as: 'ticketTypes', where: { isActive: true }, required: false },
      { model: RegistrationForm, as: 'formFields' },
      {
        model: Activity,
        as: 'activities',
        where: { status: 'PUBLISHED' },
        required: false,
        include: [
          { model: TicketType, as: 'ticketTypes', where: { isActive: true }, required: false },
        ],
      },
    ],
  });

  if (!event) throw new NotFoundError('Event not found or not open for registration');

  const plain = event.toJSON();
  const ticketTypes = (plain.ticketTypes || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ ...t, remaining: remainingFor(t) }));

  const activities = (plain.activities || [])
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

  const formFields = (plain.formFields || [])
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

  const [confirmedRegistrations, checkedIn] = await Promise.all([
    Registration.count({ where: { eventId: event.id, tenantId: tenant.id, status: 'CONFIRMED' } }),
    Checkin.count({ where: { eventId: event.id, tenantId: tenant.id } }),
  ]);

  const seatsClaimed = await Registration.sum('quantity', {
    where: { eventId: event.id, tenantId: tenant.id, status: 'CONFIRMED' },
  });

  const registrationOpen =
    !event.registrationDeadline || new Date(event.registrationDeadline) > new Date();

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
      seatsClaimed: seatsClaimed || 0,
      checkedIn,
      maxCapacity: event.maxCapacity,
      seatsRemaining: event.maxCapacity ? Math.max(0, event.maxCapacity - (seatsClaimed || 0)) : null,
    },
  };
}

/** Public activity detail with ticket types and form. */
export async function getPublicActivity(tenantSlug, eventSlug, activitySlug) {
  const tenant = await getTenantBySlug(tenantSlug);

  const event = await Event.findOne({
    where: { tenantId: tenant.id, slug: eventSlug, status: 'LIVE' },
    attributes: ['id', 'title', 'slug', 'eventDate', 'eventTimeStart', 'venueName'],
  });
  if (!event) throw new NotFoundError('Event not found or not open');

  const activity = await Activity.findOne({
    where: { eventId: event.id, tenantId: tenant.id, slug: activitySlug, status: 'PUBLISHED' },
    include: [
      { model: TicketType, as: 'ticketTypes', where: { isActive: true }, required: false },
      { model: RegistrationForm, as: 'formFields', separate: true, order: [['sortOrder', 'ASC']] },
    ],
  });
  if (!activity) throw new NotFoundError('Activity not found or not open for registration');

  const plain = activity.toJSON();
  const ticketTypes = (plain.ticketTypes || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ ...t, remaining: remainingFor(t) }));

  const formFields = (plain.formFields || [])
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

export default { getTenantBySlug, listTenantEvents, getPublicEvent, getPublicActivity, getPublicForm, resolveVerificationToken };
