import { connectDatabase, sequelize } from '../src/config/database.js';
import {
  Tenant,
  Event,
  Activity,
  TicketType,
  RegistrationForm,
  Registration,
  Customer,
  Order,
  Ticket,
  Checkin,
  User,
} from '../src/database/models/index.js';
import { generateTicketPdf } from '../src/modules/tickets/ticketPdf.service.js';
import { verifyTicket, checkIn } from '../src/modules/verification/verification.service.js';
import { generateTicketKey, generateVerificationToken, generateOrderRef, generateRegistrationRef } from '../src/utils/generators.js';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log('====================================================');
  console.log('TICKET PANDA — MASTER SYSTEM VERIFICATION');
  console.log('====================================================\n');

  // 1. Database connection & models
  console.log('Step 1: Database & Model Hierarchy Verification');
  await connectDatabase();
  assert(true, 'Database connected successfully');

  // Verify Nehru College Tenant
  const tenant = await Tenant.findOne({ where: { slug: 'nehru-college' } });
  assert(tenant !== null, `Demo Tenant found: "${tenant?.name}" (slug: ${tenant?.slug})`);
  assert(tenant?.category === 'COLLEGE', 'Tenant category is COLLEGE');

  // Verify Event: Pandaves 2026
  const event = await Event.findOne({ where: { tenantId: tenant.id, slug: 'pandaves-2026' } });
  assert(event !== null, `Festival Event found: "${event?.title}" (status: ${event?.status})`);

  // Verify Activities: Solo Dance, Solo Singing, Group Dance, Quiz
  const activities = await Activity.findAll({ where: { eventId: event.id } });
  assert(activities.length === 4, `Found 4 activities: ${activities.map((a) => a.title).join(', ')}`);

  const soloDance = activities.find((a) => a.slug === 'solo-dance');
  assert(soloDance !== null && soloDance.capacity === 50, 'Solo Dance activity verified with capacity 50');

  // Verify Ticket Types
  const ticketTypes = await TicketType.findAll({ where: { eventId: event.id } });
  assert(ticketTypes.length >= 5, `Found ${ticketTypes.length} ticket types for Pandaves 2026`);

  // Verify Form Fields
  const formFields = await RegistrationForm.findAll({ where: { eventId: event.id } });
  assert(formFields.length >= 4, `Found ${formFields.length} dynamic form fields`);
  assert(formFields.some((f) => f.fieldName === 'registerNumber'), 'Found required registerNumber field');

  // 2. Ticket & QR Generation
  console.log('\nStep 2: Ticket & QR Code Generation');
  const ticketKey = generateTicketKey();
  const verificationToken = generateVerificationToken();
  const verifyUrl = `http://localhost:3000/verify/${verificationToken}`;
  const qrData = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 320 });
  assert(qrData.startsWith('data:image/png;base64,'), 'QR code generated as opaque verification data URL');

  // Create a simulated customer, registration, and ticket
  let customer = await Customer.findOne({ where: { email: 'vishnu.test@example.com' } });
  if (!customer) {
    customer = await Customer.create({ name: 'Vishnu B', email: 'vishnu.test@example.com', phone: '+919876543210' });
  }

  const registration = await Registration.create({
    registrationRef: generateRegistrationRef(),
    tenantId: tenant.id,
    eventId: event.id,
    activityId: soloDance.id,
    customerId: customer.id,
    ticketTypeId: ticketTypes[0].id,
    quantity: 1,
    status: 'CONFIRMED',
  });

  const order = await Order.create({
    orderRef: generateOrderRef(),
    tenantId: tenant.id,
    registrationId: registration.id,
    customerId: customer.id,
    amount: 150,
    currency: 'INR',
    status: 'PAID',
  });

  const ticket = await Ticket.create({
    ticketKey,
    verificationToken,
    tenantId: tenant.id,
    eventId: event.id,
    activityId: soloDance.id,
    orderId: order.id,
    registrationId: registration.id,
    customerId: customer.id,
    ticketTypeId: ticketTypes[0].id,
    status: 'ACTIVE',
    qrData,
  });
  assert(ticket.id !== null, `Simulated active ticket created: ${ticket.ticketKey}`);

  // 3. PDF Generation
  console.log('\nStep 3: PDF Generation Test');
  const pdfBuffer = await generateTicketPdf({
    event,
    activity: soloDance,
    customer,
    tickets: [ticket],
    orderRef: order.orderRef,
  });
  assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 1000, `PDF generated successfully (${pdfBuffer.length} bytes)`);

  // 4. Verification & Check-in Logic
  console.log('\nStep 4: Check-in Verification & Duplicate Prevention');
  const staffUser = await User.findOne({ where: { email: 'admin@nehru-college.edu' } });
  const staffContext = { id: staffUser.id, role: 'TENANT_OWNER', tenantId: tenant.id };

  // Verify ticket (read-only scan)
  const verifyResult = await verifyTicket(staffContext, [], { ticketKey: ticket.ticketKey });
  assert(verifyResult.valid === true && verifyResult.result === 'VALID', 'Ticket scan validation: VALID');
  assert(verifyResult.activity?.title === 'Solo Dance', `Activity correctly identified: "${verifyResult.activity?.title}"`);

  // Complete first check-in
  const checkinResult = await checkIn(staffContext, [], { ticketKey: ticket.ticketKey, gateName: 'Main Gate 01' });
  assert(checkinResult.valid === true && checkinResult.status === 'USED', 'First check-in granted: status=USED');

  // Attempt duplicate check-in (MUST FAIL)
  let duplicateRejected = false;
  try {
    await checkIn(staffContext, [], { ticketKey: ticket.ticketKey, gateName: 'Main Gate 01' });
  } catch (err) {
    duplicateRejected = true;
    assert(true, `Duplicate scan rejected with expected error: "${err.message}"`);
  }
  assert(duplicateRejected, 'Duplicate scan prevention verified (atomic concurrency guard)');

  // Verify Checkin record exists in database
  const checkinRecord = await Checkin.findOne({ where: { ticketId: ticket.id } });
  assert(checkinRecord !== null && checkinRecord.gateName === 'Main Gate 01', 'Checkin record saved with gate name');

  // 5. Gmail SMTP Server Connection Verification
  console.log('\nStep 5: Gmail SMTP Server Verification');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const smtpOk = await new Promise((resolve) => {
    transporter.verify((err, ok) => {
      if (err) {
        console.error('SMTP Error:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
  assert(smtpOk, `Gmail SMTP Server (${process.env.SMTP_USER}) verified and ready for live delivery`);

  // Clean up simulated test ticket/order
  await checkinRecord.destroy();
  await ticket.destroy();
  await order.destroy();
  await registration.destroy();

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  await sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
  console.error('Verification failed with uncaught exception:', err);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
