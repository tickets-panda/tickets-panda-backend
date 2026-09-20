import Joi from 'joi';

const base = {
  name: Joi.string().trim().max(100),
  description: Joi.string().trim().allow('', null),
  price: Joi.number().min(0).precision(2),
  currency: Joi.string().length(3).uppercase(),
  quantity: Joi.number().integer().min(1),
  minPerOrder: Joi.number().integer().min(1),
  maxPerOrder: Joi.number().integer().min(1),
  sortOrder: Joi.number().integer(),
  isActive: Joi.boolean(),
  activityId: Joi.number().integer().positive().allow(null),
};

export const createTicketTypeSchema = Joi.object({
  ...base,
  name: base.name.required(),
  price: base.price.required(),
  quantity: base.quantity.required(),
}).min(3);

export const updateTicketTypeSchema = Joi.object(base).min(1);

export default { createTicketTypeSchema, updateTicketTypeSchema };
