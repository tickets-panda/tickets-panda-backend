import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors.js';
import { normaliseEmail, pick } from '../../utils/helpers.js';
import { parsePagination, buildPagination } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';

/* ----------------------------- Profile ----------------------------- */

export async function getProfile(tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: Number(tenantId) },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');
  return tenant;
}

export async function updateProfile(tenantId, payload) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: Number(tenantId) },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const changes = pick(payload, ['name', 'phone', 'logoUrl', 'websiteUrl', 'address', 'description', 'settings']);
  if (changes.settings) {
    changes.settings = { ...(tenant.settings || {}), ...changes.settings };
  }

  const updated = await prisma.tenant.update({
    where: { id: Number(tenantId) },
    data: changes,
  });
  return updated;
}

/* ----------------------------- Members ----------------------------- */

export async function listMembers(tenantId) {
  return prisma.tenantMember.findMany({
    where: { tenantId: Number(tenantId) },
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addMember(tenantId, payload, invitedBy, req) {
  const email = normaliseEmail(payload.email);

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(payload.password || `${Math.random().toString(36).slice(2)}Aa1!`, 12);
    user = await prisma.user.create({
      data: { name: payload.name, email, phone: payload.phone || null, passwordHash },
    });
  }

  const existing = await prisma.tenantMember.findUnique({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: Number(tenantId),
      },
    },
  });
  if (existing) throw new ConflictError('This user is already a member of your organization');

  const member = await prisma.tenantMember.create({
    data: {
      userId: user.id,
      tenantId: Number(tenantId),
      role: payload.role,
      assignedEvents: payload.assignedEvents || null,
      isActive: true,
      invitedBy: invitedBy ? Number(invitedBy) : null,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true },
      },
    },
  });

  await recordAudit({
    tenantId: Number(tenantId),
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
  const member = await prisma.tenantMember.findFirst({
    where: { id: Number(memberId), tenantId: Number(tenantId) },
  });
  if (!member) throw new NotFoundError('Member not found');

  const updated = await prisma.tenantMember.update({
    where: { id: member.id },
    data: pick(payload, ['role', 'assignedEvents', 'isActive']),
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true },
      },
    },
  });

  await recordAudit({
    tenantId: Number(tenantId),
    userId: actorId,
    action: AUDIT_ACTIONS.MEMBER_UPDATED,
    entityType: 'tenant_member',
    entityId: member.id,
    details: payload,
    req,
  });

  return updated;
}

export async function removeMember(tenantId, memberId, actorId, req) {
  const member = await prisma.tenantMember.findFirst({
    where: { id: Number(memberId), tenantId: Number(tenantId) },
    include: { user: true },
  });
  if (!member) throw new NotFoundError('Member not found');
  if (member.userId === actorId) throw new ForbiddenError('You cannot remove yourself');
  if (member.role === 'TENANT_OWNER') throw new ForbiddenError('The organization owner cannot be removed');

  await prisma.tenantMember.delete({ where: { id: member.id } });

  await recordAudit({
    tenantId: Number(tenantId),
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
  const tId = Number(tenantId);
  const [
    totalEvents,
    liveEvents,
    totalRegistrations,
    ticketsSold,
    checkedIn,
    revenueRow,
    recentRegistrations,
  ] = await Promise.all([
    prisma.event.count({ where: { tenantId: tId } }),
    prisma.event.count({ where: { tenantId: tId, status: 'LIVE' } }),
    prisma.registration.count({ where: { tenantId: tId, status: 'CONFIRMED' } }),
    prisma.ticket.count({ where: { tenantId: tId } }),
    prisma.checkin.count({ where: { tenantId: tId } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { tenantId: tId, status: 'CAPTURED' },
    }),
    prisma.registration.findMany({
      where: { tenantId: tId },
      include: {
        event: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true, email: true } },
        ticketType: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const upcomingEvents = await prisma.event.findMany({
    where: { tenantId: tId, status: { in: ['LIVE', 'DRAFT'] } },
    orderBy: { eventDate: 'asc' },
    take: 5,
    select: { id: true, title: true, slug: true, eventDate: true, status: true, maxCapacity: true },
  });

  return {
    totalEvents,
    liveEvents,
    totalRegistrations,
    ticketsSold,
    checkedIn,
    revenue: Number(revenueRow?._sum?.amount || 0),
    recentRegistrations,
    upcomingEvents,
  };
}

export async function getAnalytics(tenantId) {
  const tId = Number(tenantId);
  const [payments, ticketTypeBreakdown, registrations] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: tId, status: 'CAPTURED' },
      select: {
        id: true,
        amount: true,
        order: {
          select: {
            id: true,
            registration: {
              select: {
                id: true,
                event: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.ticketType.findMany({
      where: { tenantId: tId },
      select: { id: true, name: true, quantity: true, soldCount: true },
    }),
    prisma.registration.findMany({
      where: { tenantId: tId, status: 'CONFIRMED' },
      select: { id: true, createdAt: true },
    }),
  ]);

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

  // ---- Extended engagement metrics (gate flow, funnel, activity mix) ----
  const [checkins, allRegs, allOrders] = await Promise.all([
    prisma.checkin.findMany({
      where: { tenantId: tId },
      select: { checkedInAt: true, eventId: true, activityId: true, event: { select: { id: true, title: true } } },
    }),
    prisma.registration.findMany({
      where: { tenantId: tId },
      select: {
        id: true,
        status: true,
        quantity: true,
        activityId: true,
        activity: { select: { id: true, title: true } },
      },
    }),
    prisma.order.findMany({ where: { tenantId: tId }, select: { status: true } }),
  ]);

  const checkinsByDay = new Map();
  const admissionsByHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  checkins.forEach((c) => {
    const d = new Date(c.checkedInAt);
    const day = d.toISOString().slice(0, 10);
    checkinsByDay.set(day, (checkinsByDay.get(day) || 0) + 1);
    admissionsByHour[d.getHours()].count += 1;
  });

  const activityMap = new Map();
  const checkinsByActivityKey = new Map();
  checkins.forEach((c) => {
    if (c.activityId) checkinsByActivityKey.set(c.activityId, (checkinsByActivityKey.get(c.activityId) || 0) + 1);
  });
  allRegs.forEach((r) => {
    const key = r.activityId || `event-${r.id}-general`;
    const entry = activityMap.get(key) || {
      id: r.activityId,
      title: r.activity?.title || 'General Admission',
      registrations: 0,
      tickets: 0,
      checkedIn: 0,
    };
    entry.registrations += 1;
    entry.tickets += Number(r.quantity || 0);
    if (r.activityId) entry.checkedIn = checkinsByActivityKey.get(r.activityId) || 0;
    activityMap.set(key, entry);
  });

  const confirmedCount = allRegs.filter((r) => r.status === 'CONFIRMED').length;
  const paidOrders = allOrders.filter((o) => o.status === 'PAID').length;
  const funnel = {
    initiated: allRegs.length,
    confirmed: confirmedCount,
    ticketsIssued: ticketTypeBreakdown.reduce((sum, t) => sum + Number(t.soldCount || 0), 0),
    checkedIn: checkins.length,
  };

  return {
    revenueByEvent: [...revenueMap.values()].sort((a, b) => b.revenue - a.revenue),
    ticketTypeBreakdown,
    registrationsByDay: [...byDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    checkinsByDay: [...checkinsByDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    admissionsByHour,
    topActivities: [...activityMap.values()].sort((a, b) => b.tickets - a.tickets).slice(0, 10),
    funnel,
    paymentSuccessRate: allOrders.length ? Math.round((paidOrders / allOrders.length) * 100) : 0,
    avgTicketsPerOrder: confirmedCount
      ? Number((allRegs.filter((r) => r.status === 'CONFIRMED').reduce((s, r) => s + Number(r.quantity || 0), 0) / confirmedCount).toFixed(2))
      : 0,
  };
}

/* --------------------------- Listings ------------------------------ */

export async function listRegistrations(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: Number(tenantId) };
  if (query.status) where.status = query.status;
  if (query.eventId) where.eventId = Number(query.eventId);
  if (query.activityId) where.activityId = Number(query.activityId);

  if (query.search) {
    where.customer = {
      OR: [
        { name: { contains: query.search } },
        { email: { contains: query.search } },
      ],
    };
  }

  const SORTABLE = ['createdAt', 'updatedAt', 'status', 'quantity'];
  const sortBy = SORTABLE.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const sortOrder = String(query.order || 'DESC').toUpperCase() === 'ASC' ? 'asc' : 'desc';

  const [count, rows] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        event: { select: { id: true, title: true, slug: true } },
        activity: { select: { id: true, title: true, slug: true } },
        customer: { select: { id: true, name: true, email: true, phone: true } },
        ticketType: { select: { id: true, name: true, price: true } },
        orders: { select: { id: true, orderRef: true, amount: true, currency: true, status: true } },
        registrationData: {
          select: {
            fieldValue: true,
            formField: { select: { id: true, fieldName: true, fieldLabel: true } },
          },
        },
      },
    }),
  ]);

  const mappedRows = rows.map((r) => ({
    ...r,
    order: r.orders?.[0] || null,
  }));

  return { rows: mappedRows, pagination: buildPagination(count, page, limit) };
}

export async function getRegistration(tenantId, id) {
  const registration = await prisma.registration.findFirst({
    where: { id: Number(id), tenantId: Number(tenantId) },
    include: {
      event: true,
      customer: true,
      ticketType: true,
      orders: {
        include: {
          payments: true,
          tickets: true,
        },
      },
      registrationData: {
        include: {
          formField: { select: { id: true, fieldName: true, fieldLabel: true } },
        },
      },
    },
  });
  if (!registration) throw new NotFoundError('Registration not found');

  return {
    ...registration,
    order: registration.orders?.[0] || null,
    formData: registration.registrationData,
  };
}

export async function listOrders(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: Number(tenantId) };
  if (query.status) where.status = query.status;

  const [count, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        payments: { select: { id: true, status: true, method: true, razorpayPaymentId: true } },
        registration: { select: { id: true, registrationRef: true, eventId: true } },
      },
    }),
  ]);

  const mappedRows = rows.map((o) => ({
    ...o,
    payment: o.payments?.[0] || null,
  }));

  return { rows: mappedRows, pagination: buildPagination(count, page, limit) };
}

export async function listPayments(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: Number(tenantId) };
  if (query.status) where.status = query.status;

  const [count, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: { id: true, orderRef: true, status: true },
          include: { customer: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
  ]);

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listTickets(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: Number(tenantId) };
  if (query.status) where.status = query.status;
  if (query.eventId) where.eventId = Number(query.eventId);

  const [count, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketKey: true,
        tenantId: true,
        eventId: true,
        activityId: true,
        orderId: true,
        registrationId: true,
        customerId: true,
        ticketTypeId: true,
        status: true,
        pdfUrl: true,
        createdAt: true,
        updatedAt: true,
        event: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true, email: true } },
        ticketType: { select: { id: true, name: true } },
        checkins: { select: { id: true, checkedInAt: true, gateName: true } },
      },
    }),
  ]);

  const mappedRows = rows.map((t) => ({
    ...t,
    checkin: t.checkins?.[0] || null,
  }));

  return { rows: mappedRows, pagination: buildPagination(count, page, limit) };
}

export async function getTicket(tenantId, id) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: Number(id), tenantId: Number(tenantId) },
    include: {
      event: true,
      customer: true,
      ticketType: true,
      checkins: true,
    },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return {
    ...ticket,
    checkin: ticket.checkins?.[0] || null,
  };
}

export async function listCheckins(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: Number(tenantId) };
  if (query.eventId) where.eventId = Number(query.eventId);

  const [count, rows] = await Promise.all([
    prisma.checkin.count({ where }),
    prisma.checkin.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true } },
        scanner: { select: { id: true, name: true } },
        ticket: {
          select: {
            id: true,
            ticketKey: true,
            customer: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
  ]);

  const mappedRows = rows.map((c) => ({
    ...c,
    staff: c.scanner,
  }));

  return { rows: mappedRows, pagination: buildPagination(count, page, limit) };
}

export async function listAuditLogs(tenantId, query) {
  const { page, limit, offset } = parsePagination(query);
  const where = { tenantId: Number(tenantId) };
  if (query.search) {
    where.action = { contains: query.search };
  }

  const [count, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { rows, pagination: buildPagination(count, page, limit) };
}

/** Per-staff gate performance + recent actions for the scanner team view. */
export async function getStaffStats(tenantId) {
  const tId = Number(tenantId);
  const [members, checkins, rejections, recentActions] = await Promise.all([
    prisma.tenantMember.findMany({
      where: { tenantId: tId },
      include: {
        user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.checkin.findMany({
      where: { tenantId: tId },
      select: { checkedInBy: true, checkedInAt: true, gateName: true, event: { select: { id: true, title: true } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tId, action: 'CHECKIN_REJECTED' },
      select: { userId: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tId, userId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const admittedByUser = new Map();
  const lastScanByUser = new Map();
  checkins.forEach((c) => {
    if (!c.checkedInBy) return;
    admittedByUser.set(c.checkedInBy, (admittedByUser.get(c.checkedInBy) || 0) + 1);
    const at = new Date(c.checkedInAt).getTime();
    if (!lastScanByUser.get(c.checkedInBy) || at > lastScanByUser.get(c.checkedInBy)) {
      lastScanByUser.set(c.checkedInBy, at);
    }
  });
  const rejectedByUser = new Map();
  rejections.forEach((r) => {
    if (!r.userId) return;
    rejectedByUser.set(r.userId, (rejectedByUser.get(r.userId) || 0) + 1);
  });

  const staff = members.map((m) => {
    const admitted = admittedByUser.get(m.userId) || 0;
    const failed = rejectedByUser.get(m.userId) || 0;
    return {
      memberId: m.id,
      userId: m.userId,
      name: m.user?.name || null,
      email: m.user?.email || null,
      role: m.role,
      isActive: m.isActive,
      assignedEvents: Array.isArray(m.assignedEvents) ? m.assignedEvents : [],
      admitted,
      failed,
      scans: admitted + failed,
      lastScanAt: lastScanByUser.get(m.userId) ? new Date(lastScanByUser.get(m.userId)).toISOString() : null,
      lastLoginAt: m.user?.lastLoginAt || null,
    };
  });

  return {
    staff: staff.sort((a, b) => b.scans - a.scans),
    recentActions: recentActions.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      createdAt: a.createdAt,
      user: a.user,
    })),
  };
}

export default {
  getProfile,
  updateProfile,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  getDashboardStats,
  getAnalytics,
  listRegistrations,
  getRegistration,
  listOrders,
  listPayments,
  listTickets,
  getTicket,
  listCheckins,
  listAuditLogs,
  getStaffStats,
};
