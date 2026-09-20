import app from './src/app.js';
import { env } from './src/config/env.js';
import { logger } from './src/utils/logger.js';
import prisma from './src/lib/prisma.js';
import { startOrderExpiryJob, stopOrderExpiryJob } from './src/jobs/orderExpiry.job.js';

let server;

async function start() {
  try {
    await prisma.$connect();
    logger.info(`Prisma connected to database (${env.db.host}:${env.db.port}/${env.db.name})`);

    startOrderExpiryJob();

    server = app.listen(env.port, () => {
      logger.info(`${env.appName} API listening on ${env.appUrl} (${env.nodeEnv})`);
      logger.info(`Health check: ${env.appUrl}/health`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  stopOrderExpiryJob();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

start();
