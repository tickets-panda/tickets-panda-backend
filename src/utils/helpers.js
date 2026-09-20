import { generateRegistrationRef } from './generators.js';

/** Wraps async route handlers so rejections reach the error middleware. */
export const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Case-insensitive contains filter value for Prisma. */
export const likeFilter = (value) => ({ contains: value });

/** Normalises an email for lookups / de-duplication. */
export const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

export const normalisePhone = (phone) => (phone ? String(phone).replace(/[^\d+]/g, '') : null);

/** Returns a copy of the object containing only the allowed keys that are defined. */
export const pick = (source, keys) =>
  keys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

export { generateRegistrationRef };

export default { catchAsync, likeFilter, normaliseEmail, normalisePhone, pick, generateRegistrationRef };
