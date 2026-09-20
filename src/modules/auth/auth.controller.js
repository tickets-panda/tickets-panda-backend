import * as authService from './auth.service.js';
import { success, created } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';
import { refreshCookieOptions } from '../../utils/tokens.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';

const setRefreshCookie = (res, token) => {
  res.cookie(env.cookie.refreshName, token, refreshCookieOptions());
};

export const registerTenant = async (req, res) => {
  const data = await authService.registerTenant(req.body, req);
  return created(res, data, 'Organization registered successfully');
};

export const login = async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.login(req.body, req);
  setRefreshCookie(res, refreshToken);
  return success(res, { accessToken, user }, 'Logged in successfully');
};

export const refreshToken = async (req, res) => {
  const token = req.cookies?.[env.cookie.refreshName];
  const { accessToken } = await authService.refreshAccessToken(token);
  return success(res, { accessToken }, 'Token refreshed');
};

export const logout = async (req, res) => {
  res.clearCookie(env.cookie.refreshName, { ...refreshCookieOptions(), maxAge: undefined });
  if (req.user) {
    await recordAudit({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: AUDIT_ACTIONS.USER_LOGGED_OUT,
      entityType: 'user',
      entityId: req.user.id,
      req,
    });
  }
  return success(res, null, 'Logged out successfully');
};

export const forgotPassword = async (req, res) => {
  await authService.forgotPassword(req.body.email);
  return success(res, null, 'If an account exists for that email, a reset link has been sent');
};

export const resetPassword = async (req, res) => {
  const data = await authService.resetPassword(req.body);
  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    entityType: 'user',
    details: { email: data.email },
    req,
  });
  return success(res, null, 'Password reset successfully');
};

export const me = async (req, res) => {
  const data = await authService.getProfile(req.user.id);
  return success(res, { user: data, token: { role: req.user.role, tenantId: req.user.tenantId } });
};

export default { registerTenant, login, refreshToken, logout, forgotPassword, resetPassword, me };
