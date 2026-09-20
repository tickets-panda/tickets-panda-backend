import prisma from '../lib/prisma.js';
import { ORDER_EXPIRY_MINUTES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/**
 * Cancels orders that were never paid within ORDER_EXPIRY_MINUTES, expires
 * their registrations, and releases the seats held at booking time.
 */
export async function expireStaleOrders() {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_MINUTES * 60 * 1000);

  const stale = await prisma.order.findMany({
    where: {
      status: { in: ['CREATED', 'PAYMENT_PENDING'] },
      createdAt: { lt: cutoff },
    },
    include: { registration: true },
    take: 200,
  });

  for (const order of stale) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.$transaction(async (tx) => {
      const registration = order.registration;
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });

      if (registration && !['CONFIRMED', 'REFUNDED'].includes(registration.status)) {
        await tx.registration.update({
          where: { id: registration.id },
          data: { status: 'EXPIRED' },
        });
        await tx.ticketType.update({
          where: { id: registration.ticketTypeId },
          data: { soldCount: { decrement: registration.quantity } },
        });
      }
    });
  }

  if (stale.length) logger.info(`Order expiry job: cancelled ${stale.length} abandoned order(s)`);
  return stale.length;
}

let timer = null;

export function startOrderExpiryJob() {
  if (timer) return timer;
  timer = setInterval(() => {
    expireStaleOrders().catch((err) => logger.error(`Order expiry job failed: ${err.message}`));
  }, INTERVAL_MS);
  timer.unref?.();
  logger.info('Order expiry job scheduled (every 5 minutes)');
  return timer;
}

export function stopOrderExpiryJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export default { expireStaleOrders, startOrderExpiryJob, stopOrderExpiryJob };
