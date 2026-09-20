import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

const verify = (token, secret, expectedType) => {
  const decoded = jwt.verify(token, secret);
  if (expectedType && decoded.type !== expectedType) {
    throw new UnauthorizedError('Invalid token type');
  }
  return decoded;
};

/** Verifies an access token issued to a platform or tenant user. */
export const authenticate = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError('No token provided'));
  try {
    req.user = verify(token, env.jwt.accessSecret, 'access');
    return next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};

/** Verifies a short-lived customer token issued after OTP verification. */
export const authenticateCustomer = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError('No token provided'));
  try {
    req.customer = verify(token, env.jwt.accessSecret, 'customer_access');
    return next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    return next(new UnauthorizedError('Invalid or expired customer token'));
  }
};

/** Verifies either a user or customer token (used by public-facing helpers). */
export const authenticateAny = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next(new UnauthorizedError('No token provided'));
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret);
    if (decoded.type === 'customer_access') req.customer = decoded;
    else req.user = decoded;
    return next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};

export default { authenticate, authenticateCustomer, authenticateAny };
