import { Op } from 'sequelize';
import { Customer, OtpVerification, Ticket, Event, TicketType, Checkin } from '../../database/models/index.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors.js';
import { normaliseEmail, normalisePhone } from '../../utils/helpers.js';
import { generateOtp } from '../../utils/generators.js';
import { signCustomerToken } from '../../utils/tokens.js';
import { sendTemplateEmail } from '../notifications/notifications.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const normalise = (identifier, type) => (type === 'PHONE' ? normalisePhone(identifier) : normaliseEmail(identifier));

const findCustomer = async (identifier, type) =>
  type === 'PHONE' ? Customer.findOne({ where: { phone: identifier } }) : Customer.findOne({ where: { email: identifier } });

/** Issues a one-time code for "My Tickets" access. */
export async function sendOtp({ identifier, type = 'EMAIL' }, req) {
  const value = normalise(identifier, type);
  if (!value) throw new ValidationError(`A valid ${type === 'PHONE' ? 'phone number' : 'email address'} is required`);

  const otp = generateOtp(env.otp.length);
  await OtpVerification.create({
    identifier: value,
    identifierType: type,
    otp,
    purpose: 'CUSTOMER_LOGIN',
    expiresAt: new Date(Date.now() + env.otp.expiryMinutes * 60 * 1000),
  });

  if (type === 'EMAIL') {
    await sendTemplateEmail({
      template: 'otp',
      to: value,
      refType: 'otp',
      refId: 0,
      data: { otp, expiryMinutes: env.otp.expiryMinutes },
    });
  } else {
    // SMS provider is out of MVP scope — the code is logged for local testing.
    logger.info(`[otp:sms-not-configured] ${value} → ${otp}`);
  }

  await recordAudit({
    action: AUDIT_ACTIONS.OTP_REQUESTED,
    entityType: 'otp',
    details: { identifier: value, type },
    req,
  });

  return { identifier: value, type, expiresInMinutes: env.otp.expiryMinutes };
}

/** Verifies an OTP and returns a short-lived customer token. */
export async function verifyOtp({ identifier, type = 'EMAIL', otp }, req) {
  const value = normalise(identifier, type);
  if (!value) throw new ValidationError('A valid email or phone is required');

  const record = await OtpVerification.findOne({
    where: {
      identifier: value,
      purpose: 'CUSTOMER_LOGIN',
      isUsed: false,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });

  if (!record) throw new ValidationError('This code is invalid or has expired');
  if (record.attempts >= env.otp.maxAttempts) {
    throw new ForbiddenError('Too many incorrect attempts. Please request a new code.');
  }

  if (record.otp !== String(otp)) {
    await record.increment('attempts');
    throw new ValidationError('Incorrect code');
  }

  await record.update({ isUsed: true });

  const customer = await findCustomer(value, type);
  if (!customer) throw new NotFoundError('We could not find any bookings for those details');
  if (!customer.isVerified) await customer.update({ isVerified: true });

  const accessToken = signCustomerToken(customer);

  return {
    accessToken,
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
  };
}

/** Returns every ticket belonging to a customer, grouped for display. */
export async function myTickets(customerId) {
  const tickets = await Ticket.findAll({
    where: { customerId },
    include: [
      { model: Event, as: 'event', attributes: ['id', 'title', 'slug', 'eventDate', 'eventTimeStart', 'venueName', 'venueAddress', 'bannerUrl'] },
      { model: TicketType, as: 'ticketType', attributes: ['id', 'name', 'price'] },
      { model: Checkin, as: 'checkin', attributes: ['id', 'checkedInAt', 'gateName'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  return tickets.map((ticket) => {
    const plain = ticket.toJSON();
    return {
      id: plain.id,
      ticketKey: plain.ticketKey,
      status: plain.status,
      qrData: plain.qrData,
      event: plain.event,
      ticketType: plain.ticketType,
      checkedInAt: plain.checkin?.checkedInAt || null,
    };
  });
}

/** Resolves an opaque verification token to a safe, public ticket summary. */
export async function resolveVerificationToken(token) {
  const ticket = await Ticket.findOne({
    where: { verificationToken: token },
    include: [
      { model: Event, as: 'event', attributes: ['id', 'title', 'eventDate', 'eventTimeStart', 'venueName'] },
      { model: TicketType, as: 'ticketType', attributes: ['id', 'name'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: Checkin, as: 'checkin', attributes: ['id', 'checkedInAt', 'gateName'] },
    ],
  });

  if (!ticket) throw new NotFoundError('Ticket not found');

  return {
    ticketKey: ticket.ticketKey,
    status: ticket.status,
    holder: ticket.customer?.name || null,
    event: ticket.event,
    ticketType: ticket.ticketType,
    checkedInAt: ticket.checkin?.checkedInAt || null,
  };
}

export default { sendOtp, verifyOtp, myTickets, resolveVerificationToken };
