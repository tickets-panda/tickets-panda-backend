import { env } from '../../config/env.js';
import { localTestPaymentProvider } from './providers/localTestPayment.provider.js';
import { razorpayPaymentProvider } from './providers/razorpayPayment.provider.js';
import { Payment, Order, Registration, Customer, TicketType } from '../../database/models/index.js';
import { NotFoundError, ConflictError, AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Returns the currently active PaymentProvider based on configuration.
 */
export function getPaymentProvider() {
  const providerName = (env.payments?.provider || 'local').toLowerCase();

  if (providerName === 'local') {
    return localTestPaymentProvider;
  }
  if (providerName === 'razorpay') {
    return razorpayPaymentProvider;
  }

  throw new AppError(`Unsupported payment provider configured: ${providerName}`, 500);
}

/**
 * Initiates an order with the active payment provider.
 */
export async function createPaymentOrder({ order, registration, amount, currency, customer, notes = {} }) {
  const provider = getPaymentProvider();

  const providerResult = await provider.createOrder({
    order,
    amount,
    currency,
    customer,
    metadata: {
      registrationRef: registration.registrationRef,
      tenantId: order.tenantId,
      ...notes,
    },
  });

  return providerResult;
}

/**
 * Resolves or verifies a payment with the active provider.
 */
export async function verifyPaymentWithProvider(payload) {
  const provider = getPaymentProvider();
  return provider.verifyPayment(payload);
}

export default {
  getPaymentProvider,
  createPaymentOrder,
  verifyPaymentWithProvider,
};
