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
  orderId: Joi.number().integer().positive().required(),
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

export default { initiateBookingSchema, verifyPaymentSchema };
