import Joi from 'joi';

const passwordRule = Joi.string().min(8).max(128);

export const registerTenantSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  email: Joi.string().trim().email().max(150).required(),
  password: passwordRule.required(),
  phone: Joi.string().trim().max(20).allow('', null),
  websiteUrl: Joi.string().uri().max(500).allow('', null),
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().email().max(150).required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().max(150).required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().required(),
  newPassword: passwordRule.required(),
});

export default { registerTenantSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema };
