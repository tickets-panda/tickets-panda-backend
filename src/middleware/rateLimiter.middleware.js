import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const build = (max, windowMs = env.rateLimit.windowMs, message = 'Too many requests, please try again later.') =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ success: false, message, errors: null });
    },
  });

export const globalRateLimiter = build(env.rateLimit.max);
export const authRateLimiter = build(10);
export const otpRateLimiter = build(5);
export const bookingRateLimiter = build(30);
export const staffRateLimiter = build(30);
export const publicRateLimiter = build(100);
export const tenantRateLimiter = build(100);
export const platformRateLimiter = build(100);

export default {
  globalRateLimiter,
  authRateLimiter,
  otpRateLimiter,
  bookingRateLimiter,
  staffRateLimiter,
  publicRateLimiter,
  tenantRateLimiter,
  platformRateLimiter,
};
