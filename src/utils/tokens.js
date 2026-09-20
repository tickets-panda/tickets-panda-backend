import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId ?? null,
      type: 'access',
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiry },
  );

export const signRefreshToken = (user) =>
  jwt.sign({ id: user.id, type: 'refresh' }, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiry });

export const signCustomerToken = (customer) =>
  jwt.sign(
    { id: customer.id, email: customer.email, role: 'CUSTOMER', tenantId: null, type: 'customer_access' },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.customerExpiry },
  );

export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  maxAge: env.cookie.maxAge,
  path: '/',
});

export default {
  signAccessToken,
  signRefreshToken,
  signCustomerToken,
  verifyRefreshToken,
  refreshCookieOptions,
};
