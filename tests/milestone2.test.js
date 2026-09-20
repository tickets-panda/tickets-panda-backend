import http from 'http';
import app from '../src/app.js';
import prisma from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';

let server;
let baseUrl;

async function request(method, path, body = null, headers = {}) {
  const url = new URL(path, baseUrl);
  const options = {
    method,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : null;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: raw });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function pass(msg) {
  console.log(`  \x1b[32m✔ ${msg}\x1b[0m`);
}

function fail(msg, details = null) {
  console.error(`  \x1b[31m✖ ${msg}\x1b[0m`);
  if (details) console.error(JSON.stringify(details, null, 2));
  throw new Error(msg);
}

async function runMilestone2Suite() {
  console.log('\n--- Starting Ticket Panda Milestone 2 Deep Verification Suite ---');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // -----------------------------------------------------------------
    // SETUP: Tenant A and Tenant B
    // -----------------------------------------------------------------
    const passwordHash = await bcrypt.hash('Password123', 10);

    // Tenant A: Nehru College
    const tenantA = await prisma.tenant.findUnique({ where: { slug: 'nehru-college' } });
    if (!tenantA) throw new Error('Tenant A (Nehru College) not seeded');

    const loginResA = await request('POST', '/api/v1/auth/login', {
      email: 'admin@nehru-college.edu',
      password: 'Password123',
    });
    const tokenA = loginResA.data?.data?.accessToken;
    if (!tokenA) throw new Error('Failed to log in as Tenant A Admin');

    // Tenant B: St. Xavier's College (isolated workspace)
    let tenantB = await prisma.tenant.findUnique({ where: { slug: 'st-xaviers' } });
    let userB = await prisma.user.findUnique({ where: { email: 'admin@st-xaviers.edu' } });

    if (!userB) {
      userB = await prisma.user.create({
        data: {
          name: 'St. Xaviers Admin',
          email: 'admin@st-xaviers.edu',
          passwordHash,
        },
      });
    }

    if (!tenantB) {
      tenantB = await prisma.tenant.create({
        data: {
          name: "St. Xavier's Autonomous College",
          slug: 'st-xaviers',
          email: 'admin@st-xaviers.edu',
          status: 'ACTIVE',
          subscriptionPlan: 'BUSINESS',
        },
      });

      await prisma.tenantMember.create({
        data: {
          userId: userB.id,
          tenantId: tenantB.id,
          role: 'TENANT_OWNER',
          isActive: true,
        },
      });
    }

    // Tenant B Event & Ticket Type
    const eventBDate = new Date();
    eventBDate.setDate(eventBDate.getDate() + 20);

    let eventB = await prisma.event.findFirst({ where: { tenantId: tenantB.id, slug: 'xavfest-2026' } });
    if (!eventB) {
      eventB = await prisma.event.create({
        data: {
          tenantId: tenantB.id,
          title: 'XavFest 2026',
          slug: 'xavfest-2026',
          status: 'LIVE',
          eventDate: eventBDate,
          eventTimeStart: '10:00:00',
          venueName: 'Xavier Hall',
        },
      });
    }

    let ticketTypeB = await prisma.ticketType.findFirst({ where: { eventId: eventB.id } });
    if (!ticketTypeB) {
      ticketTypeB = await prisma.ticketType.create({
        data: {
          tenantId: tenantB.id,
          eventId: eventB.id,
          name: 'Xavier Pass',
          price: 100,
          quantity: 10,
          minPerOrder: 1,
          maxPerOrder: 1,
        },
      });
    }

    // Create a customer, registration, order, payment, and ticket for Tenant B
    let customerB = await prisma.customer.findFirst({ where: { email: 'buyer-b@example.com' } });
    if (!customerB) {
      customerB = await prisma.customer.create({
        data: { name: 'Buyer B', email: 'buyer-b@example.com' },
      });
    }

    const regB = await prisma.registration.create({
      data: {
        tenantId: tenantB.id,
        eventId: eventB.id,
        ticketTypeId: ticketTypeB.id,
        customerId: customerB.id,
        registrationRef: `TP-REG-TB-${Date.now()}`,
        quantity: 1,
        status: 'CONFIRMED',
      },
    });

    const orderB = await prisma.order.create({
      data: {
        tenantId: tenantB.id,
        registrationId: regB.id,
        customerId: customerB.id,
        orderRef: `TP-ORD-TB-${Date.now()}`,
        amount: 100,
        status: 'PAID',
      },
    });

    const paymentB = await prisma.payment.create({
      data: {
        tenantId: tenantB.id,
        orderId: orderB.id,
        provider: 'local',
        providerPaymentId: `PAY-TB-${Date.now()}`,
        amount: 100,
        status: 'CAPTURED',
      },
    });

    const ticketB = await prisma.ticket.create({
      data: {
        tenantId: tenantB.id,
        eventId: eventB.id,
        orderId: orderB.id,
        registrationId: regB.id,
        customerId: customerB.id,
        ticketTypeId: ticketTypeB.id,
        ticketKey: `TP-KEY-TB-${Date.now()}`,
        verificationToken: `vtok-tb-${Date.now()}`,
        status: 'ACTIVE',
        qrData: 'data:image/png;base64,mockqr',
      },
    });

    console.log('\n--- SECTION 1: STRICT MULTI-TENANT ISOLATION TESTS ---');

    // 1. Tenant A cannot read Tenant B's event
    const readEventRes = await request('GET', `/api/v1/tenant/events/${eventB.id}`, null, {
      Authorization: `Bearer ${tokenA}`,
    });
    if (readEventRes.status === 404) {
      pass('1. Tenant A cannot read Tenant B events (404 Not Found enforced)');
    } else {
      fail('1. Tenant A was able to read Tenant B event!', readEventRes);
    }

    // 2. Tenant A cannot update Tenant B's event
    const updateEventRes = await request('PUT', `/api/v1/tenant/events/${eventB.id}`, { title: 'Hacked Title' }, {
      Authorization: `Bearer ${tokenA}`,
    });
    if (updateEventRes.status === 404) {
      pass('2. Tenant A cannot update Tenant B events (404 Not Found enforced)');
    } else {
      fail('2. Tenant A was able to update Tenant B event!', updateEventRes);
    }

    // 3. Tenant A cannot read Tenant B's registrations
    const readRegRes = await request('GET', `/api/v1/tenant/registrations/${regB.id}`, null, {
      Authorization: `Bearer ${tokenA}`,
    });
    if (readRegRes.status === 404) {
      pass('3. Tenant A cannot read Tenant B registrations (404 Not Found enforced)');
    } else {
      fail('3. Tenant A was able to read Tenant B registration!', readRegRes);
    }

    // 4. Tenant A cannot read Tenant B's ticket
    const readTicketRes = await request('GET', `/api/v1/tenant/tickets/${ticketB.id}`, null, {
      Authorization: `Bearer ${tokenA}`,
    });
    if (readTicketRes.status === 404) {
      pass('4. Tenant A cannot read Tenant B tickets (404 Not Found enforced)');
    } else {
      fail('4. Tenant A was able to read Tenant B ticket!', readTicketRes);
    }

    // 5. Tenant A staff cannot verify Tenant B's ticket key
    const verifyCrossRes = await request('POST', '/api/v1/staff/verify', { ticketKey: ticketB.ticketKey }, {
      Authorization: `Bearer ${tokenA}`,
    });
    if (verifyCrossRes.status === 200 && verifyCrossRes.data?.data?.valid === false && verifyCrossRes.data?.data?.result === 'NOT_FOUND') {
      pass('5. Tenant A staff cannot verify Tenant B ticket key (rejected with valid: false, result: NOT_FOUND)');
    } else {
      fail('5. Tenant A staff was able to verify Tenant B ticket!', verifyCrossRes);
    }

    // 6. Tenant A staff cannot check in Tenant B's ticket key
    const checkinCrossRes = await request('POST', '/api/v1/staff/checkin', {
      ticketKey: ticketB.ticketKey,
      gateName: 'Gate 1',
    }, {
      Authorization: `Bearer ${tokenA}`,
    });
    if (checkinCrossRes.status === 404) {
      pass('6. Tenant A staff cannot check in Tenant B ticket key (404 Not Found)');
    } else {
      fail('6. Tenant A staff was able to check in Tenant B ticket!', checkinCrossRes);
    }

    // 7. Tenant A dashboard analytics does not leak Tenant B data
    const tenantAStats = await request('GET', '/api/v1/tenant/dashboard/stats', null, {
      Authorization: `Bearer ${tokenA}`,
    });
    const tenantAEventsCount = await prisma.event.count({ where: { tenantId: tenantA.id } });
    if (tenantAStats.status === 200 && tenantAStats.data?.data?.totalEvents === tenantAEventsCount) {
      pass('7. Tenant A dashboard stats accurately isolates events & metrics (Tenant B data excluded)');
    } else {
      fail('7. Tenant analytics leaked foreign tenant data!', tenantAStats);
    }

    console.log('\n--- SECTION 2: LOCAL TEST PAYMENT PROVIDER LIFECYCLE ---');

    // Find a valid ticket type under Tenant A
    const eventA = await prisma.event.findFirst({ where: { tenantId: tenantA.id, slug: 'pandaves-2026' } });
    const ticketTypeA = await prisma.ticketType.findFirst({ where: { eventId: eventA.id, isActive: true } });
    const formFieldsA = await prisma.registrationForm.findMany({ where: { eventId: eventA.id } });
    const formDataA = {};
    for (const f of formFieldsA) formDataA[String(f.id)] = 'Test ' + f.fieldName;

    // 8. Booking Initiation
    const initRes = await request('POST', '/api/v1/booking/initiate', {
      eventId: eventA.id,
      ticketTypeId: ticketTypeA.id,
      quantity: 1,
      customer: {
        name: 'Payment Test User',
        email: 'paytest@example.com',
        phone: '+919876543210',
      },
      formData: formDataA,
    });
    if (initRes.status !== 201 || !initRes.data?.data?.orderRef) {
      fail('8. Booking initiation failed', initRes);
    }
    pass('8. Booking initiated successfully');
    const orderRef = initRes.data.data.orderRef;

    // 9. Payment Simulation: FAILED
    const failRes = await request('POST', '/api/v1/booking/verify-payment', {
      orderRef,
      simulationState: 'FAILED',
      failureReason: 'User cancelled UPI prompt',
    });
    if (failRes.status === 400 && failRes.data?.data?.status === 'FAILED' && failRes.data?.data?.canRetry) {
      pass('9. Payment simulation FAILED handled correctly with canRetry: true');
    } else {
      fail('9. FAILED payment simulation did not return 400 with retry status', failRes);
    }

    // 10. Payment Retry
    const retryRes = await request('POST', '/api/v1/booking/retry-payment', { orderRef });
    const retryStatus = retryRes.data?.data?.status || retryRes.data?.data?.order?.status;
    if (retryRes.status === 200 && (retryStatus === 'PAYMENT_PENDING' || retryStatus === 'PENDING')) {
      pass('10. Order payment successfully reset for retry (status PAYMENT_PENDING)');
    } else {
      fail('10. Retry payment failed', retryRes);
    }

    // 11. Payment Simulation: PENDING
    const pendRes = await request('POST', '/api/v1/booking/verify-payment', {
      orderRef,
      simulationState: 'PENDING',
    });
    if (pendRes.status === 200 && pendRes.data?.data?.status === 'PENDING') {
      pass('11. Payment simulation PENDING handled correctly');
    } else {
      fail('11. PENDING payment simulation failed', pendRes);
    }

    // 12. Payment Simulation: SUCCESS
    const succRes = await request('POST', '/api/v1/booking/verify-payment', {
      orderRef,
      simulationState: 'SUCCESS',
      method: 'TEST_LOCAL_UPI',
    });
    if (succRes.status === 200 && succRes.data?.data?.status === 'PAID' && succRes.data?.data?.tickets?.length === 1) {
      pass('12. Payment simulation SUCCESS verified: Order PAID and ticket issued');
    } else {
      fail('12. SUCCESS payment simulation failed', succRes);
    }

    // 13. Idempotent Duplicate Payment Verification
    const dupRes = await request('POST', '/api/v1/booking/verify-payment', {
      orderRef,
      simulationState: 'SUCCESS',
      method: 'TEST_LOCAL_UPI',
    });
    if (dupRes.status === 200 && dupRes.data?.data?.alreadyProcessed === true && dupRes.data?.data?.tickets?.length === 1) {
      pass('13. Duplicate payment verification is idempotent (alreadyProcessed: true, zero duplicate tickets)');
    } else {
      fail('13. Duplicate payment verification failed idempotency test', dupRes);
    }

    console.log('\n--- SECTION 3: CHECK-IN CONCURRENCY & ANTI-PASSBACK ---');

    const testTicket = succRes.data.data.tickets[0];

    // 14. Two simultaneous check-ins for the same ticket
    const [scanA, scanB] = await Promise.all([
      request('POST', '/api/v1/staff/checkin', { ticketKey: testTicket.ticketKey, gateName: 'Gate North' }, {
        Authorization: `Bearer ${tokenA}`,
      }),
      request('POST', '/api/v1/staff/checkin', { ticketKey: testTicket.ticketKey, gateName: 'Gate South' }, {
        Authorization: `Bearer ${tokenA}`,
      }),
    ]);

    const statuses = [scanA.status, scanB.status].sort();
    if (statuses[0] === 200 && statuses[1] === 409) {
      pass('14. Check-in concurrency verified: Exactly 1 success (200) and 1 duplicate rejected (409 Conflict)');
    } else {
      fail('14. Simultaneous check-in failed concurrency test!', { scanA, scanB });
    }

    console.log('\n--- SECTION 4: CAPACITY CONCURRENCY ROW-LOCKING TEST ---');

    // Create a special TicketType with quantity: 1
    const scarceTicketType = await prisma.ticketType.create({
      data: {
        tenantId: tenantA.id,
        eventId: eventA.id,
        name: `Ultra VIP Pass (Qty 1) - ${Date.now()}`,
        price: 500,
        quantity: 1,
        soldCount: 0,
        minPerOrder: 1,
        maxPerOrder: 1,
      },
    });

    // Initiate 2 concurrent bookings for this single capacity ticket
    const [orderRes1, orderRes2] = await Promise.all([
      request('POST', '/api/v1/booking/initiate', {
        eventId: eventA.id,
        ticketTypeId: scarceTicketType.id,
        quantity: 1,
        customer: { name: 'Buyer 1', email: 'buyer1@example.com' },
        formData: formDataA,
      }),
      request('POST', '/api/v1/booking/initiate', {
        eventId: eventA.id,
        ticketTypeId: scarceTicketType.id,
        quantity: 1,
        customer: { name: 'Buyer 2', email: 'buyer2@example.com' },
        formData: formDataA,
      }),
    ]);

    const initStatuses = [orderRes1.status, orderRes2.status].sort();
    const refreshedTicketType = await prisma.ticketType.findUnique({ where: { id: scarceTicketType.id } });

    if (initStatuses[0] === 201 && initStatuses[1] === 409 && refreshedTicketType.soldCount === 1) {
      pass('15. Capacity row-locking verified: Two concurrent registrations against capacity = 1 yielded exactly 1 success (201) and 1 rejection (409)');
    } else {
      fail('15. Capacity race condition failed!', {
        initStatuses,
        soldCount: refreshedTicketType.soldCount,
        res1: orderRes1.data,
        res2: orderRes2.data,
      });
    }

    // Now complete payment for the winning order
    const winningOrder = orderRes1.status === 201 ? orderRes1.data.data : orderRes2.data.data;
    const payWinningRes = await request('POST', '/api/v1/booking/verify-payment', {
      orderRef: winningOrder.orderRef,
      simulationState: 'SUCCESS',
      method: 'TEST_LOCAL_UPI',
    });

    const finalTicketCount = await prisma.ticket.count({ where: { ticketTypeId: scarceTicketType.id } });
    if (payWinningRes.status === 200 && finalTicketCount === 1) {
      pass('16. Winning reservation successfully issued exactly 1 ticket pass (zero overselling)');
    } else {
      fail('16. Winning order payment verification failed', payWinningRes);
    }

    console.log('\n\x1b[32m✔ ALL MILESTONE 2 DEEP VERIFICATION TESTS PASSED WITH ZERO REGRESSIONS!\x1b[0m\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  }
}

runMilestone2Suite().catch((err) => {
  console.error('\nMilestone 2 suite execution failed:', err);
  process.exit(1);
});
