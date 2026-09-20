/**
 * PaymentProvider Interface
 * All payment providers (LocalTest, Razorpay, etc.) must implement this contract.
 */
export class PaymentProvider {
  /**
   * Returns provider identifier (e.g. 'local', 'razorpay')
   */
  get name() {
    throw new Error('PaymentProvider.name must be implemented');
  }

  /**
   * Creates a provider-specific order representation
   * @param {Object} params
   * @param {Object} params.order - Ticket Panda Order instance
   * @param {number} params.amount - Order amount in main currency units (e.g. INR)
   * @param {string} params.currency - 3-letter currency code (e.g. 'INR')
   * @param {Object} params.customer - Customer details { name, email, phone }
   * @param {Object} [params.metadata] - Optional additional metadata
   * @returns {Promise<{ provider: string, providerOrderId: string, amount: number, currency: string, metadata: Object }>}
   */
  async createOrder(params) {
    throw new Error('createOrder() must be implemented');
  }

  /**
   * Verifies/processes a payment confirmation payload
   * @param {Object} params
   * @param {string} params.providerOrderId
   * @param {string} params.providerPaymentId
   * @param {string} [params.providerSignature]
   * @param {string} [params.simulationState] - Used for testing: 'SUCCESS' | 'FAILED' | 'PENDING'
   * @param {string} [params.method] - Payment method (e.g. 'TEST_UPI', 'CARD')
   * @returns {Promise<{ success: boolean, status: 'CAPTURED'|'FAILED'|'PENDING', providerPaymentId: string, method: string, failedReason?: string, raw?: Object }>}
   */
  async verifyPayment(params) {
    throw new Error('verifyPayment() must be implemented');
  }

  /**
   * Fetches payment status from the provider
   * @param {string} providerPaymentId
   * @returns {Promise<{ status: string, amount: number, method: string }>}
   */
  async getPaymentStatus(providerPaymentId) {
    throw new Error('getPaymentStatus() must be implemented');
  }

  /**
   * Refunds a payment
   * @param {string} providerPaymentId
   * @param {number} amount
   * @returns {Promise<{ status: string, refundId: string }>}
   */
  async refundPayment(providerPaymentId, amount) {
    throw new Error('refundPayment() must be implemented');
  }

  /**
   * Handles incoming webhooks
   * @param {Object} payload
   * @param {Object} headers
   * @param {string|Buffer} rawBody
   * @returns {Promise<{ handled: boolean, eventType: string, providerOrderId?: string, providerPaymentId?: string, status?: string }>}
   */
  async handleWebhook(payload, headers, rawBody) {
    throw new Error('handleWebhook() must be implemented');
  }
}

export default PaymentProvider;
