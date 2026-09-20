import QRCode from 'qrcode';
import { Ticket } from '../../database/models/index.js';
import { generateTicketKey, generateVerificationToken } from '../../utils/generators.js';
import { env } from '../../config/env.js';

const MAX_KEY_ATTEMPTS = 5;

/**
 * Creates `registration.quantity` tickets for a paid order.
 * Must be called inside the payment-confirmation transaction.
 */
export async function generateTicketsForOrder({ order, registration, transaction }) {
  const tickets = [];

  for (let i = 0; i < registration.quantity; i += 1) {
    let ticketKey = null;

    for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt += 1) {
      const candidate = generateTicketKey();
      const exists = await Ticket.findOne({ where: { ticketKey: candidate }, transaction });
      if (!exists) {
        ticketKey = candidate;
        break;
      }
    }

    if (!ticketKey) throw new Error('Failed to generate a unique ticket key after multiple attempts');

    const verificationToken = generateVerificationToken();
    const verifyUrl = `${env.clientUrl}/verify/${verificationToken}`;
    // QR encodes only an opaque verification URL — never customer PII.
    const qrData = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 320 });

    const ticket = await Ticket.create(
      {
        ticketKey,
        verificationToken,
        tenantId: order.tenantId,
        eventId: registration.eventId,
        activityId: registration.activityId || null,
        orderId: order.id,
        registrationId: registration.id,
        customerId: order.customerId,
        ticketTypeId: registration.ticketTypeId,
        status: 'ACTIVE',
        qrData,
      },
      { transaction },
    );

    tickets.push(ticket);
  }

  return tickets;
}

/** Human-facing ticket payload (safe to return to the buyer). */
export function serialiseTicket(ticket) {
  const plain = typeof ticket.toJSON === 'function' ? ticket.toJSON() : ticket;
  return {
    id: plain.id,
    ticketKey: plain.ticketKey,
    status: plain.status,
    qrData: plain.qrData,
    eventId: plain.eventId,
    activityId: plain.activityId || null,
    ticketTypeId: plain.ticketTypeId,
  };
}

export default { generateTicketsForOrder, serialiseTicket };
