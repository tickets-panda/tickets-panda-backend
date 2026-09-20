import { ValidationError } from '../utils/errors.js';

/**
 * Validates req[source] against a Joi schema and replaces it with the
 * coerced/whitelisted value. Supports body, params, and query.
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.') || source,
      message: detail.message.replace(/"/g, ''),
    }));
    return next(new ValidationError('Validation failed', errors));
  }

  req[source] = value;
  return next();
};

export default validate;
