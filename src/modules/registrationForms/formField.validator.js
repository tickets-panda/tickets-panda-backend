import Joi from 'joi';
import { FORM_FIELD_TYPES } from '../../utils/constants.js';

const base = {
  fieldName: Joi.string().trim().max(100).pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  fieldLabel: Joi.string().trim().max(200),
  fieldType: Joi.string().valid(...FORM_FIELD_TYPES),
  options: Joi.array().items(Joi.string().trim().max(200)).allow(null),
  isRequired: Joi.boolean(),
  sortOrder: Joi.number().integer(),
  placeholder: Joi.string().trim().max(200).allow('', null),
  helpText: Joi.string().trim().max(500).allow('', null),
  fileConfig: Joi.object().allow(null),
  activityId: Joi.number().integer().positive().allow(null),
  validationRules: Joi.object().allow(null),
};

export const createFormFieldSchema = Joi.object({
  ...base,
  fieldName: base.fieldName.required(),
  fieldLabel: base.fieldLabel.required(),
  fieldType: base.fieldType.required(),
}).min(3);

export const updateFormFieldSchema = Joi.object(base).min(1);

export default { createFormFieldSchema, updateFormFieldSchema };
