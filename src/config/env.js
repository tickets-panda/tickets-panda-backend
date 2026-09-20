import dotenv from 'dotenv';

dotenv.config();

const str = (key, fallback = '') => process.env[key] ?? fallback;
const num = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && process.env[key] !== undefined ? value : fallback;
};
const bool = (key, fallback = false) => {
  if (process.env[key] === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[key]).toLowerCase());
};

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 5000),
  appName: str('APP_NAME', 'TicketPanda'),
  appUrl: str('APP_URL', 'http://localhost:5000'),

  clientUrl: str('CLIENT_URL', 'http://localhost:3000'),
  tenantUrl: str('TENANT_DASHBOARD_URL', 'http://localhost:3000'),
  platformUrl: str('PLATFORM_ADMIN_URL', 'http://localhost:3000'),

  databaseUrl: str('DATABASE_URL', 'mysql://ticketpanda:ticketpanda@localhost:3306/ticket_panda_dev'),
  db: {
    host: str('DB_HOST', 'localhost'),
    port: num('DB_PORT', 3306),
    name: str('DB_NAME', 'ticket_panda_dev'),
    user: str('DB_USER', 'ticketpanda'),
    password: str('DB_PASSWORD', 'ticketpanda'),
    logging: bool('DB_LOGGING', false),
  },

  jwt: {
    accessSecret: str('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: str('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessExpiry: str('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiry: str('JWT_REFRESH_EXPIRY', '7d'),
    customerExpiry: str('JWT_CUSTOMER_EXPIRY', '30m'),
  },

  payments: {
    provider: str('PAYMENT_PROVIDER', 'local').toLowerCase(),
    get isLocal() {
      return this.provider === 'local';
    },
  },

  razorpay: {
    keyId: str('RAZORPAY_KEY_ID'),
    keySecret: str('RAZORPAY_KEY_SECRET'),
    webhookSecret: str('RAZORPAY_WEBHOOK_SECRET'),
    get configured() {
      return Boolean(str('RAZORPAY_KEY_ID') && str('RAZORPAY_KEY_SECRET'));
    },
  },

  smtp: {
    host: str('SMTP_HOST', 'smtp.gmail.com'),
    port: num('SMTP_PORT', 587),
    user: str('SMTP_USER'),
    pass: str('SMTP_PASS'),
    from: str('EMAIL_FROM', 'noreply@ticketpanda.com'),
    fromName: str('EMAIL_FROM_NAME', 'Ticket Panda'),
    get configured() {
      return Boolean(str('SMTP_USER') && str('SMTP_PASS'));
    },
  },

  otp: {
    expiryMinutes: num('OTP_EXPIRY_MINUTES', 5),
    length: num('OTP_LENGTH', 6),
    maxAttempts: num('OTP_MAX_ATTEMPTS', 5),
  },

  rateLimit: {
    windowMs: num('RATE_LIMIT_WINDOW_MS', 60000),
    max: num('RATE_LIMIT_MAX_REQUESTS', 100),
  },

  cookie: {
    refreshName: 'tp_refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },

  seed: {
    ownerEmail: str('SEED_PLATFORM_OWNER_EMAIL', 'owner@ticketpanda.com'),
    ownerPassword: str('SEED_PLATFORM_OWNER_PASSWORD', 'Password123'),
    demoTenant: bool('SEED_DEMO_TENANT', true),
  },
};

export default env;
