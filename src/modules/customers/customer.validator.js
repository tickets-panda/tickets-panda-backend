import Joi from 'joi';

export const sendOtpSchema = Joi.object({
  identifier: Joi.string().trim().max(150).required(),
  type: Joi.string().valid('EMAIL', 'PHONE').default('EMAIL'),
});

export const verifyOtpSchema = Joi.object({
  identifier: Joi.string().trim().max(150).required(),
  type: Joi.string().valid('EMAIL', 'PHONE').default('EMAIL'),
  otp: Joi.string().trim().min(4).max(10).required(),
});

export default { sendOtpSchema, verifyOtpSchema };
