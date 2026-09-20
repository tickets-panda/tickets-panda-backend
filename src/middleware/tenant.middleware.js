import { Tenant, TenantMember } from '../database/models/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { catchAsync } from '../utils/helpers.js';
import { isEventScopedRole } from './role.middleware.js';

/**
 * Resolves the caller's tenant from the JWT, verifies it is usable, and exposes
 * req.tenantId / req.tenant / req.membership for downstream queries.
 */
export const attachTenant = catchAsync(async (req, res, next) => {
  if (!req.user?.tenantId) throw new ForbiddenError('No tenant context for this user');

  const tenant = await Tenant.findByPk(req.user.tenantId);
  if (!tenant) throw new UnauthorizedError('Tenant no longer exists');
  if (['SUSPENDED', 'INACTIVE'].includes(tenant.status)) {
    throw new ForbiddenError('This tenant account is not active');
  }

  const membership = await TenantMember.findOne({
    where: { userId: req.user.id, tenantId: tenant.id, isActive: true },
  });
  if (!membership) throw new ForbiddenError('You are not an active member of this tenant');

  req.tenant = tenant;
  req.tenantId = tenant.id;
  req.membership = membership;
  req.assignedEvents = Array.isArray(membership.assignedEvents) ? membership.assignedEvents : [];
  next();
});

/**
 * Blocks event-scoped roles from touching events they are not assigned to.
 * Reads the event id from req.params.eventId or req.params.id (when on an event route).
 */
export const enforceEventScope = (paramName = 'id') =>
  catchAsync(async (req, res, next) => {
    if (!req.user || !isEventScopedRole(req.user.role)) return next();
    const raw = req.params[paramName] ?? req.body?.eventId;
    const eventId = Number(raw);
    if (!eventId) return next(new ForbiddenError('Event assignment required'));
    if (!req.assignedEvents.includes(eventId)) {
      return next(new ForbiddenError('You are not assigned to this event'));
    }
    return next();
  });

export default { attachTenant, enforceEventScope };
