import prisma from '../../lib/prisma.js';
import { NotFoundError } from '../../utils/errors.js';
import { parsePagination, buildPagination } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';

export async function getDashboardStats() {
  const [
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalEvents,
    liveEvents,
    paidOrders,
    ticketsIssued,
    revenueRow,
    recentTenants,
    statusGroups,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
    prisma.event.count(),
    prisma.event.count({ where: { status: 'LIVE' } }),
    prisma.order.count({ where: { status: 'PAID' } }),
    prisma.ticket.count(),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'CAPTURED' },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, slug: true, status: true, subscriptionPlan: true, createdAt: true },
    }),
    prisma.tenant.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
  ]);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalEvents,
    liveEvents,
    paidOrders,
    ticketsIssued,
    revenue: Number(revenueRow?._sum?.amount || 0),
    recentTenants,
    tenantsByStatus: statusGroups.map((g) => ({ status: g.status, count: g._count.id })),
  };
}

export async function listTenants(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { slug: { contains: query.search } },
      { email: { contains: query.search } },
    ];
  }

  const [count, rows] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, email: true, status: true, subscriptionPlan: true, createdAt: true },
    }),
  ]);

  const withCounts = await Promise.all(
    rows.map(async (tenant) => {
      const [events, members] = await Promise.all([
        prisma.event.count({ where: { tenantId: tenant.id } }),
        prisma.tenantMember.count({ where: { tenantId: tenant.id } }),
      ]);
      return { ...tenant, eventCount: events, memberCount: members };
    }),
  );

  return { rows: withCounts, pagination: buildPagination(count, page, limit) };
}

export async function getTenant(id) {
  const tenantId = Number(id);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
        },
      },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const [events, paidOrders, ticketsIssued, revenueRow] = await Promise.all([
    prisma.event.count({ where: { tenantId } }),
    prisma.order.count({ where: { tenantId, status: 'PAID' } }),
    prisma.ticket.count({ where: { tenantId } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { tenantId, status: 'CAPTURED' },
    }),
  ]);

  return {
    tenant,
    stats: { events, paidOrders, ticketsIssued, revenue: Number(revenueRow?._sum?.amount || 0) },
  };
}

export async function changeTenantStatus(id, status, actorId, req) {
  const tenantId = Number(id);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const previous = tenant.status;
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { status },
  });

  await recordAudit({
    tenantId: updated.id,
    userId: actorId,
    action: AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
    entityType: 'tenant',
    entityId: updated.id,
    details: { from: previous, to: status },
    req,
  });

  return updated;
}

export async function listBookings(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.tenantId) where.tenantId = Number(query.tenantId);
  if (query.status) where.status = query.status;

  const [count, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        customer: { select: { id: true, name: true, email: true } },
        payments: { select: { id: true, status: true, method: true } },
        registration: {
          select: {
            id: true,
            registrationRef: true,
            quantity: true,
            status: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
    }),
  ]);

  const mappedRows = rows.map((r) => ({
    ...r,
    payment: r.payments?.[0] || null,
  }));

  return { rows: mappedRows, pagination: buildPagination(count, page, limit) };
}

export async function listPayments(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.tenantId) where.tenantId = Number(query.tenantId);
  if (query.status) where.status = query.status;

  const [count, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        order: {
          select: {
            id: true,
            orderRef: true,
            status: true,
            customer: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
  ]);

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listAuditLogs(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.tenantId) where.tenantId = Number(query.tenantId);
  if (query.search) where.action = { contains: query.search };

  const [count, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return { rows, pagination: buildPagination(count, page, limit) };
}

export default { getDashboardStats, listTenants, getTenant, changeTenantStatus, listBookings, listPayments, listAuditLogs };
