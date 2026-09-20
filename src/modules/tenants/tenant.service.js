import bcrypt from 'bcryptjs';
import { Op, fn, col } from 'sequelize';
import {
  Tenant,
  TenantMember,
  User,
  Event,
  TicketType,
  Registration,
  RegistrationData,
  RegistrationForm,
  Order,
  Payment,
  Ticket,
  Checkin,
  Customer,
  AuditLog,
} from '../../database/models/index.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors.js';
import { normaliseEmail, pick } from '../../utils/helpers.js';
import { parsePagination, buildPagination } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';

const scopedWhere = (tenantId, extra = {}) => ({ tenantId, ...extra });

/* ----------------------------- Profile ----------------------------- */

export async function getProfile(tenantId) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new NotFoundError('Tenant not found');
  return tenant;
}

export async function updateProfile(tenantId, payload) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new NotFoundError('Tenant not found');

  const changes = pick(payload, ['name', 'phone', 'logoUrl', 'websiteUrl', 'address', 'description', 'settings']);
  if (changes.settings) changes.settings = { ...(tenant.settings || {}), ...changes.settings };
  await tenant.update(changes);
  return tenant;
}

/* ----------------------------- Members ----------------------------- */

export async function listMembers(tenantId) {
  return TenantMember.findAll({
    where: { tenantId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'isActive', 'lastLoginAt'] }],
    order: [['createdAt', 'ASC']],
  });
}

export async function addMember(tenantId, payload, invitedBy, req) {
  const email = normaliseEmail(payload.email);

  let user = await User.findOne({ where: { email } });
  if (!user) {
    // A random unusable hash is stored — the member resets their password to sign in.
    const passwordHash = await bcrypt.hash(payload.password || `${Math.random().toString(36).slice(2)}Aa1!`, 12);
    user = await User.create({ name: payload.name, email, phone: payload.phone || null, passwordHash });
  }

  const existing = await TenantMember.findOne({ where: { userId: user.id, tenantId } });
  if (existing) throw new ConflictError('This user is already a member of your organization');

  const member = await TenantMember.create({
    userId: user.id,
    tenantId,
    role: payload.role,
    assignedEvents: payload.assignedEvents || null,
    isActive: true,
    invitedBy,
  });

  await recordAudit({
    tenantId,
    userId: invitedBy,
    action: AUDIT_ACTIONS.MEMBER_ADDED,
    entityType: 'tenant_member',
    entityId: member.id,
    details: { email, role: payload.role },
    req,
  });

  return member;
}

export async function updateMember(tenantId, memberId, payload, actorId, req) {
  const member = await TenantMember.findOne({ where: { id: memberId, tenantId } });
  if (!member) throw new NotFoundError('Member not found');

  await member.update(pick(payload, ['role', 'assignedEvents', 'isActive']));

  await recordAudit({
    tenantId,
    userId: actorId,
    action: AUDIT_ACTIONS.MEMBER_UPDATED,
    entityType: 'tenant_member',
    entityId: member.id,
    details: payload,
    req,
  });

  return member;
}

export async function removeMember(tenantId, memberId, actorId, req) {
  const member = await TenantMember.findOne({ where: { id: memberId, tenantId }, include: [{ model: User, as: 'user' }] });
  if (!member) throw new NotFoundError('Member not found');
  if (member.userId === actorId) throw new ForbiddenError('You cannot remove yourself');
  if (member.role === 'TENANT_OWNER') throw new ForbiddenError('The organization owner cannot be removed');

  await member.destroy();

  await recordAudit({
    tenantId,
    userId: actorId,
    action: AUDIT_ACTIONS.MEMBER_REMOVED,
    entityType: 'tenant_member',
    entityId: memberId,
    details: { email: member.user?.email },
    req,
  });

  return { id: memberId };
}

/* --------------------------- Dashboard ----------------------------- */

export async function getDashboardStats(tenantId) {
  const [
    totalEvents,
    liveEvents,
    totalRegistrations,
    ticketsSold,
    checkedIn,
    revenueRow,
    recentRegistrations,
  ] = await Promise.all([
    Event.count({ where: { tenantId } }),
    Event.count({ where: { tenantId, status: 'LIVE' } }),
    Registration.count({ where: { tenantId, status: 'CONFIRMED' } }),
    Ticket.count({ where: { tenantId } }),
    Checkin.count({ where: { tenantId } }),
    Payment.findOne({
      where: { tenantId, status: 'CAPTURED' },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
    Registration.findAll({
      where: { tenantId },
      include: [
        { model: Event, as: 'event', attributes: ['id', 'title'] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
        { model: TicketType, as: 'ticketType', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 5,
    }),
  ]);

  const upcomingEvents = await Event.findAll({
    where: { tenantId, status: { [Op.in]: ['LIVE', 'DRAFT'] } },
    order: [['eventDate', 'ASC']],
    limit: 5,
    attributes: ['id', 'title', 'slug', 'eventDate', 'status', 'maxCapacity'],
  });

  return {
    totalEvents,
    liveEvents,
    totalRegistrations,
    ticketsSold,
    checkedIn,
    revenue: Number(revenueRow?.total || 0),
    recentRegistrations,
    upcomingEvents,
  };
}

export async function getAnalytics(tenantId) {
  const [payments, ticketTypeBreakdown, registrations] = await Promise.all([
    Payment.findAll({
      where: { tenantId, status: 'CAPTURED' },
      attributes: ['id', 'amount'],
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['id'],
          include: [
            {
              model: Registration,
              as: 'registration',
              attributes: ['id'],
              include: [{ model: Event, as: 'event', attributes: ['id', 'title'] }],
            },
          ],
        },
      ],
    }),
    TicketType.findAll({ where: { tenantId }, attributes: ['id', 'name', 'quantity', 'soldCount'], raw: true }),
    Registration.findAll({ where: { tenantId, status: 'CONFIRMED' }, attributes: ['id', 'createdAt'], raw: true }),
  ]);

  // Aggregate in JS — simpler and safer than nested SQL grouping for MVP volumes.
  const revenueMap = new Map();
  payments.forEach((payment) => {
    const event = payment.order?.registration?.event;
    if (!event) return;
    const entry = revenueMap.get(event.id) || { eventId: event.id, eventTitle: event.title, revenue: 0 };
    entry.revenue += Number(payment.amount || 0);
    revenueMap.set(event.id, entry);
  });

  const byDay = new Map();
  registrations.forEach((registration) => {
    const day = new Date(registration.createdAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  });

  return {
    revenueByEvent: [...revenueMap.values()].sort((a, b) => b.revenue - a.revenue),
    ticketTypeBreakdown,
    registrationsByDay: [...byDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/* --------------------------- Listings ------------------------------ */

export async function listRegistrations(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = scopedWhere(tenantId);
  if (query.status) where.status = query.status;
  if (query.eventId) where.eventId = Number(query.eventId);

  const include = [
    { model: Event, as: 'event', attributes: ['id', 'title', 'slug'] },
    { model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
    { model: TicketType, as: 'ticketType', attributes: ['id', 'name', 'price'] },
    { model: Order, as: 'order', attributes: ['id', 'orderRef', 'amount', 'currency', 'status'] },
  ];

  if (query.search) {
    include[1].where = {
      [Op.or]: [
        { name: { [Op.like]: `%${query.search}%` } },
        { email: { [Op.like]: `%${query.search}%` } },
      ],
    };
    include[1].required = true;
  }

  const SORTABLE = ['createdAt', 'updatedAt', 'status', 'quantity'];
  const sortBy = SORTABLE.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = String(query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { rows, count } = await Registration.findAndCountAll({
    where,
    include,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function getRegistration(tenantId, id) {
  const registration = await Registration.findOne({
    where: { id, tenantId },
    include: [
      { model: Event, as: 'event' },
      { model: Customer, as: 'customer' },
      { model: TicketType, as: 'ticketType' },
      { model: Order, as: 'order', include: [{ model: Payment, as: 'payment' }, { model: Ticket, as: 'tickets' }] },
      {
        model: RegistrationData,
        as: 'formData',
        include: [{ model: RegistrationForm, as: 'formField', attributes: ['id', 'fieldName', 'fieldLabel'] }],
      },
    ],
  });
  if (!registration) throw new NotFoundError('Registration not found');
  return registration;
}

export async function listOrders(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = scopedWhere(tenantId);
  if (query.status) where.status = query.status;

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: Payment, as: 'payment', attributes: ['id', 'status', 'method', 'razorpayPaymentId'] },
      { model: Registration, as: 'registration', attributes: ['id', 'registrationRef', 'eventId'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listPayments(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = scopedWhere(tenantId);
  if (query.status) where.status = query.status;

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [{ model: Order, as: 'order', attributes: ['id', 'orderRef', 'status'], include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] }] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listTickets(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = scopedWhere(tenantId);
  if (query.status) where.status = query.status;
  if (query.eventId) where.eventId = Number(query.eventId);

  const { rows, count } = await Ticket.findAndCountAll({
    where,
    attributes: { exclude: ['verificationToken', 'qrData'] },
    include: [
      { model: Event, as: 'event', attributes: ['id', 'title'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: TicketType, as: 'ticketType', attributes: ['id', 'name'] },
      { model: Checkin, as: 'checkin', attributes: ['id', 'checkedInAt', 'gateName'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function getTicket(tenantId, id) {
  const ticket = await Ticket.findOne({
    where: { id, tenantId },
    include: [
      { model: Event, as: 'event' },
      { model: Customer, as: 'customer' },
      { model: TicketType, as: 'ticketType' },
      { model: Checkin, as: 'checkin' },
    ],
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  return ticket;
}

export async function listCheckins(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = scopedWhere(tenantId);
  if (query.eventId) where.eventId = Number(query.eventId);

  const { rows, count } = await Checkin.findAndCountAll({
    where,
    include: [
      { model: Event, as: 'event', attributes: ['id', 'title'] },
      { model: User, as: 'staff', attributes: ['id', 'name'] },
      { model: Ticket, as: 'ticket', attributes: ['id', 'ticketKey'], include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] }] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listAuditLogs(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = scopedWhere(tenantId);
  if (query.search) where.action = { [Op.like]: `%${query.search}%` };

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

