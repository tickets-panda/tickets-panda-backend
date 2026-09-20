import Razorpay from 'razorpay';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let client = null;

if (env.razorpay.configured) {
  client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
} else {
  logger.warn('Razorpay is not configured — payment endpoints will fail until RAZORPAY_KEY_ID/SECRET are set.');
}

export const getRazorpay = () => {
  if (!client) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return client;
};

export const isRazorpayConfigured = () => Boolean(client);

export default { getRazorpay, isRazorpayConfigured };
