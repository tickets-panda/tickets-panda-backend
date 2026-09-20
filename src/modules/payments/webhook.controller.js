import { WebhookEvent, Payment, Order, Registration, Customer } from '../../database/models/index.js';
import { verifyWebhookSignature } from '../../utils/verifySignature.js';
import { finalisePaidOrder } from '../booking/booking.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

async function handleCaptured(entity) {
  const payment = await Payment.findOne({ where: { razorpayOrderId: entity.order_id } });
  if (!payment) {
    logger.warn(`Webhook: no payment record for Razorpay order ${entity.order_id}`);
    return;
  }

  const order = await Order.findByPk(payment.orderId, {
    include: [
      { model: Payment, as: 'payment' },
      { model: Registration, as: 'registration' },
      { model: Customer, as: 'customer' },
    ],
  });
  if (!order) return;

  // Idempotent — finalisePaidOrder returns early if the order is already PAID.
  await finalisePaidOrder({
    order,
    payment: order.payment,
    razorpayPaymentId: entity.id,
    method: entity.method || null,
    source: 'webhook',
  });
}

async function handleFailed(entity) {
  const payment = await Payment.findOne({ where: { razorpayOrderId: entity.order_id } });
  if (!payment) return;
  if (payment.status === 'CAPTURED') return; // never downgrade a captured payment

  await payment.update({
    razorpayPaymentId: entity.id,
    status: 'FAILED',
    failedReason: entity.error_description || entity.error_code || 'Payment failed at gateway',
  });

  const order = await Order.findByPk(payment.orderId);
  if (order && ['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
    await order.update({ status: 'FAILED' });
  }
}

/**
 * POST /webhooks/razorpay
 * Always responds 200 for handled events so Razorpay does not retry forever.
 */
export const razorpayWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

  const valid = verifyWebhookSignature(raw, signature, env.razorpay.webhookSecret);
  if (!valid) {
    logger.warn('Rejected Razorpay webhook: invalid signature');
    return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
  }

  const body = req.body || {};
  const eventType = body.event || 'unknown';
  const entity = body.payload?.payment?.entity || null;

  const record = await WebhookEvent.create({ provider: 'razorpay', eventType, payload: body, processed: false });

  try {
    if (['payment.captured', 'order.paid'].includes(eventType) && entity) {
      await handleCaptured(entity);
    } else if (eventType === 'payment.failed' && entity) {
      await handleFailed(entity);
    }
    await record.update({ processed: true, processedAt: new Date(), processingResult: 'ok' });
  } catch (err) {
    logger.error(`Razorpay webhook (${eventType}) processing error: ${err.message}`);
    await record.update({ processed: false, processedAt: new Date(), processingResult: err.message });
  }

  return res.status(200).json({ success: true, message: 'Webhook received' });
};

export default { razorpayWebhook };
