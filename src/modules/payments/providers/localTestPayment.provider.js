import { nanoid } from 'nanoid';
import { PaymentProvider } from './paymentProvider.interface.js';
import { AppError, ForbiddenError } from '../../../utils/errors.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

export class LocalTestPaymentProvider extends PaymentProvider {
  get name() {
    return 'local';
  }

  /**
   * Asserts that this provider is never executed in production.
   */
  assertNotProduction() {
    if (env.isProduction || process.env.NODE_ENV === 'production') {
      logger.error('CRITICAL: Attempted to run LocalTestPaymentProvider in production environment!');
      throw new ForbiddenError('Local test payment provider is disabled in production environment. A valid payment gateway must be configured.');
    }
  }

  /**
   * Creates a simulated local test order
   */
  async createOrder({ order, amount, currency, customer, metadata = {} }) {
    this.assertNotProduction();

    const providerOrderId = `local_ord_${nanoid(16)}`;

    return {
      provider: 'local',
      providerOrderId,
      amount,
      currency,
      metadata: {
        ...metadata,
        testMode: true,
        orderRef: order.orderRef,
        customerName: customer?.name,
        customerEmail: customer?.email,
      },
    };
  }

  /**
   * Verifies and simulates payment processing
   */
  async verifyPayment({
    providerOrderId,
    providerPaymentId,
    simulationState = 'SUCCESS',
    method = 'TEST_LOCAL',
    failureReason,
  }) {
    this.assertNotProduction();

    // 1. Simulate Failed Payment
    if (simulationState === 'FAILED') {
      return {
        success: false,
        status: 'FAILED',
        providerOrderId,
        providerPaymentId: providerPaymentId || `local_pay_failed_${nanoid(12)}`,
        method: method || 'TEST_LOCAL',
        failedReason: failureReason || 'Payment simulated as failed by user in local test mode',
        capturedAt: null,
      };
    }

    // 2. Simulate Pending Payment
    if (simulationState === 'PENDING') {
      return {
        success: false,
        status: 'PENDING',
        providerOrderId,
        providerPaymentId: providerPaymentId || `local_pay_pending_${nanoid(12)}`,
        method: method || 'TEST_LOCAL',
        message: 'Payment simulated as pending in local test mode',
        capturedAt: null,
      };
    }

    // 3. Simulate Successful Payment (default)
    const finalPaymentId = providerPaymentId || `local_pay_${nanoid(16)}`;

    return {
      success: true,
      status: 'CAPTURED',
      providerOrderId,
      providerPaymentId: finalPaymentId,
      method: method || 'TEST_LOCAL',
      capturedAt: new Date(),
    };
  }

  /**
   * Status check
   */
  async getPaymentStatus(providerPaymentId) {
    this.assertNotProduction();
    return {
      provider: 'local',
      providerPaymentId,
      status: 'CAPTURED',
      verified: true,
    };
  }

  /**
   * Refund
   */
  async refundPayment(providerPaymentId, amount) {
    this.assertNotProduction();
    return {
      provider: 'local',
      providerPaymentId,
      refundId: `local_ref_${nanoid(16)}`,
      amount,
      status: 'REFUNDED',
      refundedAt: new Date(),
    };
  }

  /**
   * Local webhook handler
   */
  async handleWebhook(payload) {
    this.assertNotProduction();
    return {
      handled: true,
      provider: 'local',
      eventType: payload.event || 'test.payment.captured',
      providerOrderId: payload.orderId,
      providerPaymentId: payload.paymentId,
      status: payload.status || 'CAPTURED',
    };
  }
}

export const localTestPaymentProvider = new LocalTestPaymentProvider();
export default localTestPaymentProvider;
