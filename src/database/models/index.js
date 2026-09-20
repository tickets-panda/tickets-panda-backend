import sequelize, { clampDecrement } from '../../config/database.js';
import User from './user.model.js';
import Tenant from './tenant.model.js';
import TenantMember from './tenantMember.model.js';
import Event from './event.model.js';
import Activity from './activity.model.js';
import TicketType from './ticketType.model.js';
import RegistrationForm from './registrationForm.model.js';
import Customer from './customer.model.js';
import Registration from './registration.model.js';
import RegistrationData from './registrationData.model.js';
import Order from './order.model.js';
import Payment from './payment.model.js';
import Ticket from './ticket.model.js';
import Checkin from './checkin.model.js';
import OtpVerification from './otpVerification.model.js';
import AuditLog from './auditLog.model.js';
import EmailLog from './emailLog.model.js';
import WebhookEvent from './webhookEvent.model.js';

/* ------------------------------------------------------------------ *
 * Associations — see docs/01-backend/database-schema.md
 * ------------------------------------------------------------------ */

// Users <-> tenants
User.hasMany(TenantMember, { foreignKey: 'userId', as: 'memberships' });
TenantMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Tenant.hasMany(TenantMember, { foreignKey: 'tenantId', as: 'members' });
TenantMember.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
TenantMember.belongsTo(User, { foreignKey: 'invitedBy', as: 'inviter' });

// Tenants -> events
Tenant.hasMany(Event, { foreignKey: 'tenantId', as: 'events' });
Event.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Event.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// Tenants -> activities
Tenant.hasMany(Activity, { foreignKey: 'tenantId', as: 'activities' });
Activity.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

// Events -> activities
Event.hasMany(Activity, { foreignKey: 'eventId', as: 'activities' });
Activity.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });

// Activities -> ticket types / forms
Activity.hasMany(TicketType, { foreignKey: 'activityId', as: 'ticketTypes' });
TicketType.belongsTo(Activity, { foreignKey: 'activityId', as: 'activity' });

Activity.hasMany(RegistrationForm, { foreignKey: 'activityId', as: 'formFields' });
RegistrationForm.belongsTo(Activity, { foreignKey: 'activityId', as: 'activity' });

// Events -> ticket types / forms
Event.hasMany(TicketType, { foreignKey: 'eventId', as: 'ticketTypes' });
TicketType.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
TicketType.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Event.hasMany(RegistrationForm, { foreignKey: 'eventId', as: 'formFields' });
RegistrationForm.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
RegistrationForm.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

// Registrations
Event.hasMany(Registration, { foreignKey: 'eventId', as: 'registrations' });
Registration.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Activity.hasMany(Registration, { foreignKey: 'activityId', as: 'registrations' });
Registration.belongsTo(Activity, { foreignKey: 'activityId', as: 'activity' });
Registration.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Registration.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Registration.belongsTo(TicketType, { foreignKey: 'ticketTypeId', as: 'ticketType' });

Registration.hasMany(RegistrationData, { foreignKey: 'registrationId', as: 'formData' });
RegistrationData.belongsTo(Registration, { foreignKey: 'registrationId', as: 'registration' });
RegistrationData.belongsTo(RegistrationForm, { foreignKey: 'formFieldId', as: 'formField' });

Registration.hasOne(Order, { foreignKey: 'registrationId', as: 'order' });
Order.belongsTo(Registration, { foreignKey: 'registrationId', as: 'registration' });
Order.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Order.hasOne(Payment, { foreignKey: 'orderId', as: 'payment' });
Payment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Payment.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

// Tickets
Order.hasMany(Ticket, { foreignKey: 'orderId', as: 'tickets' });
Ticket.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Ticket.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Ticket.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Activity.hasMany(Ticket, { foreignKey: 'activityId', as: 'tickets' });
Ticket.belongsTo(Activity, { foreignKey: 'activityId', as: 'activity' });
Ticket.belongsTo(Registration, { foreignKey: 'registrationId', as: 'registration' });
Ticket.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Ticket.belongsTo(TicketType, { foreignKey: 'ticketTypeId', as: 'ticketType' });

Ticket.hasOne(Checkin, { foreignKey: 'ticketId', as: 'checkin' });
Checkin.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });
Checkin.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Checkin.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
Checkin.belongsTo(Activity, { foreignKey: 'activityId', as: 'activity' });
Checkin.belongsTo(User, { foreignKey: 'checkedInBy', as: 'staff' });

// Customers
Customer.hasMany(Registration, { foreignKey: 'customerId', as: 'registrations' });
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Customer.hasMany(Ticket, { foreignKey: 'customerId', as: 'tickets' });

// Audit / email
// An audit trail must never be blocked by referential integrity — records are
// append-only and tenantId is null for platform-level actions.
AuditLog.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant', constraints: false });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });
EmailLog.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

const db = {
  sequelize,
  clampDecrement,
  User,
  Tenant,
  TenantMember,
  Event,
  Activity,
  TicketType,
  RegistrationForm,
  Customer,
  Registration,
  RegistrationData,
  Order,
  Payment,
  Ticket,
  Checkin,
  OtpVerification,
  AuditLog,
  EmailLog,
  WebhookEvent,
};

export {
  sequelize,
  clampDecrement,
  User,
  Tenant,
  TenantMember,
  Event,
  Activity,
  TicketType,
  RegistrationForm,
  Customer,
  Registration,
  RegistrationData,
  Order,
  Payment,
  Ticket,
  Checkin,
  OtpVerification,
  AuditLog,
  EmailLog,
  WebhookEvent,
};

export default db;
