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
import * as paymentService from '../payments/payment.service.js';
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

  const provider = paymentService.getPaymentProvider();
  if (provider.name === 'razorpay' && !isRazorpayConfigured()) {
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

  let providerResult;
  try {
    providerResult = await paymentService.createPaymentOrder({
      order,
      registration,
      amount,
      currency,
      customer: customerRecord,
      notes: { eventId: String(event.id), registrationRef: registration.registrationRef },
    });
  } catch (err) {
    logger.error(`Payment provider order creation failed: ${err.message}`);
    await sequelize.transaction(async (t) => {
      await order.update({ status: 'FAILED' }, { transaction: t });
      await registration.update({ status: 'CANCELLED' }, { transaction: t });
      await TicketType.decrement('soldCount', { by: quantity, where: { id: ticketType.id }, transaction: t });
    });
    throw new AppError(`Could not start the payment: ${err.message}`, 502);
  }

  await sequelize.transaction(async (t) => {
    await order.update({ status: 'PAYMENT_PENDING' }, { transaction: t });
    await Payment.create(
      {
        orderId: order.id,
        tenantId: event.tenantId,
        provider: providerResult.provider,
        providerOrderId: providerResult.providerOrderId,
        razorpayOrderId: providerResult.provider === 'razorpay' ? providerResult.providerOrderId : null,
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
    details: { orderRef: order.orderRef, eventId: event.id, quantity, amount, provider: providerResult.provider },
    req,
  });

  return {
    orderId: order.id,
    orderRef: order.orderRef,
    registrationRef: registration.registrationRef,
    paymentProvider: providerResult.provider,
    providerOrderId: providerResult.providerOrderId,
    checkoutUrl: providerResult.provider === 'local' ? `/checkout/local/${order.orderRef}` : null,
    razorpayOrderId: providerResult.providerOrderId,
    razorpayKeyId: env.razorpay.keyId || null,
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

export async function verifyPayment(payload, req) {
  const {
    orderId,
    orderRef,
    simulationState = 'SUCCESS',
    method = 'TEST_LOCAL',
    failureReason,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = payload;

  const whereClause = {};
  if (orderId) whereClause.id = orderId;
  else if (orderRef) whereClause.orderRef = orderRef;
  else throw new ValidationError('orderId or orderRef is required');

  const order = await Order.findOne({
    where: whereClause,
    include: [
      { model: Registration, as: 'registration' },
      { model: Payment, as: 'payment' },
      { model: Customer, as: 'customer' },
    ],
  });
  if (!order) throw new NotFoundError('Order not found');

  // Idempotency — replaying on an already paid order returns the existing tickets.
  if (order.status === 'PAID') {
    const existing = await Ticket.findAll({ where: { orderId: order.id } });
    return {
      order,
      status: 'PAID',
      tickets: existing.map(serialiseTicket),
      alreadyProcessed: true,
    };
  }

  if (order.status === 'FAILED') {
    throw new ConflictError('This order has failed. Please retry payment to proceed.');
  }

  if (!['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
    throw new ConflictError(`This order can no longer be paid (status: ${order.status})`);
  }

  const payment = order.payment;
  if (!payment) throw new NotFoundError('Payment record not found for this order');

  const providerName = payment.provider || 'local';

  // 1. LOCAL TEST PAYMENT PROVIDER
  if (providerName === 'local') {
    const verification = await paymentService.verifyPaymentWithProvider({
      providerOrderId: payment.providerOrderId,
      providerPaymentId: razorpayPaymentId || payload.providerPaymentId,
      simulationState,
      method,
      failureReason,
    });

    if (verification.status === 'FAILED') {
      await sequelize.transaction(async (t) => {
        await payment.update(
          {
            status: 'FAILED',
            providerPaymentId: verification.providerPaymentId,
            failedReason: verification.failedReason,
          },
          { transaction: t },
        );
        await order.update({ status: 'FAILED' }, { transaction: t });

        // Release inventory held by this order
        const registration = order.registration || (await Registration.findByPk(order.registrationId, { transaction: t }));
        if (registration) {
          await registration.update({ status: 'CANCELLED' }, { transaction: t });
          await TicketType.decrement('soldCount', {
            by: registration.quantity,
            where: { id: registration.ticketTypeId },
            transaction: t,
          });
        }
      });

      await recordAudit({
        tenantId: order.tenantId,
        action: AUDIT_ACTIONS.PAYMENT_FAILED,
        entityType: 'payment',
        entityId: payment.id,
        details: { orderRef: order.orderRef, reason: verification.failedReason },
        req,
      });

      return {
        order,
        status: 'FAILED',
        message: verification.failedReason,
        canRetry: true,
        alreadyProcessed: false,
      };
    }

    if (verification.status === 'PENDING') {
      await payment.update({
        status: 'PENDING',
        providerPaymentId: verification.providerPaymentId,
      });
      return {
        order,
        status: 'PENDING',
        message: verification.message || 'Payment is currently pending confirmation',
        alreadyProcessed: false,
      };
    }

    // SUCCESS / CAPTURED
    const tickets = await finalisePaidOrder({
      order,
      payment,
      providerPaymentId: verification.providerPaymentId,
      providerSignature: 'simulated_local_signature',
      method: verification.method || 'TEST_LOCAL',
      req,
      source: 'checkout_local',
    });

    return {
      order,
      status: 'PAID',
      tickets: tickets.map(serialiseTicket),
      alreadyProcessed: false,
    };
  }

  // 2. RAZORPAY PAYMENT PROVIDER
  if (providerName === 'razorpay') {
    if (payment.razorpayOrderId && payment.razorpayOrderId !== razorpayOrderId) {
      throw new ValidationError('This payment does not belong to the given order');
    }
    if (!isRazorpayConfigured()) throw new AppError('Online payments are not configured yet.', 503);

    // Cryptographic signature verification
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

    const tickets = await finalisePaidOrder({
      order,
      payment,
      providerPaymentId: razorpayPaymentId,
      providerSignature: razorpaySignature,
      method: remote.method || null,
      req,
      source: 'checkout_razorpay',
    });

    return {
      order,
      status: 'PAID',
      tickets: tickets.map(serialiseTicket),
      alreadyProcessed: false,
    };
  }

  throw new AppError(`Unknown payment provider: ${providerName}`, 500);
}

/**
 * Marks an order paid, generates its tickets, and sends notifications.
 * Idempotent — safe to call from both the checkout verifier and the webhook.
 * Expects order.payment and order.registration to be loaded.
 */
export async function finalisePaidOrder({
  order,
  payment,
  providerPaymentId,
  providerSignature = null,
  method = null,
  req = null,
  source = 'webhook',
}) {
  if (order.status === 'PAID') {
    return Ticket.findAll({ where: { orderId: order.id } });
  }

  const registration = order.registration || (await Registration.findByPk(order.registrationId));

  const tickets = await sequelize.transaction(async (t) => {
    const isRazorpay = payment.provider === 'razorpay';
    await payment.update(
      {
        providerPaymentId: providerPaymentId || payment.providerPaymentId,
        providerSignature: providerSignature || payment.providerSignature,
        razorpayPaymentId: isRazorpay ? providerPaymentId : payment.razorpayPaymentId,
        razorpaySignature: isRazorpay ? providerSignature : payment.razorpaySignature,
        status: 'CAPTURED',
        method: method || payment.method || 'TEST_LOCAL',
        capturedAt: new Date(),
      },
      { transaction: t },
    );
    await order.update({ status: 'PAID' }, { transaction: t });
    await registration.update({ status: 'CONFIRMED' }, { transaction: t });

    return generateTicketsForOrder({ order, registration, transaction: t });
  });

  const customer = order.customer || (await Customer.findByPk(order.customerId));
  const [event, activity, ticketType, tenant] = await Promise.all([
    Event.findByPk(registration.eventId),
    registration.activityId ? Activity.findByPk(registration.activityId) : null,
    TicketType.findByPk(registration.ticketTypeId),
    Tenant.findByPk(order.tenantId),
  ]);

  await deliverTickets({ order, registration, customer, event, activity, ticketType, tenant, tickets });

  await recordAudit({
    tenantId: order.tenantId,
    action: AUDIT_ACTIONS.TICKETS_GENERATED,
    entityType: 'order',
    entityId: order.id,
    details: { orderRef: order.orderRef, ticketCount: tickets.length, paymentId: providerPaymentId, source },
    req,
  });

  return tickets;
}

/** Emails the tickets to the customer and a notification to the tenant. */
async function deliverTickets({ order, registration, customer, event, activity, ticketType, tenant, tickets }) {
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateTicketPdf({ event, activity, customer, tickets, orderRef: order.orderRef });
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
      activityTitle: activity?.title || null,
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
        activityTitle: activity?.title || null,
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
 * 3. Checkout Details & Retry
 * ------------------------------------------------------------------ */

export async function getCheckoutDetails(orderRef) {
  const order = await Order.findOne({
    where: { orderRef },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email', 'phone'] },
      { model: Payment, as: 'payment' },
      {
        model: Registration,
        as: 'registration',
        include: [
          {
            model: Event,
            as: 'event',
            attributes: ['id', 'title', 'slug', 'bannerUrl', 'eventDate', 'eventTimeStart', 'venueName', 'venueAddress'],
          },
          {
            model: Activity,
            as: 'activity',
            attributes: ['id', 'title', 'slug', 'venue', 'startsAt'],
          },
          {
            model: TicketType,
            as: 'ticketType',
            attributes: ['id', 'name', 'price', 'currency'],
          },
        ],
      },
    ],
  });

  if (!order) throw new NotFoundError('Order not found');

  return {
    orderRef: order.orderRef,
    orderId: order.id,
    status: order.status,
    amount: Number(order.amount),
    currency: order.currency,
    quantity: order.registration?.quantity || 1,
    paymentProvider: order.payment?.provider || (env.payments.isLocal ? 'local' : 'razorpay'),
    providerOrderId: order.payment?.providerOrderId || order.payment?.razorpayOrderId,
    customer: order.customer,
    event: order.registration?.event,
    activity: order.registration?.activity,
    ticketType: order.registration?.ticketType,
    payment: order.payment ? {
      id: order.payment.id,
      provider: order.payment.provider,
      providerOrderId: order.payment.providerOrderId,
      status: order.payment.status,
      method: order.payment.method,
      failedReason: order.payment.failedReason,
    } : null,
    createdAt: order.createdAt,
  };
}

export async function retryOrder(orderRef, req) {
  const order = await Order.findOne({
    where: { orderRef },
    include: [
      { model: Customer, as: 'customer' },
      { model: Payment, as: 'payment' },
      { model: Registration, as: 'registration' },
    ],
  });

  if (!order) throw new NotFoundError('Order not found');
  if (order.status === 'PAID') {
    throw new ConflictError('This order is already paid');
  }

  // If already pending or created, just return current checkout info
  if (['CREATED', 'PAYMENT_PENDING'].includes(order.status)) {
    return getCheckoutDetails(orderRef);
  }

  if (order.status !== 'FAILED') {
    throw new ConflictError(`Cannot retry order with status: ${order.status}`);
  }

  const registration = order.registration;
  if (!registration) throw new NotFoundError('Registration record not found for this order');

  const event = await Event.findByPk(registration.eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.status !== 'LIVE') throw new ConflictError('This event is no longer open for registration');
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new ConflictError('Registration deadline has passed');
  }

  const customer = order.customer;
  const quantity = registration.quantity;

  // Re-check inventory and re-reserve tickets
  await sequelize.transaction(async (t) => {
    const locked = await TicketType.findByPk(registration.ticketTypeId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!locked || !locked.isActive) {
      throw new ConflictError('The ticket type is no longer available');
    }
    if (locked.soldCount + quantity > locked.quantity) {
      throw new ConflictError('Not enough tickets remaining to retry this order');
    }
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
    await registration.update({ status: 'PAYMENT_PENDING' }, { transaction: t });
    await order.update({ status: 'PAYMENT_PENDING' }, { transaction: t });

    const providerResult = await paymentService.createPaymentOrder({
      order,
      registration,
      amount: Number(order.amount),
      currency: order.currency,
      customer,
      notes: { eventId: String(event.id), registrationRef: registration.registrationRef, retry: true },
    });

    if (order.payment) {
      await order.payment.update(
        {
          provider: providerResult.provider,
          providerOrderId: providerResult.providerOrderId,
          razorpayOrderId: providerResult.provider === 'razorpay' ? providerResult.providerOrderId : null,
          status: 'CREATED',
          failedReason: null,
          method: null,
        },
        { transaction: t },
      );
    } else {
      await Payment.create(
        {
          orderId: order.id,
          tenantId: order.tenantId,
          provider: providerResult.provider,
          providerOrderId: providerResult.providerOrderId,
          razorpayOrderId: providerResult.provider === 'razorpay' ? providerResult.providerOrderId : null,
          amount: order.amount,
          currency: order.currency,
          status: 'CREATED',
        },
        { transaction: t },
      );
    }
  });

  await recordAudit({
    tenantId: order.tenantId,
    action: AUDIT_ACTIONS.BOOKING_INITIATED,
    entityType: 'order',
    entityId: order.id,
    details: { orderRef: order.orderRef, retry: true },
    req,
  });

  return getCheckoutDetails(orderRef);
}

/* ------------------------------------------------------------------ *
 * 4. Confirmation (public, keyed by order reference)
 * ------------------------------------------------------------------ */

export async function getConfirmation(orderRef) {
  const order = await Order.findOne({
    where: { orderRef },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'email'] },
      { model: Payment, as: 'payment', attributes: ['id', 'status', 'method', 'provider'] },
      { model: Ticket, as: 'tickets' },
      {
        model: Registration,
        as: 'registration',
        include: [
          { model: Event, as: 'event', attributes: ['id', 'title', 'slug', 'eventDate', 'eventTimeStart', 'venueName', 'venueAddress', 'bannerUrl'] },
          { model: Activity, as: 'activity', attributes: ['id', 'title', 'slug', 'venue', 'startsAt'] },
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
    activity: order.registration?.activity,
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

export default {
  initiateBooking,
  verifyPayment,
  finalisePaidOrder,
  getCheckoutDetails,
  retryOrder,
  getConfirmation,
  getOrderPdfBuffer,
};
