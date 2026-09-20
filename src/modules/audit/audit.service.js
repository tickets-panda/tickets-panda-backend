import { AuditLog } from '../../database/models/index.js';
import { logger } from '../../utils/logger.js';

const clientIp = (req) =>
  req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || req?.socket?.remoteAddress || null;

/**
 * Writes an audit log entry. Never throws — auditing must not break a request.
 */
export async function recordAudit({ tenantId = null, userId = null, action, entityType, entityId = null, details = null, req = null }) {
  try {
    await AuditLog.create({
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      details: details || null,
      ipAddress: req ? clientIp(req) : null,
      userAgent: req?.headers?.['user-agent']?.slice(0, 500) || null,
    });
  } catch (err) {
    logger.error(`Failed to write audit log (${action}): ${err.message}`);
  }
}

export default { recordAudit };
