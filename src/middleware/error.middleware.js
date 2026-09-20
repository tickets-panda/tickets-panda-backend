import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: null,
  });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || null;

  // Sequelize validation errors → 400 with per-field details
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = err.name === 'SequelizeUniqueConstraintError' ? 409 : 400;
    message = err.name === 'SequelizeUniqueConstraintError' ? 'Duplicate value' : 'Validation failed';
    errors = err.errors?.map((e) => ({ field: e.path, message: e.message })) || null;
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 409;
    message = 'Related record constraint failed';
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode}: ${err.stack || err.message}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${statusCode}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(env.isProd ? {} : { stack: err.stack }),
  });
};

export default { notFound, errorHandler };
