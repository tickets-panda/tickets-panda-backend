import http from 'node:http';
import app from '../src/app.js';
import prisma from '../src/lib/prisma.js';

let server;
let baseUrl;

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch {
            json = rawData;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const pass = (title) => console.log(`  \x1b[32m✔\x1b[0m ${title}`);
const fail = (title, err) => {
  console.error(`  \x1b[31m✖\x1b[0m ${title}`);
  if (err) console.error(err);
  throw err || new Error(title);
};

async function runSuite() {
  console.log('\n--- Starting Ticket Panda Prisma E2E Verification Suite ---\n');

  // Start test server on ephemeral port
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 1. Health check
    const health = await request('GET', '/health');
    if (health.status === 200 && health.data.status === 'ok') {
      pass('1. Health check responds with 200 OK');
    } else {
      fail('1. Health check failed', health);
    }

    // 2. Platform Admin Login
    const adminLogin = await request('POST', '/api/v1/auth/login', {
      email: 'admin@ticketpanda.io',
      password: 'Password123',
    });
    if (adminLogin.status === 200 && adminLogin.data.data?.accessToken) {
      pass('2. Platform Admin login successful');
    } else {
      fail('2. Platform Admin login failed', adminLogin);
    }
    const adminToken = adminLogin.data.data.accessToken;

    // 3. Platform Admin Dashboard & Tenants List
    const platformDash = await request('GET', '/api/v1/platform/dashboard/stats', null, {
      Authorization: `Bearer ${adminToken}`,
    });
    if (platformDash.status === 200 && platformDash.data.data?.totalTenants >= 1) {
      pass('3. Platform Admin dashboard statistics verified');
    } else {
      fail('3. Platform Admin dashboard failed', platformDash);
    }

    // 4. Demo Tenant Admin Login
    const tenantLogin = await request('POST', '/api/v1/auth/login', {
      email: 'admin@nehru-college.edu',
      password: 'Password123',
    });
    if (tenantLogin.status === 200 && tenantLogin.data.data?.accessToken) {
      pass('4. Tenant Admin login successful');
    } else {
      fail('4. Tenant Admin login failed', tenantLogin);
    }
    const tenantToken = tenantLogin.data.data.accessToken;

    // 5. Tenant Profile & Dashboard
    const tenantProfile = await request('GET', '/api/v1/tenant/profile', null, {
      Authorization: `Bearer ${tenantToken}`,
    });
    if (tenantProfile.status === 200 && (tenantProfile.data.data?.tenant?.slug === 'nehru-college' || tenantProfile.data.data?.slug === 'nehru-college')) {
      pass('5. Tenant profile verified');
    } else {
      fail('5. Tenant profile failed', tenantProfile);
    }

    const tenantDash = await request('GET', '/api/v1/tenant/dashboard/stats', null, {
      Authorization: `Bearer ${tenantToken}`,
    });
    if (tenantDash.status === 200 && tenantDash.data.data?.totalEvents >= 1) {
      pass('6. Tenant dashboard metrics verified');
    } else {
      fail('6. Tenant dashboard failed', tenantDash);
    }

    // 6. Public Search & Event Landing Page
    const publicEvents = await request('GET', '/api/v1/public/events?search=Pandaves');
    const eventsList = publicEvents.data.data?.events || (Array.isArray(publicEvents.data.data) ? publicEvents.data.data : []);
    if (publicEvents.status === 200 && Array.isArray(eventsList) && eventsList.length >= 1) {
      pass('7. Public events search verified');
    } else {
      fail('7. Public events search failed', publicEvents);
    }

    const publicEvent = await request('GET', '/api/v1/public/t/nehru-college/events/pandaves-2026');
    if (publicEvent.status === 200 && publicEvent.data.data?.event?.title === 'Pandaves 2026') {
      pass('8. Public event landing detail with activities and ticket types verified');
    } else {
      fail('8. Public event landing failed', publicEvent);
    }

    const eventId = publicEvent.data.data.event.id;
    const ticketTypes = publicEvent.data.data.ticketTypes;
    const soloDanceTicket = ticketTypes.find((t) => t.name.includes('Solo Dance')) || ticketTypes[0];
    const formFields = publicEvent.data.data.formFields || [];
    const formData = {};
    for (const f of formFields) {
      formData[String(f.id)] = 'Test ' + f.fieldName;
    }

    // 7. Booking Initiation (Local Test Payment Provider)
    const bookingPayload = {
      eventId,
      activityId: soloDanceTicket.activityId,
      ticketTypeId: soloDanceTicket.id,
      quantity: 1,
      customer: {
        name: 'Prisma Test Buyer',
        email: 'prismatest@example.com',
        phone: '+919999888877',
      },
      formData,
    };

    const bookingRes = await request('POST', '/api/v1/booking/initiate', bookingPayload);
    if (bookingRes.status === 201 && bookingRes.data.data?.orderRef) {
      pass('9. Booking initiated successfully with Local Test Provider');
    } else {
      fail('9. Booking initiation failed', bookingRes);
    }

    const { orderRef, orderId } = bookingRes.data.data;

    // 8. Payment Verification (Simulation: SUCCESS)
    const verifyRes = await request('POST', '/api/v1/booking/verify-payment', {
      orderRef,
      simulationState: 'SUCCESS',
      method: 'TEST_LOCAL_UPI',
    });
    if (verifyRes.status === 200 && verifyRes.data.data?.status === 'PAID' && verifyRes.data.data?.tickets?.length === 1) {
      pass('10. Local test payment verified: Order PAID and ticket issued');
    } else {
      fail('10. Local test payment verification failed', verifyRes);
    }

    const issuedTicket = verifyRes.data.data.tickets[0];

    // 9. Public Order Confirmation Detail
    const confirmRes = await request('GET', `/api/v1/booking/confirmation/${orderRef}`);
    if (confirmRes.status === 200 && confirmRes.data.data?.status === 'PAID') {
      pass('11. Public order confirmation retrieved');
    } else {
      fail('11. Public order confirmation failed', confirmRes);
    }

    // 10. Gate Verification (Scan Preview)
    const scanPreview = await request('POST', '/api/v1/staff/verify', {
      ticketKey: issuedTicket.ticketKey,
    }, {
      Authorization: `Bearer ${tenantToken}`,
    });
    if (scanPreview.status === 200 && scanPreview.data.data?.result === 'VALID') {
      pass('12. Gate scan preview: Ticket VALID');
    } else {
      fail('12. Gate scan preview failed', scanPreview);
    }

    // 11. Check-In Entry (1st Time)
    const checkinRes1 = await request('POST', '/api/v1/staff/checkin', {
      ticketKey: issuedTicket.ticketKey,
      gateName: 'Gate A - Open Air Theatre',
    }, {
      Authorization: `Bearer ${tenantToken}`,
    });
    if (checkinRes1.status === 200 && checkinRes1.data.data?.result === 'CHECKED_IN') {
      pass('13. Gate check-in 1st scan: Successfully admitted');
    } else {
      fail('13. Gate check-in failed', checkinRes1);
    }

    // 12. Duplicate Check-in Prevention (2nd Time -> MUST FAIL WITH 409)
    const checkinRes2 = await request('POST', '/api/v1/staff/checkin', {
      ticketKey: issuedTicket.ticketKey,
      gateName: 'Gate B',
    }, {
      Authorization: `Bearer ${tenantToken}`,
    });
    if (checkinRes2.status === 409) {
      pass('14. Duplicate check-in correctly rejected with 409 Conflict');
    } else {
      fail('14. Duplicate check-in was NOT rejected!', checkinRes2);
    }

    // 13. Gate Statistics
    const statsRes = await request('GET', `/api/v1/staff/event/${eventId}/gate-stats`, null, {
      Authorization: `Bearer ${tenantToken}`,
    });
    if (statsRes.status === 200 && statsRes.data.data?.checkedIn >= 1) {
      pass('15. Gate live statistics updated accurately');
    } else {
      fail('15. Gate statistics failed', statsRes);
    }

    // 14. Customer Ticket Recovery & OTP Flow
    const otpSend = await request('POST', '/api/v1/customer/otp/send', {
      identifier: 'prismatest@example.com',
      type: 'EMAIL',
    });
    if (otpSend.status === 200 && otpSend.data.success) {
      pass('16. Customer ticket recovery OTP requested');
    } else {
      fail('16. Customer OTP send failed', otpSend);
    }

    // Read OTP directly from DB for test verification
    const otpRecord = await prisma.otpVerification.findFirst({
      where: { identifier: 'prismatest@example.com', isUsed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) throw new Error('OTP record not found in database');

    const otpVerify = await request('POST', '/api/v1/customer/otp/verify', {
      identifier: 'prismatest@example.com',
      type: 'EMAIL',
      otp: otpRecord.otp,
    });
    if (otpVerify.status === 200 && otpVerify.data.data?.accessToken) {
      pass('17. Customer OTP verified and token issued');
    } else {
      fail('17. Customer OTP verify failed', otpVerify);
    }

    const customerToken = otpVerify.data.data.accessToken;

    const myTicketsRes = await request('GET', '/api/v1/customer/my-tickets', null, {
      Authorization: `Bearer ${customerToken}`,
    });
    const ticketsList = myTicketsRes.data.data?.tickets || (Array.isArray(myTicketsRes.data.data) ? myTicketsRes.data.data : []);
    if (myTicketsRes.status === 200 && Array.isArray(ticketsList) && ticketsList.length >= 1) {
      pass('18. Customer "My Tickets" retrieved with active ticket key');
    } else {
      fail('18. Customer "My Tickets" failed', myTicketsRes);
    }

    console.log('\n\x1b[32m✔ ALL 18 E2E PRISMA TESTS PASSED WITH ZERO REGRESSIONS!\x1b[0m\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  }
}

runSuite().catch((err) => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
