import crypto from 'crypto';

/**
 * Verifies a Razorpay checkout signature.
 * body = razorpay_order_id + "|" + razorpay_payment_id
 */
export const verifyRazorpaySignature = (orderId, paymentId, signature, secret) => {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Verifies an incoming Razorpay webhook payload.
 * The signature is computed over the raw request body.
 */
export const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export default { verifyRazorpaySignature, verifyWebhookSignature };
