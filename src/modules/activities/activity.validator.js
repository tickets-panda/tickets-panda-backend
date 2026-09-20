import Joi from 'joi';
import { ACTIVITY_STATUS } from '../../utils/constants.js';

const baseActivity = {
  title: Joi.string().trim().max(200),
  shortDescription: Joi.string().trim().max(500).allow('', null),
  description: Joi.string().trim().allow('', null),
  posterUrl: Joi.string().uri().max(500).allow('', null),
  rules: Joi.string().trim().allow('', null),
  eligibility: Joi.string().trim().allow('', null),
  startsAt: Joi.date().iso().allow(null),
  endsAt: Joi.date().iso().allow(null),
  venue: Joi.string().trim().max(300).allow('', null),
  capacity: Joi.number().integer().min(1).allow(null),
  status: Joi.string().valid(...ACTIVITY_STATUS),
  sortOrder: Joi.number().integer().min(0),
};

export const createActivitySchema = Joi.object({
  ...baseActivity,
  title: baseActivity.title.required(),
});

export const updateActivitySchema = Joi.object(baseActivity).min(1);

export const statusSchema = Joi.object({
  status: Joi.string().valid(...ACTIVITY_STATUS).required(),
});

export default { createActivitySchema, updateActivitySchema, statusSchema };
