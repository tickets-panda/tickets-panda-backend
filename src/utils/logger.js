import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => `${ts} [${level}] ${stack || message}`),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.isProd ? 'info' : 'debug',
  format: env.isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console({ silent: env.nodeEnv === 'test' })],
});

// Morgan writes HTTP access logs through this stream.
export const stream = {
  write: (message) => logger.http(message.trim()),
};

export default logger;
