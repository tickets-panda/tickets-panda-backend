import Joi from 'joi';
import { TENANT_ROLES } from '../../utils/constants.js';

export const updateProfileSchema = Joi.object({
  name: Joi.string().trim().max(150),
  phone: Joi.string().trim().max(20).allow('', null),
  logoUrl: Joi.string().uri().max(500).allow('', null),
  websiteUrl: Joi.string().uri().max(500).allow('', null),
  address: Joi.string().trim().allow('', null),
  description: Joi.string().trim().allow('', null),
  settings: Joi.object(),
}).min(1);

export const addMemberSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  email: Joi.string().trim().email().max(150).required(),
  phone: Joi.string().trim().max(20).allow('', null),
  role: Joi.string().valid(...TENANT_ROLES.filter((r) => r !== 'TENANT_OWNER')).required(),
  assignedEvents: Joi.array().items(Joi.number().integer()).allow(null),
  password: Joi.string().min(8).max(128),
});

export const updateMemberSchema = Joi.object({
  role: Joi.string().valid(...TENANT_ROLES.filter((r) => r !== 'TENANT_OWNER')),
  assignedEvents: Joi.array().items(Joi.number().integer()).allow(null),
  isActive: Joi.boolean(),
}).min(1);

export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  search: Joi.string().trim().max(150).allow(''),
  status: Joi.string().trim().max(30).allow(''),
  eventId: Joi.number().integer(),
  sortBy: Joi.string().trim().max(30),
  order: Joi.string().valid('asc', 'desc', 'ASC', 'DESC'),
});

export default { updateProfileSchema, addMemberSchema, updateMemberSchema, listQuerySchema };
