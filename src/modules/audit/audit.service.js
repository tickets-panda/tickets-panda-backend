import prisma from '../../lib/prisma.js';
import { logger } from '../../utils/logger.js';

const clientIp = (req) =>
  req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || req?.socket?.remoteAddress || null;

/**
 * Writes an audit log entry. Never throws — auditing must not break a request.
 */
export async function recordAudit({ tenantId = null, userId = null, action, entityType, entityId = null, details = null, req = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: tenantId ? Number(tenantId) : null,
        userId: userId ? Number(userId) : null,
        action,
        entityType,
        entityId: entityId ? Number(entityId) : null,
        details: details || undefined,
        ipAddress: req ? clientIp(req) : null,
        userAgent: req?.headers?.['user-agent']?.slice(0, 255) || null,
      },
    });
  } catch (err) {
    logger.error(`Failed to write audit log (${action}): ${err.message}`);
  }
}

export default { recordAudit };
