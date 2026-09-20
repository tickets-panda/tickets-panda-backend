import dotenv from 'dotenv';
dotenv.config();

import { sequelize, Event, TicketType, Tenant, Customer, Order, Payment, Registration, Ticket, Checkin, Activity } from '../src/database/models/index.js';
import * as paymentService from '../src/modules/payments/payment.service.js';
import * as bookingService from '../src/modules/booking/booking.service.js';
import * as verificationService from '../src/modules/verification/verification.service.js';
import { env } from '../src/config/env.js';

let failed = false;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${message}`);
    failed = true;
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('====================================================');
  console.log('🐼 TICKET PANDA LOCAL TEST PAYMENT SYSTEM VERIFICATION');
  console.log('====================================================\n');

  await sequelize.authenticate();
  console.log('Database connected successfully.\n');

  // 1. Check Active Provider
  console.log('STEP 1: Provider Architecture Check');
  const provider = paymentService.getPaymentProvider();
  assert(provider.name === 'local', `Provider name must be 'local', got '${provider.name}'`);
  assert(env.payments.isLocal === true, 'env.payments.isLocal must be true');

  // 2. Check Production Safety Guard
  console.log('\nSTEP 2: Production Safety Guard Check');
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    let threw = false;
    try {
      provider.assertNotProduction();
    } catch (err) {
      threw = true;
      assert(err.status === 403 || err.statusCode === 403 || err.name === 'ForbiddenError', 'Must throw ForbiddenError in production');
    }
    assert(threw, 'Provider must strictly forbid execution when NODE_ENV=production');
  } finally {
    process.env.NODE_ENV = originalEnv || 'development';
  }

  // 3. Find or Create Demo Tenant, Event, Activity, TicketType
  console.log('\nSTEP 3: Preparing Test Fixture Data');
  let tenant = await Tenant.findOne({ where: { slug: 'acme-live' } });
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Acme Live Events',
      slug: 'acme-live',
      email: 'organizer@acmelive.com',
      status: 'ACTIVE',
      subscriptionPlan: 'BUSINESS',
    });
  }

  let event = await Event.findOne({ where: { tenantId: tenant.id, status: 'LIVE' } });
  if (!event) {
    event = await Event.create({
      tenantId: tenant.id,
      title: 'Global Tech Summit 2026',
      slug: 'global-tech-summit-2026',
      status: 'LIVE',
      eventDate: '2026-11-15',
      eventTimeStart: '09:00:00',
      venueName: 'Grand Hall',
      maxCapacity: 500,
    });
  }

  let activity = await Activity.findOne({ where: { eventId: event.id } });
  if (!activity) {
    activity = await Activity.create({
      tenantId: tenant.id,
      eventId: event.id,
      slug: 'ai-keynote',
      title: 'AI & Robotics Keynote',
      status: 'PUBLISHED',
      capacity: 200,
    });
  }

  let ticketType = await TicketType.findOne({ where: { eventId: event.id, isActive: true } });
  if (!ticketType) {
    ticketType = await TicketType.create({
      tenantId: tenant.id,
      eventId: event.id,
      activityId: activity.id,
      name: 'General Admission',
      price: 499.00,
      currency: 'INR',
      quantity: 100,
      soldCount: 0,
      minPerOrder: 1,
      maxPerOrder: 10,
      isActive: true,
    });
  }

  console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`  Event: ${event.title}`);
  console.log(`  Activity: ${activity.title}`);
  console.log(`  TicketType: ${ticketType.name} (Price: ${ticketType.price} ${ticketType.currency})`);

  // 4. Test Full Success Flow & Idempotency & Check-in
  console.log('\nSTEP 4: Test Full Successful Payment & Check-in Lifecycle');
  const initialSoldCount = ticketType.soldCount;

  const bookingRes = await bookingService.initiateBooking({
    eventId: event.id,
    activityId: activity.id,
    ticketTypeId: ticketType.id,
    quantity: 1,
    customer: {
      name: 'John Doe',
      email: 'johndoe.test@example.com',
      phone: '+91 9876543210',
    },
    formData: {},
  });

  assert(bookingRes.paymentProvider === 'local', 'Booking response returns paymentProvider=local');
  assert(bookingRes.providerOrderId.startsWith('local_ord_'), `ProviderOrderId must start with 'local_ord_', got: ${bookingRes.providerOrderId}`);
  assert(bookingRes.checkoutUrl.includes(`/checkout/local/${bookingRes.orderRef}`), 'Booking response provides local checkout URL');

  // Checkout details check
  const checkoutDetails = await bookingService.getCheckoutDetails(bookingRes.orderRef);
  assert(checkoutDetails.orderRef === bookingRes.orderRef, 'Checkout details orderRef matches');
  assert(checkoutDetails.amount === 499, 'Checkout details amount matches');
  assert(checkoutDetails.status === 'PAYMENT_PENDING' || checkoutDetails.status === 'CREATED', 'Initial order status is pending');
  assert(checkoutDetails.payment.provider === 'local', 'Payment record provider is local');

  // Simulate Success Payment
  const verifySuccessRes = await bookingService.verifyPayment({
    orderRef: bookingRes.orderRef,
    simulationState: 'SUCCESS',
    method: 'UPI_SIMULATED',
  });

  assert(verifySuccessRes.status === 'PAID', 'Order status is PAID');
  assert(verifySuccessRes.tickets && verifySuccessRes.tickets.length === 1, 'Exactly 1 ticket generated');
  assert(verifySuccessRes.alreadyProcessed === false, 'First verification alreadyProcessed is false');

  const generatedTicket = verifySuccessRes.tickets[0];
  assert(Boolean(generatedTicket.ticketKey), `Generated ticketKey exists: ${generatedTicket.ticketKey}`);
  assert(Boolean(generatedTicket.qrData), 'QR data URI generated');

  // Verify PDF ticket buffer
  const pdfRes = await bookingService.getOrderPdfBuffer(bookingRes.orderRef);
  assert(pdfRes.pdfBuffer && pdfRes.pdfBuffer.length > 0, 'PDF ticket buffer successfully generated');

  // Test Idempotency
  console.log('\nSTEP 5: Testing Idempotency on Repeated Success Verification');
  const idempotentRes = await bookingService.verifyPayment({
    orderRef: bookingRes.orderRef,
    simulationState: 'SUCCESS',
  });

  assert(idempotentRes.status === 'PAID', 'Idempotent verification returns PAID');
  assert(idempotentRes.alreadyProcessed === true, 'Idempotent call sets alreadyProcessed=true');
  assert(idempotentRes.tickets.length === 1, 'Does not duplicate tickets on repeated verify');
  assert(idempotentRes.tickets[0].ticketKey === generatedTicket.ticketKey, 'Same ticket key returned');

  // Test Gate Verification and Check-in
  console.log('\nSTEP 6: Testing Gate Verification & Check-in with Generated Ticket');
  const staffUser = { id: 1, tenantId: tenant.id, role: 'CHECKIN_STAFF' };
  const scanPreview = await verificationService.verifyTicket(staffUser, [], { ticketKey: generatedTicket.ticketKey });
  assert(scanPreview.valid === true, 'Ticket scans as VALID at the gate');
  assert(scanPreview.status === 'ACTIVE', 'Ticket status before check-in is ACTIVE');

  // Check-in
  const checkinRes = await verificationService.checkIn(staffUser, [], { ticketKey: generatedTicket.ticketKey });
  assert(checkinRes.result === 'CHECKED_IN', 'Ticket checked in successfully');
  assert(checkinRes.status === 'USED', 'Ticket status updated to USED');

  // Prevent double entry
  let doubleEntryPrevented = false;
  try {
    await verificationService.checkIn(staffUser, [], { ticketKey: generatedTicket.ticketKey });
  } catch (err) {
    doubleEntryPrevented = true;
    assert(err.status === 409 || err.statusCode === 409, 'Double check-in throws 409 Conflict');
  }
  assert(doubleEntryPrevented, 'Double gate entry was prevented');

  // 7. Test Failed Payment & Inventory Release & Retry Mechanism
  console.log('\nSTEP 7: Testing Payment Failure, Inventory Release & Retry Mechanism');
  await ticketType.reload();
  const soldBeforeFailTest = ticketType.soldCount;

  const failBooking = await bookingService.initiateBooking({
    eventId: event.id,
    activityId: activity.id,
    ticketTypeId: ticketType.id,
    quantity: 2,
    customer: {
      name: 'Jane Smith',
      email: 'janesmith.test@example.com',
      phone: '+91 9123456780',
    },
  });

  await ticketType.reload();
  assert(ticketType.soldCount === soldBeforeFailTest + 2, '2 tickets held upon booking initiation');

  // Simulate Failure
  const failRes = await bookingService.verifyPayment({
    orderRef: failBooking.orderRef,
    simulationState: 'FAILED',
    failureReason: 'Insufficient simulated test balance',
  });

  assert(failRes.status === 'FAILED', 'Order status marked FAILED');
  assert(failRes.canRetry === true, 'Failed order marked as canRetry=true');

  await ticketType.reload();
  assert(ticketType.soldCount === soldBeforeFailTest, 'Held capacity immediately released upon payment failure');

  const failedOrder = await Order.findOne({ where: { orderRef: failBooking.orderRef } });
  assert(failedOrder.status === 'FAILED', 'Order status in DB is FAILED');

  const failedReg = await Registration.findByPk(failedOrder.registrationId);
  assert(failedReg.status === 'CANCELLED', 'Registration status in DB is CANCELLED');

  // Retry Order
  console.log('\nSTEP 8: Retrying the Failed Order');
  const retryRes = await bookingService.retryOrder(failBooking.orderRef);
  assert(retryRes.status === 'PAYMENT_PENDING', 'Order status restored to PAYMENT_PENDING');

  await ticketType.reload();
  assert(ticketType.soldCount === soldBeforeFailTest + 2, 'Capacity re-reserved on retry');

  // Now simulate successful payment on retried order
  const retryPayRes = await bookingService.verifyPayment({
    orderRef: failBooking.orderRef,
    simulationState: 'SUCCESS',
  });

  assert(retryPayRes.status === 'PAID', 'Retried order successfully paid');
  assert(retryPayRes.tickets.length === 2, '2 tickets generated for retried order');

  // 8. Test Pending Payment State
  console.log('\nSTEP 9: Testing Pending Payment Simulation');
  const pendingBooking = await bookingService.initiateBooking({
    eventId: event.id,
    activityId: activity.id,
    ticketTypeId: ticketType.id,
    quantity: 1,
    customer: {
      name: 'Bob Pending',
      email: 'bob.pending@example.com',
    },
  });

  const pendingRes = await bookingService.verifyPayment({
    orderRef: pendingBooking.orderRef,
    simulationState: 'PENDING',
  });

  assert(pendingRes.status === 'PENDING', 'Returns status PENDING');
  const pendingPayment = await Payment.findOne({ where: { orderId: pendingBooking.orderId } });
  assert(pendingPayment.status === 'PENDING', 'Payment record status is PENDING in DB');

  // Confirm pending can subsequently succeed
  const pendingSuccessRes = await bookingService.verifyPayment({
    orderRef: pendingBooking.orderRef,
    simulationState: 'SUCCESS',
  });
  assert(pendingSuccessRes.status === 'PAID', 'Pending order transitions to PAID on success');

  console.log('\n====================================================');
  console.log('🎉 ALL 9 LOCAL PAYMENT & TICKETING SUITES PASSED 100%!');
  console.log('====================================================');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  });
