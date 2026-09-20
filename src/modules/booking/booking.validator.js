import Joi from 'joi';

export const initiateBookingSchema = Joi.object({
  eventId: Joi.number().integer().positive().required(),
  activityId: Joi.number().integer().positive().allow(null),
  ticketTypeId: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).max(50).required(),
  customer: Joi.object({
    name: Joi.string().trim().max(100).required(),
    email: Joi.string().trim().email().max(150).required(),
    phone: Joi.string().trim().max(20).allow('', null),
  }).required(),
  formData: Joi.object().pattern(Joi.string(), Joi.any()).default({}),
});

export const verifyPaymentSchema = Joi.object({
  orderId: Joi.number().integer().positive().allow(null),
  orderRef: Joi.string().trim().allow('', null),
  simulationState: Joi.string().valid('SUCCESS', 'FAILED', 'PENDING').default('SUCCESS'),
  method: Joi.string().trim().max(50).allow('', null),
  failureReason: Joi.string().trim().max(255).allow('', null),
  razorpayOrderId: Joi.string().trim().allow('', null),
  razorpayPaymentId: Joi.string().trim().allow('', null),
  razorpaySignature: Joi.string().trim().allow('', null),
}).or('orderId', 'orderRef');

export const retryPaymentSchema = Joi.object({
  orderRef: Joi.string().trim().required(),
});

export default { initiateBookingSchema, verifyPaymentSchema, retryPaymentSchema };
