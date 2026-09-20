import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Tenant, TenantMember, OtpVerification } from '../../database/models/index.js';
import { ConflictError, UnauthorizedError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { normaliseEmail } from '../../utils/helpers.js';
import { uniqueSlug, generateResetToken } from '../../utils/generators.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/tokens.js';
import { recordAudit } from '../audit/audit.service.js';
import { sendTemplateEmail } from '../notifications/notifications.service.js';
import { AUDIT_ACTIONS, PLATFORM_ROLES } from '../../utils/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const tenantIsUsable = (tenant) => tenant && !['SUSPENDED', 'INACTIVE'].includes(tenant.status);

/** Registers a new tenant with its owner user in a single transaction. */
export async function registerTenant({ name, email, password, phone, websiteUrl }, req) {
  const normalised = normaliseEmail(email);

  const existingUser = await User.findOne({ where: { email: normalised } });
  if (existingUser) throw new ConflictError('An account with this email already exists');

  const existingTenant = await Tenant.findOne({ where: { email: normalised } });
  if (existingTenant) throw new ConflictError('An organization with this email already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueSlug(name, async (candidate) => Boolean(await Tenant.findOne({ where: { slug: candidate } })));

  const result = await sequelize.transaction(async (t) => {
    const user = await User.create({ name, email: normalised, passwordHash, phone: phone || null }, { transaction: t });

    const tenant = await Tenant.create(
      {
        name,
        slug,
        email: normalised,
        phone: phone || null,
        websiteUrl: websiteUrl || null,
        status: 'PENDING_VERIFICATION',
        subscriptionPlan: 'FREE',
        settings: {},
      },
      { transaction: t },
    );

    await TenantMember.create(
      { userId: user.id, tenantId: tenant.id, role: 'TENANT_OWNER', isActive: true },
      { transaction: t },
    );

    return { user, tenant };
  });

  await sendTemplateEmail({
    template: 'welcome_tenant',
    to: normalised,
    tenantId: result.tenant.id,
    refType: 'tenant',
    refId: result.tenant.id,
    data: { name, tenantName: result.tenant.name, dashboardUrl: `${env.tenantUrl}/tenant/dashboard` },
  });

  await recordAudit({
    tenantId: result.tenant.id,
    userId: result.user.id,
    action: AUDIT_ACTIONS.TENANT_REGISTERED,
    entityType: 'tenant',
    entityId: result.tenant.id,
    details: { name, slug },
    req,
  });

  return {
    userId: result.user.id,
    tenantId: result.tenant.id,
    slug: result.tenant.slug,
    status: result.tenant.status,
  };
}

/** Authenticates a platform or tenant user and issues tokens. */
export async function login({ email, password }, req) {
  const normalised = normaliseEmail(email);
  const user = await User.findOne({ where: { email: normalised } });

  if (!user) throw new UnauthorizedError('Invalid email or password');
  if (!user.isActive) throw new UnauthorizedError('This account has been deactivated');

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw new UnauthorizedError('Invalid email or password');

  let role;
  let tenantId = null;
  let tenant = null;

  if (PLATFORM_ROLES.includes(user.role)) {
    role = user.role;
  } else {
    const membership = await TenantMember.findOne({
      where: { userId: user.id, isActive: true },
      include: [{ model: Tenant, as: 'tenant' }],
      order: [['createdAt', 'ASC']],
    });

    if (!membership) throw new UnauthorizedError('No active organization is linked to this account');
    tenant = membership.tenant;
    if (!tenantIsUsable(tenant)) throw new UnauthorizedError('This organization account is not active');

    role = membership.role;
    tenantId = membership.tenantId;
  }

  await user.update({ lastLoginAt: new Date() });

  const accessToken = signAccessToken({ id: user.id, email: user.email, role, tenantId });
  const refreshToken = signRefreshToken({ id: user.id });

  await recordAudit({
    tenantId,
    userId: user.id,
    action: AUDIT_ACTIONS.USER_LOGGED_IN,
    entityType: 'user',
    entityId: user.id,
    details: { role },
    req,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      tenantId,
      tenantName: tenant?.name || null,
      tenantSlug: tenant?.slug || null,
    },
  };
}

/** Issues a new access token from a valid refresh token. */
export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw new UnauthorizedError('No refresh token provided');

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await User.findOne({ where: { id: decoded.id } });
  if (!user || !user.isActive) throw new UnauthorizedError('Account is not available');

  let role = user.role;
  let tenantId = null;

  if (!PLATFORM_ROLES.includes(user.role)) {
    const membership = await TenantMember.findOne({
      where: { userId: user.id, isActive: true },
      include: [{ model: Tenant, as: 'tenant' }],
      order: [['createdAt', 'ASC']],
    });
    if (!membership || !tenantIsUsable(membership.tenant)) {
      throw new UnauthorizedError('This organization account is not active');
    }
    role = membership.role;
    tenantId = membership.tenantId;
  }

  return { accessToken: signAccessToken({ id: user.id, email: user.email, role, tenantId }) };
}

/** Returns the profile for the authenticated user. */
export async function getProfile(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: TenantMember, as: 'memberships', include: [{ model: Tenant, as: 'tenant' }] }],
  });
  if (!user) throw new NotFoundError('User not found');
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    memberships: (user.memberships || []).map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant?.name,
      tenantSlug: m.tenant?.slug,
      role: m.role,
      isActive: m.isActive,
    })),
  };
}

/** Emails a password-reset link. Always resolves to avoid leaking account existence. */
export async function forgotPassword(email) {
  const normalised = normaliseEmail(email);
  const user = await User.findOne({ where: { email: normalised } });
  if (!user) {
    logger.info(`Password reset requested for unknown email: ${normalised}`);
    return { sent: false };
  }

  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await OtpVerification.create({
    identifier: normalised,
    identifierType: 'EMAIL',
    otp: token,
    purpose: 'PASSWORD_RESET',
    expiresAt,
  });

  const resetUrl = `${env.tenantUrl}/reset-password?token=${token}`;
  await sendTemplateEmail({
    template: 'password_reset',
    to: normalised,
    refType: 'user',
    refId: user.id,
    data: { name: user.name, resetUrl },
  });

  return { sent: true };
}

/** Completes a password reset using a previously issued token. */
export async function resetPassword({ token, newPassword }) {
  const record = await OtpVerification.findOne({
    where: {
      otp: token,
      purpose: 'PASSWORD_RESET',
      isUsed: false,
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!record) throw new ValidationError('This reset link is invalid or has expired');

  const user = await User.findOne({ where: { email: record.identifier } });
  if (!user) throw new NotFoundError('User not found');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await user.update({ passwordHash });
  await record.update({ isUsed: true });

  return { email: user.email };
}

export default {
  registerTenant,
  login,
  refreshAccessToken,
  getProfile,
  forgotPassword,
  resetPassword,
};
