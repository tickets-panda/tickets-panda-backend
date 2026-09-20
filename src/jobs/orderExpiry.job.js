import { Op } from 'sequelize';
import { sequelize, clampDecrement, Order, Registration, TicketType } from '../database/models/index.js';
import { ORDER_EXPIRY_MINUTES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

/**
 * Cancels orders that were never paid within ORDER_EXPIRY_MINUTES, expires
 * their registrations, and releases the seats held at booking time.
 */
export async function expireStaleOrders() {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_MINUTES * 60 * 1000);

  const stale = await Order.findAll({
    where: { status: { [Op.in]: ['CREATED', 'PAYMENT_PENDING'] }, createdAt: { [Op.lt]: cutoff } },
    include: [{ model: Registration, as: 'registration' }],
    limit: 200,
  });

  for (const order of stale) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async (t) => {
      const registration = order.registration;
      await order.update({ status: 'CANCELLED' }, { transaction: t });

      if (registration && !['CONFIRMED', 'REFUNDED'].includes(registration.status)) {
        await registration.update({ status: 'EXPIRED' }, { transaction: t });
        await TicketType.update(
          { soldCount: clampDecrement('sold_count', registration.quantity) },
          { where: { id: registration.ticketTypeId }, transaction: t },
        );
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
