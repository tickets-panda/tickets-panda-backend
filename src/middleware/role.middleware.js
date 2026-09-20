import { ForbiddenError } from '../utils/errors.js';

/**
 * Allows the request only when req.user.role is in the allowed list.
 * Usage: authorize('TENANT_OWNER', 'TENANT_ADMIN')
 */
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ForbiddenError('Authentication required'));
  if (roles.length && !roles.includes(req.user.role)) {
    return next(new ForbiddenError('Your role cannot perform this action'));
  }
  return next();
};

export const isPlatformRole = (role) => ['PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(role);
export const isTenantRole = (role) =>
  ['TENANT_OWNER', 'TENANT_ADMIN', 'EVENT_MANAGER', 'FINANCE_VIEWER', 'CHECKIN_STAFF'].includes(role);

/** EVENT_MANAGER and CHECKIN_STAFF only act on events they are assigned to. */
export const isEventScopedRole = (role) => ['EVENT_MANAGER', 'CHECKIN_STAFF'].includes(role);

export default { authorize, isPlatformRole, isTenantRole, isEventScopedRole };
