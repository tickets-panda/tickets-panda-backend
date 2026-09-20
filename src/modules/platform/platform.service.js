import { Op, fn, col } from 'sequelize';
import {
  Tenant,
  TenantMember,
  User,
  Event,
  Order,
  Payment,
  Ticket,
  Registration,
  Customer,
  AuditLog,
} from '../../database/models/index.js';
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
    tenantsByStatus,
  ] = await Promise.all([
    Tenant.count(),
    Tenant.count({ where: { status: 'ACTIVE' } }),
    Tenant.count({ where: { status: 'SUSPENDED' } }),
    Event.count(),
    Event.count({ where: { status: 'LIVE' } }),
    Order.count({ where: { status: 'PAID' } }),
    Ticket.count(),
    Payment.findOne({
      where: { status: 'CAPTURED' },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
    Tenant.findAll({ order: [['createdAt', 'DESC']], limit: 5, attributes: ['id', 'name', 'slug', 'status', 'subscriptionPlan', 'createdAt'] }),
    Tenant.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count']], group: ['status'], raw: true }),
  ]);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalEvents,
    liveEvents,
    paidOrders,
    ticketsIssued,
    revenue: Number(revenueRow?.total || 0),
    recentTenants,
    tenantsByStatus: tenantsByStatus.map((t) => ({ status: t.status, count: Number(t.count) })),
  };
}

export async function listTenants(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${query.search}%` } },
      { slug: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
    ];
  }

  const { rows, count } = await Tenant.findAndCountAll({
    where,
    attributes: ['id', 'name', 'slug', 'email', 'status', 'subscriptionPlan', 'createdAt'],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  const withCounts = await Promise.all(
    rows.map(async (tenant) => {
      const [events, members] = await Promise.all([
        Event.count({ where: { tenantId: tenant.id } }),
        TenantMember.count({ where: { tenantId: tenant.id } }),
      ]);
      return { ...tenant.toJSON(), eventCount: events, memberCount: members };
    }),
  );

  return { rows: withCounts, pagination: buildPagination(count, page, limit) };
}

export async function getTenant(id) {
  const tenant = await Tenant.findByPk(id, {
    include: [{ model: TenantMember, as: 'members', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'lastLoginAt'] }] }],
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const [events, paidOrders, ticketsIssued, revenueRow] = await Promise.all([
    Event.count({ where: { tenantId: id } }),
    Order.count({ where: { tenantId: id, status: 'PAID' } }),
    Ticket.count({ where: { tenantId: id } }),
    Payment.findOne({
      where: { tenantId: id, status: 'CAPTURED' },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
  ]);

  return {
    tenant,
    stats: { events, paidOrders, ticketsIssued, revenue: Number(revenueRow?.total || 0) },
  };
}

export async function changeTenantStatus(id, status, actorId, req) {
  const tenant = await Tenant.findByPk(id);
  if (!tenant) throw new NotFoundError('Tenant not found');

  const previous = tenant.status;
  await tenant.update({ status });

  await recordAudit({
    tenantId: tenant.id,
    userId: actorId,
    action: AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
    entityType: 'tenant',
    entityId: tenant.id,
    details: { from: previous, to: status },
    req,
  });

  return tenant;
}

export async function listBookings(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.tenantId) where.tenantId = Number(query.tenantId);
  if (query.status) where.status = query.status;

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: Payment, as: 'payment', attributes: ['id', 'status', 'method'] },
      { model: Registration, as: 'registration', attributes: ['id', 'registrationRef', 'quantity', 'status'], include: [{ model: Event, as: 'event', attributes: ['id', 'title'] }] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listPayments(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.tenantId) where.tenantId = Number(query.tenantId);
  if (query.status) where.status = query.status;

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [
      { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'] },
      { model: Order, as: 'order', attributes: ['id', 'orderRef', 'status'], include: [{ model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] }] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export async function listAuditLogs(query) {
  const { page, limit, offset } = parsePagination(query);
  const where = {};
  if (query.tenantId) where.tenantId = Number(query.tenantId);
  if (query.search) where.action = { [Op.like]: `%${query.search}%` };

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return { rows, pagination: buildPagination(count, page, limit) };
}

export default { getDashboardStats, listTenants, getTenant, changeTenantStatus, listBookings, listPayments, listAuditLogs };
