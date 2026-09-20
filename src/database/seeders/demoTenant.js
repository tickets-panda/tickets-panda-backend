import bcrypt from 'bcryptjs';
import {
  User,
  Tenant,
  TenantMember,
  Event,
  Activity,
  TicketType,
  RegistrationForm,
} from '../models/index.js';
import { normaliseEmail } from '../../utils/helpers.js';
import { slugify } from '../../utils/generators.js';

const DEMO_EMAIL = 'admin@nehru-college.edu';
const DEMO_PASSWORD = 'Password123';

/** Creates a ready-to-demo tenant with a live festival and its activities/ticket types. */
export async function seedDemoTenant() {
  const email = normaliseEmail(DEMO_EMAIL);
  let user = await User.findOne({ where: { email } });
  if (user) {
    const tenant = await Tenant.findOne({ where: { slug: 'nehru-college' } });
    return { created: false, tenant, user };
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  user = await User.create({ name: 'Nehru College Admin', email, passwordHash, phone: '+919876543210' });

  const tenant = await Tenant.create({
    name: 'Nehru College',
    slug: 'nehru-college',
    email,
    phone: '+919876543210',
    websiteUrl: 'https://nehru-college.edu',
    category: 'COLLEGE',
    description: 'Nehru College of Engineering and Technology — Premier technical institution hosting Pandaves 2026.',
    status: 'ACTIVE',
    subscriptionPlan: 'BUSINESS',
    brandingJson: {
      primaryColor: '#F97316',
      secondaryColor: '#18181b',
      footerText: 'Powered by Ticket Panda 🐼',
    },
    settings: { brandColor: '#F97316' },
  });

  await TenantMember.create({
    userId: user.id,
    tenantId: tenant.id,
    role: 'TENANT_OWNER',
    isActive: true,
  });

  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 30);

  const event = await Event.create({
    tenantId: tenant.id,
    title: 'Pandaves 2026',
    slug: 'pandaves-2026',
    shortDescription: 'National Level Inter-Collegiate Cultural & Technical Festival',
    description: 'Pandaves 2026 is the annual cultural extravaganza bringing together students from across the country for premier dance, music, arts, and quiz competitions.',
    venueName: 'Nehru College Main Campus Auditorium',
    venueAddress: 'Nehru Gardens, Thirumalayampalayam, Coimbatore',
    venueMapUrl: 'https://maps.google.com/?q=Nehru+College',
    eventDate: eventDate.toISOString().slice(0, 10),
    eventTimeStart: '09:00:00',
    eventTimeEnd: '21:00:00',
    startAt: eventDate,
    maxCapacity: 1500,
    rules: 'College ID is mandatory. Follow discipline guidelines. Respect competition time limits.',
    faqJson: [
      { question: 'Who is eligible to participate?', answer: 'All bonafide undergraduate and postgraduate students.' },
      { question: 'Is spot registration available?', answer: 'Limited spot entries subject to capacity.' },
    ],
    contactJson: { email: 'events@nehru-college.edu', phone: '+919876543210', coordinator: 'Prof. Ramesh Kumar' },
    status: 'LIVE',
    createdBy: user.id,
  });

  // Create activities per 21-FINAL-DEMO-SCENARIO.txt: Solo Dance, Solo Singing, Group Dance, Quiz
  const soloDance = await Activity.create({
    tenantId: tenant.id,
    eventId: event.id,
    title: 'Solo Dance',
    slug: 'solo-dance',
    shortDescription: 'Showcase your rhythm and choreography on the grand stage',
    description: 'Solo Western and Classical dance competition. Time limit: 4 minutes. Bring audio track in MP3 format.',
    rules: 'Time limit 4 mins. Decent attire mandatory. Track must be submitted 1 hr prior.',
    eligibility: 'All college students with valid ID',
    venue: 'Open Air Theatre',
    capacity: 50,
    status: 'PUBLISHED',
    sortOrder: 1,
  });

  const soloSinging = await Activity.create({
    tenantId: tenant.id,
    eventId: event.id,
    title: 'Solo Singing',
    slug: 'solo-singing',
    shortDescription: 'Vocal music competition across Eastern and Western categories',
    description: 'Solo vocal competition. Karaoke track or acoustic instrument allowed. Time limit: 3 minutes.',
    rules: 'Time limit 3 mins. Eastern / Western categories judged separately.',
    eligibility: 'All college students',
    venue: 'Seminar Hall 1',
    capacity: 40,
    status: 'PUBLISHED',
    sortOrder: 2,
  });

  const groupDance = await Activity.create({
    tenantId: tenant.id,
    eventId: event.id,
    title: 'Group Dance',
    slug: 'group-dance',
    shortDescription: 'Theme-based group dance battle (6 to 12 participants)',
    description: 'High-energy team dance competition. Props permitted. Time limit: 8 minutes.',
    rules: '6 to 12 members per team. Time limit 8 mins.',
    eligibility: 'College teams only',
    venue: 'Main Auditorium',
    capacity: 30,
    status: 'PUBLISHED',
    sortOrder: 3,
  });

  const quiz = await Activity.create({
    tenantId: tenant.id,
    eventId: event.id,
    title: 'Quiz',
    slug: 'quiz',
    shortDescription: 'General trivia, tech and pop culture quiz competition',
    description: 'Teams of 2. Written preliminary round followed by 6-team stage finals.',
    rules: 'Teams of 2 members. No electronic devices during rounds.',
    eligibility: 'Open to all students',
    venue: 'Conference Hall',
    capacity: 60,
    status: 'PUBLISHED',
    sortOrder: 4,
  });

  // Ticket Types (activity-linked and general)
  await TicketType.bulkCreate([
    {
      eventId: event.id,
      activityId: soloDance.id,
      tenantId: tenant.id,
      name: 'Solo Dance Entry',
      description: 'Registration pass for Solo Dance competition',
      price: 150,
      quantity: 50,
      minPerOrder: 1,
      maxPerOrder: 1,
      sortOrder: 1,
    },
    {
      eventId: event.id,
      activityId: soloSinging.id,
      tenantId: tenant.id,
      name: 'Solo Singing Entry',
      description: 'Registration pass for Solo Singing competition',
      price: 150,
      quantity: 40,
      minPerOrder: 1,
      maxPerOrder: 1,
      sortOrder: 2,
    },
    {
      eventId: event.id,
      activityId: groupDance.id,
      tenantId: tenant.id,
      name: 'Group Dance Team Entry',
      description: 'Team registration pass for Group Dance (up to 12 members)',
      price: 500,
      quantity: 30,
      minPerOrder: 1,
      maxPerOrder: 1,
      sortOrder: 3,
    },
    {
      eventId: event.id,
      activityId: quiz.id,
      tenantId: tenant.id,
      name: 'Quiz Team Entry',
      description: 'Team of 2 entry pass for the General Quiz',
      price: 100,
      quantity: 60,
      minPerOrder: 1,
      maxPerOrder: 1,
      sortOrder: 4,
    },
    {
      eventId: event.id,
      tenantId: tenant.id,
      name: 'All-Access Delegate Pass',
      description: 'General festival access to all spectator events and exhibitions',
      price: 299,
      quantity: 500,
      minPerOrder: 1,
      maxPerOrder: 5,
      sortOrder: 5,
    },
  ]);

  // College-specific dynamic registration form fields
  await RegistrationForm.bulkCreate([
    {
      eventId: event.id,
      tenantId: tenant.id,
      fieldName: 'registerNumber',
      fieldLabel: 'College Register Number',
      fieldType: 'TEXT',
      placeholder: 'e.g. 24DS123',
      helpText: 'Enter your university/college registration or roll number',
      isRequired: true,
      sortOrder: 1,
    },
    {
      eventId: event.id,
      tenantId: tenant.id,
      fieldName: 'department',
      fieldLabel: 'Department / Major',
      fieldType: 'TEXT',
      placeholder: 'e.g. Computer Science, Mechanical, Arts',
      isRequired: true,
      sortOrder: 2,
    },
    {
      eventId: event.id,
      tenantId: tenant.id,
      fieldName: 'year',
      fieldLabel: 'Year of Study',
      fieldType: 'SELECT',
      options: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate'],
      isRequired: true,
      sortOrder: 3,
    },
    {
      eventId: event.id,
      tenantId: tenant.id,
      fieldName: 'collegeName',
      fieldLabel: 'Institution / College Name',
      fieldType: 'TEXT',
      placeholder: 'Enter your college or university name',
      isRequired: true,
      sortOrder: 4,
    },
  ]);

  return { created: true, tenant, user, event, activities: [soloDance, soloSinging, groupDance, quiz] };
}

export default seedDemoTenant;
