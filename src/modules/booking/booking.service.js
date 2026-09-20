import { fn, col, Op } from 'sequelize';
import {
  sequelize,
  Event,
  Activity,
  TicketType,
  Registration,
  RegistrationForm,
  RegistrationData,
  Customer,
  Order,
  Payment,
  Ticket,
  Tenant,
} from '../../database/models/index.js';
import { NotFoundError, ConflictError, ValidationError, AppError } from '../../utils/errors.js';
import { normaliseEmail, normalisePhone } from '../../utils/helpers.js';
import { generateOrderRef, generateRegistrationRef } from '../../utils/generators.js';
import { verifyRazorpaySignature } from '../../utils/verifySignature.js';
import { getRazorpay, isRazorpayConfigured } from '../../config/razorpay.js';
import { generateTicketsForOrder, serialiseTicket } from '../tickets/ticket.service.js';
import { generateTicketPdf } from '../tickets/ticketPdf.service.js';
import { sendTemplateEmail } from '../notifications/notifications.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, ORDER_EXPIRY_MINUTES } from '../../utils/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/* ------------------------------------------------------------------ *
 * 1. Initiate booking
 * ------------------------------------------------------------------ */

async function validateAndStoreFormData(registration, eventId, formData, transaction) {
  const where = { eventId };
  if (registration.activityId) {
    where[Op.or] = [{ activityId: registration.activityId }, { activityId: null }];
  }
  const fields = await RegistrationForm.findAll({ where, transaction });
  const rows = [];

  for (const field of fields) {
    const raw = formData[String(field.id)];
    const value = raw === undefined || raw === null ? '' : String(raw).trim();

    if (field.isRequired && !value) {
      throw new ValidationError('Validation failed', [
        { field: field.fieldName, message: `${field.fieldLabel} is required` },
      ]);
    }
    if (value) rows.push({ registrationId: registration.id, formFieldId: field.id, fieldValue: value });
  }

  if (rows.length) await RegistrationData.bulkCreate(rows, { transaction });
  return rows.length;
}

export async function initiateBooking(payload, req) {
  const { eventId, activityId, ticketTypeId, quantity, customer } = payload;
  const formData = payload.formData || {};

  // Fail before we hold any inventory if the gateway is not configured.
  if (!isRazorpayConfigured()) {
    throw new AppError('Online payments are not configured yet. Please contact the organizer.', 503);
  }

  const event = await Event.findOne({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event not found');
  if (event.status !== 'LIVE') throw new ConflictError('This event is not open for registration');
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new ConflictError('Registration for this event has closed');
  }

  const ticketType = await TicketType.findOne({
    where: { id: ticketTypeId, eventId: event.id, tenantId: event.tenantId, isActive: true },
  });
  if (!ticketType) throw new NotFoundError('This ticket type is not available');

  if (quantity < ticketType.minPerOrder) throw new ValidationError(`Minimum ${ticketType.minPerOrder} ticket(s) per order`);
  if (quantity > ticketType.maxPerOrder) throw new ValidationError(`Maximum ${ticketType.maxPerOrder} ticket(s) per order`);

  const email = normaliseEmail(customer.email);
  const amount = Number(ticketType.price) * quantity;
  const currency = ticketType.currency || 'INR';

  const { registration, order, customerRecord } = await sequelize.transaction(async (t) => {
    // Row-lock the ticket type so concurrent bookings cannot oversell.
    const locked = await TicketType.findByPk(ticketType.id, { lock: t.LOCK.UPDATE, transaction: t });
    if (locked.soldCount + quantity > locked.quantity) {
      throw new ConflictError('Not enough tickets remaining for this ticket type');
    }

    // Event-level capacity guard (sum of seats held across all ticket types).
    if (event.maxCapacity) {
      const held = await TicketType.findOne({
        where: { eventId: event.id },
        attributes: [[fn('COALESCE', fn('SUM', col('sold_count')), 0), 'held']],
        raw: true,
        transaction: t,
      });
      if (Number(held?.held || 0) + quantity > event.maxCapacity) {
        throw new ConflictError('This event has reached its maximum capacity');
      }
    }

    await locked.increment('soldCount', { by: quantity, transaction: t });

    // Find-or-create the global customer record.
    let customerRecord = await Customer.findOne({ where: { email }, transaction: t });
    if (customerRecord) {
      const updates = {};
      if (customer.name && customer.name !== customerRecord.name) updates.name = customer.name;
      const phone = normalisePhone(customer.phone);
      if (phone && phone !== customerRecord.phone) updates.phone = phone;
      if (Object.keys(updates).length) await customerRecord.update(updates, { transaction: t });
    } else {
      customerRecord = await Customer.create(
        { name: customer.name, email, phone: normalisePhone(customer.phone) },
        { transaction: t },
      );
    }

    const finalActivityId = activityId || locked.activityId || null;
    const registration = await Registration.create(
      {
        registrationRef: generateRegistrationRef(),
        tenantId: event.tenantId,
        eventId: event.id,
        activityId: finalActivityId,
        customerId: customerRecord.id,
        ticketTypeId: locked.id,
        quantity,
        status: 'PAYMENT_PENDING',
      },
      { transaction: t },
    );

    await validateAndStoreFormData(registration, event.id, formData, t);

    const order = await Order.create(
      {
        orderRef: generateOrderRef(),
        tenantId: event.tenantId,
        registrationId: registration.id,
        customerId: customerRecord.id,
        amount,
        currency,
        status: 'CREATED',
      },
      { transaction: t },
    );

    return { registration, order, customerRecord };
  });

  let razorpayOrder;
  try {
    razorpayOrder = await getRazorpay().orders.create({
      amount: Math.round(amount * 100), // paise
      currency,
      receipt: order.orderRef,
      notes: { eventId: String(event.id), registrationRef: registration.registrationRef },
    });
  } catch (err) {
    logger.error(`Razorpay order creation failed: ${err.message}`);
    await sequelize.transaction(async (t) => {
      await order.update({ status: 'FAILED' }, { transaction: t });
      await registration.update({ status: 'CANCELLED' }, { transaction: t });
      await TicketType.decrement('soldCount', { by: quantity, where: { id: ticketType.id }, transaction: t });
    });
    throw new AppError('Could not start the payment. Please try again.', 502);
  }

  await sequelize.transaction(async (t) => {
    await order.update({ status: 'PAYMENT_PENDING' }, { transaction: t });
    await Payment.create(
      {
        orderId: order.id,
        tenantId: event.tenantId,
        razorpayOrderId: razorpayOrder.id,
        amount,
        currency,
        status: 'CREATED',
      },
      { transaction: t },
    );
  });

  await recordAudit({
    tenantId: event.tenantId,
    action: AUDIT_ACTIONS.BOOKING_INITIATED,
    entityType: 'order',
    entityId: order.id,
    details: { orderRef: order.orderRef, eventId: event.id, quantity, amount },
    req,
  });

  return {
    orderId: order.id,
    orderRef: order.orderRef,
    registrationRef: registration.registrationRef,
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: env.razorpay.keyId,
    amount,
    currency,
    quantity,
    expiresInMinutes: ORDER_EXPIRY_MINUTES,
    customer: { name: customerRecord.name, email: customerRecord.email },
    event: { id: event.id, title: event.title, slug: event.slug },
  };
}

/* ------------------------------------------------------------------ *
 * 2. Verify payment (never trust the frontend callback alone)
 * ------------------------------------------------------------------ */

export async function verifyPayment({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }, req) {
  const order = await Order.findByPk(orderId, {
    include: [
      { model: Registration, as: 'registration' },
      { model: Payment, as: 'payment' },
      { model: Customer, as: 'customer' },
    ],
  });
  if (!order) throw new NotFoundError('Order not found');

  // Idempotency — replaying a webhook/retry returns the existing tickets.
  if (order.status === 'PAID') {
    const existing = await Ticket.findAll({ where: { orderId: order.id } });
    return { order, tickets: existing.map(serialiseTicket), alreadyProcessed: true };
  }

  if (!['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
    throw new ConflictError(`This order can no longer be paid (status: ${order.status})`);
  }

  const payment = order.payment;
  if (!payment) throw new NotFoundError('Payment record not found for this order');
  if (payment.razorpayOrderId && payment.razorpayOrderId !== razorpayOrderId) {
    throw new ValidationError('This payment does not belong to the given order');
  }

  if (!isRazorpayConfigured()) throw new AppError('Online payments are not configured yet.', 503);

  // Step 1 — cryptographic signature verification.
  const signatureValid = verifyRazorpaySignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    env.razorpay.keySecret,
  );

  if (!signatureValid) {
    await sequelize.transaction(async (t) => {
      await payment.update({ status: 'FAILED', failedReason: 'Signature verification failed' }, { transaction: t });
      await order.update({ status: 'FAILED' }, { transaction: t });
    });
    await recordAudit({
      tenantId: order.tenantId,
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entityType: 'payment',
      entityId: payment.id,
      details: { orderRef: order.orderRef, reason: 'signature_mismatch' },
      req,
    });
    throw new ValidationError('Payment signature verification failed');
  }

  // Step 2 — confirm with Razorpay that the payment is actually captured.
  let remote;
  try {
    remote = await getRazorpay().payments.fetch(razorpayPaymentId);
  } catch (err) {
    logger.error(`Razorpay payment fetch failed: ${err.message}`);
    throw new AppError('Could not confirm the payment with the gateway. Please retry.', 502);
  }

  if (remote.order_id !== razorpayOrderId) throw new ValidationError('Payment does not belong to this order');
  if (!['captured', 'authorized'].includes(remote.status)) {
    throw new ConflictError(`Payment is not captured (gateway status: ${remote.status})`);
  }

  // Step 3 — mark paid, generate tickets, notify.
  const tickets = await finalisePaidOrder({
    order,
    payment,
    razorpayPaymentId,
    razorpaySignature,
    method: remote.method || null,
    req,
    source: 'checkout',
  });

  return { order, tickets: tickets.map(serialiseTicket), alreadyProcessed: false };
}

/**
 * Marks an order paid, generates its tickets, and sends notifications.
 * Idempotent — safe to call from both the checkout verifier and the webhook.
 * Expects order.payment and order.registration to be loaded.
 */
export async function finalisePaidOrder({
  order,
  payment,
  razorpayPaymentId,
  razorpaySignature = null,
  method = null,
  req = null,
  source = 'webhook',
}) {
  if (order.status === 'PAID') {
    return Ticket.findAll({ where: { orderId: order.id } });
  }

  const registration = order.registration || (await Registration.findByPk(order.registrationId));

  const tickets = await sequelize.transaction(async (t) => {
    await payment.update(
      {
        razorpayPaymentId,
        razorpaySignature,
        status: 'CAPTURED',
        method: method || payment.method || null,
        capturedAt: new Date(),
      },
      { transaction: t },
    );
    await order.update({ status: 'PAID' }, { transaction: t });
    await registration.update({ status: 'CONFIRMED' }, { transaction: t });

    return generateTicketsForOrder({ order, registration, transaction: t });
  });

  const customer = order.customer || (await Customer.findByPk(order.customerId));
  const [event, ticketType, tenant] = await Promise.all([
    Event.findByPk(registration.eventId),
    TicketType.findByPk(registration.ticketTypeId),
    Tenant.findByPk(order.tenantId),
  ]);

  await deliverTickets({ order, registration, customer, event, ticketType, tenant, tickets });

  await recordAudit({
    tenantId: order.tenantId,
    action: AUDIT_ACTIONS.TICKETS_GENERATED,
    entityType: 'order',
    entityId: order.id,
    details: { orderRef: order.orderRef, ticketCount: tickets.length, paymentId: razorpayPaymentId, source },
    req,
  });

  return tickets;
}

/** Emails the tickets to the customer and a notification to the tenant. */
async function deliverTickets({ order, registration, customer, event, ticketType, tenant, tickets }) {
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateTicketPdf({ event, customer, tickets, orderRef: order.orderRef });
  } catch (err) {
    logger.error(`PDF generation failed for ${order.orderRef}: ${err.message}`);
  }

  const attachments = pdfBuffer
    ? [{ filename: `tickets-${order.orderRef}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
    : [];

  await sendTemplateEmail({
    template: 'ticket_confirmation',
    to: customer.email,
    tenantId: order.tenantId,
    refType: 'order',
    refId: order.id,
    attachments,
    data: {
      customerName: customer.name,
      event,
      orderRef: order.orderRef,
      amount: order.amount,
      currency: order.currency,
      tickets: tickets.map((t) => ({ ticketKey: t.ticketKey, ticketTypeName: ticketType?.name || 'Ticket' })),
    },
  });

  if (tenant?.email) {
    await sendTemplateEmail({
      template: 'tenant_booking',
      to: tenant.email,
      tenantId: order.tenantId,
      refType: 'order',
      refId: order.id,
      data: {
        tenantName: tenant.name,
        event,
        orderRef: order.orderRef,
        customer: { name: customer.name, email: customer.email },
        quantity: registration.quantity,
        amount: order.amount,
        currency: order.currency,
        dashboardUrl: `${env.tenantUrl}/tenant/bookings`,
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * 3. Confirmation (public, keyed by order reference)
 * ------------------------------------------------------------------ */

export async function getConfirmation(orderRef) {
  const order = await Order.findOne({
    where: { orderRef },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: Payment, as: 'payment', attributes: ['id', 'status', 'method'] },
      { model: Ticket, as: 'tickets' },
      {
        model: Registration,
        as: 'registration',
        include: [
          { model: Event, as: 'event', attributes: ['id', 'title', 'slug', 'eventDate', 'eventTimeStart', 'venueName', 'venueAddress', 'bannerUrl'] },
          { model: TicketType, as: 'ticketType', attributes: ['id', 'name', 'price'] },
        ],
      },
    ],
  });

  if (!order) throw new NotFoundError('Order not found');

  return {
    orderRef: order.orderRef,
    status: order.status,
    amount: Number(order.amount),
    currency: order.currency,
    customer: order.customer,
    payment: order.payment,
    event: order.registration?.event,
    ticketType: order.registration?.ticketType,
    quantity: order.registration?.quantity,
    tickets: (order.tickets || []).map(serialiseTicket),
  };
}

export async function getOrderPdfBuffer(orderRef) {
  const order = await Order.findOne({
    where: { orderRef, status: 'PAID' },
    include: [
      { model: Customer, as: 'customer' },
      { model: Ticket, as: 'tickets' },
      {
        model: Registration,
        as: 'registration',
        include: [
          { model: Event, as: 'event' },
          { model: Activity, as: 'activity' },
          { model: TicketType, as: 'ticketType' },
        ],
      },
    ],
  });

  if (!order) throw new NotFoundError('Confirmed booking not found');

  const pdfBuffer = await generateTicketPdf({
    event: order.registration.event,
    activity: order.registration.activity,
    customer: order.customer,
    tickets: order.tickets,
    orderRef: order.orderRef,
  });

  return { pdfBuffer, filename: `ticket-${order.orderRef}.pdf` };
}

export default { initiateBooking, verifyPayment, finalisePaidOrder, getConfirmation, getOrderPdfBuffer };
