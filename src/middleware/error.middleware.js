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

  // Prisma error handling
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'A record with this value already exists';
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
      errors = [{ field: target || 'field', message: 'Unique constraint violation' }];
    } else if (err.code === 'P2003') {
      statusCode = 409;
      message = 'Related record constraint failed';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Record not found';
    }
  } else if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid data provided to database query';
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
