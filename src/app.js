import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger, stream } from './utils/logger.js';
import { globalRateLimiter } from './middleware/rateLimiter.middleware.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';
import routes from './routes/index.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS — only the configured frontend origins may call the API with cookies.
const allowedOrigins = [env.clientUrl, env.tenantUrl, env.platformUrl].filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);

// Capture the raw body so Razorpay webhook signatures can be verified.
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.isProd ? 'combined' : 'dev', { stream }));
}

app.use(globalRateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: env.appName,
    env: env.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// API
app.use('/api/v1', routes);

// 404 + global error handler
app.use(notFound);
app.use(errorHandler);

export default app;
