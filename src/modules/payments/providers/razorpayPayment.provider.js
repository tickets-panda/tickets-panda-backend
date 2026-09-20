import { PaymentProvider } from './paymentProvider.interface.js';
import { getRazorpay, isRazorpayConfigured } from '../../../config/razorpay.js';
import { verifyRazorpaySignature, verifyWebhookSignature } from '../../../utils/verifySignature.js';
import { AppError, ValidationError } from '../../../utils/errors.js';
import { env } from '../../../config/env.js';

export class RazorpayPaymentProvider extends PaymentProvider {
  get name() {
    return 'razorpay';
  }

  assertConfigured() {
    if (!isRazorpayConfigured()) {
      throw new AppError('Razorpay payment gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or use PAYMENT_PROVIDER=local.', 503);
    }
  }

  async createOrder({ order, amount, currency, customer, metadata = {} }) {
    this.assertConfigured();

    const razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(amount * 100), // paise
      currency: currency || 'INR',
      receipt: order.orderRef,
      notes: {
        orderId: String(order.id),
        orderRef: order.orderRef,
        ...metadata,
      },
    });

    return {
      provider: 'razorpay',
      providerOrderId: razorpayOrder.id,
      amount,
      currency: razorpayOrder.currency,
      metadata: {
        keyId: env.razorpay.keyId,
        razorpayOrderId: razorpayOrder.id,
      },
    };
  }

  async verifyPayment({ providerOrderId, providerPaymentId, providerSignature }) {
    this.assertConfigured();

    if (!providerOrderId || !providerPaymentId || !providerSignature) {
      throw new ValidationError('Missing required Razorpay verification credentials');
    }

    const valid = verifyRazorpaySignature(
      providerOrderId,
      providerPaymentId,
      providerSignature,
      env.razorpay.keySecret,
    );

    if (!valid) {
      return {
        success: false,
        status: 'FAILED',
        providerOrderId,
        providerPaymentId,
        failedReason: 'Signature verification failed',
      };
    }

    // Remote verify
    const remote = await getRazorpay().payments.fetch(providerPaymentId);
    if (!['captured', 'authorized'].includes(remote.status)) {
      return {
        success: false,
        status: 'FAILED',
        providerOrderId,
        providerPaymentId,
        failedReason: `Payment not captured (remote status: ${remote.status})`,
      };
    }

    return {
      success: true,
      status: 'CAPTURED',
      providerOrderId,
      providerPaymentId,
      method: remote.method || 'unknown',
      capturedAt: new Date(),
    };
  }

  async getPaymentStatus(providerPaymentId) {
    this.assertConfigured();
    const remote = await getRazorpay().payments.fetch(providerPaymentId);
    return {
      provider: 'razorpay',
      providerPaymentId: remote.id,
      status: remote.status.toUpperCase(),
      amount: remote.amount / 100,
      method: remote.method,
    };
  }

  async refundPayment(providerPaymentId, amount) {
    this.assertConfigured();
    const refund = await getRazorpay().payments.refund(providerPaymentId, {
      amount: amount ? Math.round(amount * 100) : undefined,
    });
    return {
      provider: 'razorpay',
      providerPaymentId,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: 'REFUNDED',
    };
  }

  async handleWebhook(payload, headers, rawBody) {
    const signature = headers['x-razorpay-signature'];
    const valid = verifyWebhookSignature(rawBody, signature, env.razorpay.webhookSecret);
    if (!valid) throw new ValidationError('Invalid webhook signature');

    const eventType = payload.event;
    const entity = payload.payload?.payment?.entity;

    return {
      handled: true,
      provider: 'razorpay',
      eventType,
      providerOrderId: entity?.order_id,
      providerPaymentId: entity?.id,
      status: eventType === 'payment.captured' ? 'CAPTURED' : 'FAILED',
    };
  }
}

export const razorpayPaymentProvider = new RazorpayPaymentProvider();
export default razorpayPaymentProvider;
