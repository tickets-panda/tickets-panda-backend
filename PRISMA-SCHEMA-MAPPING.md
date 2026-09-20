# Ticket Panda — Sequelize to Prisma Schema & Query Mapping
**Date:** 2026-09-20  
**Target:** Prisma 5.22.0 | MySQL 8.4 LTS (`ticket_panda_dev` on `127.0.0.1:3306`)  
**Status:** Introspection Verified (18 Tables, 0 Destructive Changes)

---

## 1. Table-by-Table Comprehensive Mapping

### 1.1 `users`
- **Existing MySQL Table:** `users`
- **Existing Sequelize Model:** `User` (`src/database/models/user.model.js`)
- **Proposed Prisma Model:** `User`
- **Relationships:**
  - `hasMany` `TenantMember` (`tenantMembers`)
  - `hasMany` `AuditLog` (`auditLogs`)
  - `hasMany` `Event` as creator (`createdEvents`)
  - `hasMany` `Checkin` as scanner (`checkins`)
- **Important Indexes & Constraints:**
  - Primary Key: `id` (Auto-increment)
  - Unique Key: `email`
  - Index: `role`, `status`
- **Enums/Types:** `PlatformRole` (`SUPER_ADMIN`, `SUPPORT`)

### 1.2 `tenants`
- **Existing MySQL Table:** `tenants`
- **Existing Sequelize Model:** `Tenant` (`src/database/models/tenant.model.js`)
- **Proposed Prisma Model:** `Tenant`
- **Relationships:**
  - `hasMany` `TenantMember` (`members`)
  - `hasMany` `Event` (`events`)
  - `hasMany` `Activity` (`activities`)
  - `hasMany` `TicketType` (`ticketTypes`)
  - `hasMany` `Registration` (`registrations`)
  - `hasMany` `Order` (`orders`)
  - `hasMany` `Payment` (`payments`)
  - `hasMany` `Ticket` (`tickets`)
  - `hasMany` `Checkin` (`checkins`)
  - `hasMany` `AuditLog` (`auditLogs`)
  - `hasMany` `EmailLog` (`emailLogs`)
- **Important Indexes & Constraints:**
  - Primary Key: `id` (Auto-increment)
  - Unique Key: `slug`
  - Index: `status`
- **Enums/Types:** `TenantStatus` (`ACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`), `SubscriptionPlan` (`FREE`, `PRO`, `ENTERPRISE`), JSON fields: `brandingJson`, `socialLinks`, `settings`

### 1.3 `tenant_members`
- **Existing MySQL Table:** `tenant_members`
- **Existing Sequelize Model:** `TenantMember` (`src/database/models/tenantMember.model.js`)
- **Proposed Prisma Model:** `TenantMember`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `User` (`user`, `userId`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Composite Index: `[userId, tenantId]` (`tenant_members_user_id_tenant_id_unique`)
  - Foreign Keys: `user_id -> users(id)` (CASCADE), `tenant_id -> tenants(id)` (CASCADE)
- **Enums/Types:** `TenantRole` (`TENANT_ADMIN`, `EVENT_MANAGER`, `GATE_STAFF`), JSON field: `assignedEvents`

### 1.4 `customers`
- **Existing MySQL Table:** `customers`
- **Existing Sequelize Model:** `Customer` (`src/database/models/customer.model.js`)
- **Proposed Prisma Model:** `Customer`
- **Relationships:**
  - `hasMany` `Registration` (`registrations`)
  - `hasMany` `Order` (`orders`)
  - `hasMany` `Ticket` (`tickets`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `email`, `phone` (Non-unique to allow multiple ticket purchases without forced account creation)

### 1.5 `events`
- **Existing MySQL Table:** `events`
- **Existing Sequelize Model:** `Event` (`src/database/models/event.model.js`)
- **Proposed Prisma Model:** `Event`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `User` (`creator`, `createdBy`)
  - `hasMany` `Activity` (`activities`)
  - `hasMany` `TicketType` (`ticketTypes`)
  - `hasMany` `RegistrationForm` (`registrationForms`)
  - `hasMany` `Registration` (`registrations`)
  - `hasMany` `Order` (`orders`)
  - `hasMany` `Ticket` (`tickets`)
  - `hasMany` `Checkin` (`checkins`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Composite: `[tenantId, slug]` (`events_tenant_id_slug_unique`)
  - Index: `status`, `eventDate`
  - Foreign Keys: `tenant_id -> tenants(id)` (CASCADE)
- **Enums/Types:** `EventStatus` (`DRAFT`, `LIVE`, `ENDED`, `CANCELLED`), JSON fields: `faqJson`, `contactJson`, `galleryUrls`, `settings`

### 1.6 `activities`
- **Existing MySQL Table:** `activities`
- **Existing Sequelize Model:** `Activity` (`src/database/models/activity.model.js`)
- **Proposed Prisma Model:** `Activity`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Event` (`event`, `eventId`)
  - `hasMany` `TicketType` (`ticketTypes`)
  - `hasMany` `RegistrationForm` (`registrationForms`)
  - `hasMany` `Registration` (`registrations`)
  - `hasMany` `Ticket` (`tickets`)
  - `hasMany` `Checkin` (`checkins`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Composite: `[eventId, slug]` (`activities_event_id_slug_unique`)
  - Indexes: `tenantId`, `[eventId, status]`
  - Foreign Keys: `tenant_id -> tenants(id)`, `event_id -> events(id)` (CASCADE)
- **Enums/Types:** `ActivityStatus` (`DRAFT`, `PUBLISHED`, `CLOSED`, `CANCELLED`)

### 1.7 `ticket_types`
- **Existing MySQL Table:** `ticket_types`
- **Existing Sequelize Model:** `TicketType` (`src/database/models/ticketType.model.js`)
- **Proposed Prisma Model:** `TicketType`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Event` (`event`, `eventId`)
  - `belongsTo` `Activity` (`activity`, `activityId`)
  - `hasMany` `Registration` (`registrations`)
  - `hasMany` `Ticket` (`tickets`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `eventId`, `activityId`, `tenantId`, `isActive`
  - Foreign Keys: `event_id -> events(id)`, `activity_id -> activities(id)`, `tenant_id -> tenants(id)`
- **Enums/Types:** `price` is `Decimal(10, 2)`, `soldCount` is atomic integer.

### 1.8 `registration_forms`
- **Existing MySQL Table:** `registration_forms`
- **Existing Sequelize Model:** `RegistrationForm` (`src/database/models/registrationForm.model.js`)
- **Proposed Prisma Model:** `RegistrationForm`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Event` (`event`, `eventId`)
  - `belongsTo` `Activity` (`activity`, `activityId`)
  - `hasMany` `RegistrationData` (`registrationData`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `eventId`, `activityId`, `tenantId`
- **Enums/Types:** `FormFieldType` (`TEXT`, `NUMBER`, `EMAIL`, `PHONE`, `SELECT`, `RADIO`, `CHECKBOX`, `TEXTAREA`, `FILE`, `MULTISELECT`, `LONGTEXT`), JSON fields: `options`, `validationRules`, `fileConfig`

### 1.9 `registrations`
- **Existing MySQL Table:** `registrations`
- **Existing Sequelize Model:** `Registration` (`src/database/models/registration.model.js`)
- **Proposed Prisma Model:** `Registration`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Event` (`event`, `eventId`)
  - `belongsTo` `Activity` (`activity`, `activityId`)
  - `belongsTo` `Customer` (`customer`, `customerId`)
  - `belongsTo` `TicketType` (`ticketType`, `ticketTypeId`)
  - `hasMany` `RegistrationData` (`registrationData`)
  - `hasMany` `Order` (`orders`)
  - `hasMany` `Ticket` (`tickets`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Key: `registrationRef`
  - Indexes: `tenantId`, `eventId`, `activityId`, `customerId`, `ticketTypeId`, `status`
- **Enums/Types:** `RegistrationStatus` (`PENDING`, `CONFIRMED`, `CANCELLED`, `EXPIRED`)

### 1.10 `registration_data`
- **Existing MySQL Table:** `registration_data`
- **Existing Sequelize Model:** `RegistrationData` (`src/database/models/registrationData.model.js`)
- **Proposed Prisma Model:** `RegistrationData`
- **Relationships:**
  - `belongsTo` `Registration` (`registration`, `registrationId`)
  - `belongsTo` `RegistrationForm` (`formField`, `formFieldId`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `registrationId`, `formFieldId`

### 1.11 `orders`
- **Existing MySQL Table:** `orders`
- **Existing Sequelize Model:** `Order` (`src/database/models/order.model.js`)
- **Proposed Prisma Model:** `Order`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Registration` (`registration`, `registrationId`)
  - `belongsTo` `Customer` (`customer`, `customerId`)
  - `hasMany` `Payment` (`payments`)
  - `hasMany` `Ticket` (`tickets`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Key: `orderRef`
  - Indexes: `tenantId`, `registrationId`, `customerId`, `status`, `expiresAt`
- **Enums/Types:** `OrderStatus` (`PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`), `amount` is `Decimal(10, 2)`

### 1.12 `payments`
- **Existing MySQL Table:** `payments`
- **Existing Sequelize Model:** `Payment` (`src/database/models/payment.model.js`)
- **Proposed Prisma Model:** `Payment`
- **Relationships:**
  - `belongsTo` `Order` (`order`, `orderId`)
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `orderId`, `tenantId`, `status`, `providerPaymentId`, `razorpayPaymentId`
- **Enums/Types:** `PaymentStatus` (`CREATED`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`)

### 1.13 `tickets`
- **Existing MySQL Table:** `tickets`
- **Existing Sequelize Model:** `Ticket` (`src/database/models/ticket.model.js`)
- **Proposed Prisma Model:** `Ticket`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Event` (`event`, `eventId`)
  - `belongsTo` `Activity` (`activity`, `activityId`)
  - `belongsTo` `Order` (`order`, `orderId`)
  - `belongsTo` `Registration` (`registration`, `registrationId`)
  - `belongsTo` `Customer` (`customer`, `customerId`)
  - `belongsTo` `TicketType` (`ticketType`, `ticketTypeId`)
  - `hasMany` `Checkin` (`checkins`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Keys: `ticketKey`, `verificationToken`
  - Indexes: `tenantId`, `eventId`, `activityId`, `orderId`, `status`
- **Enums/Types:** `TicketStatus` (`ACTIVE`, `USED`, `CANCELLED`, `REVOKED`), `qrData` (Base64 data URL)

### 1.14 `checkins`
- **Existing MySQL Table:** `checkins`
- **Existing Sequelize Model:** `Checkin` (`src/database/models/checkin.model.js`)
- **Proposed Prisma Model:** `Checkin`
- **Relationships:**
  - `belongsTo` `Ticket` (`ticket`, `ticketId`)
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `Event` (`event`, `eventId`)
  - `belongsTo` `Activity` (`activity`, `activityId`)
  - `belongsTo` `User` (`staff`, `checkedInBy`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `ticketId`, `tenantId`, `eventId`, `activityId`, `checkedInBy`, `checkedInAt`

### 1.15 `audit_logs`
- **Existing MySQL Table:** `audit_logs`
- **Existing Sequelize Model:** `AuditLog` (`src/database/models/auditLog.model.js`)
- **Proposed Prisma Model:** `AuditLog`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
  - `belongsTo` `User` (`user`, `userId`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `tenantId`, `userId`, `action`, `createdAt`
- **Enums/Types:** JSON field: `details`

### 1.16 `email_logs`
- **Existing MySQL Table:** `email_logs`
- **Existing Sequelize Model:** `EmailLog` (`src/database/models/emailLog.model.js`)
- **Proposed Prisma Model:** `EmailLog`
- **Relationships:**
  - `belongsTo` `Tenant` (`tenant`, `tenantId`)
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `tenantId`, `toEmail`, `status`, `createdAt`
- **Enums/Types:** `EmailStatus` (`PENDING`, `SENT`, `FAILED`)

### 1.17 `otp_verifications`
- **Existing MySQL Table:** `otp_verifications`
- **Existing Sequelize Model:** `OtpVerification` (`src/database/models/otpVerification.model.js`)
- **Proposed Prisma Model:** `OtpVerification`
- **Relationships:** Standalone customer authentication & ticket recovery table
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Indexes: `identifier`, `expiresAt`, `isUsed`
- **Enums/Types:** `OtpType` (`EMAIL`, `PHONE`)

### 1.18 `webhook_events`
- **Existing MySQL Table:** `webhook_events`
- **Existing Sequelize Model:** `WebhookEvent` (`src/database/models/webhookEvent.model.js`)
- **Proposed Prisma Model:** `WebhookEvent`
- **Relationships:** Standalone idempotency ledger for payment gateways
- **Important Indexes & Constraints:**
  - Primary Key: `id`
  - Unique Key: `eventId`
  - Indexes: `provider`, `status`, `receivedAt`
- **Enums/Types:** `WebhookStatus` (`PENDING`, `PROCESSED`, `FAILED`, `IGNORED`), JSON field: `payload`

---

## 2. Report on Mismatches Between MySQL, Sequelize, and Ticket Panda Specification

| Area | MySQL Schema (`ticket_panda_dev`) | Sequelize Models | Ticket Panda Specification | Status / Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **Activity Layer** | `activities` table exists with `[eventId, slug]` unique index | `activity.model.js` exists, `activityId` on `ticket_types`, `tickets`, `checkins`, `registrations` | Activity layer sits between Festival and Ticket Types | **MATCHED**: 100% aligned. |
| **Naming Conventions** | Snake_case columns (`event_id`, `created_at`, `ticket_key`) | CamelCase model attributes mapped to snake_case | CamelCase in TypeScript/JavaScript, snake_case in MySQL | **MATCHED**: Resolved via `@map` and `@@map` in Prisma schema. |
| **Event Date Fields** | `event_date` (`DATE`), `start_at` (`DATETIME`), `end_at` (`DATETIME`) | Both `eventDate` and `startAt`/`endAt` present | Allows festival multi-day ranges and single-day compatibility | **MATCHED**: Both preserved in Prisma schema. |
| **JSON Settings & Branding** | `branding_json`, `social_links`, `faq_json`, `contact_json`, `gallery_urls` | Defined as `DataTypes.JSON` | Enables customized tenant landing and festival FAQs | **MATCHED**: Mapped to `Json?` in Prisma. |
| **Payment Provider** | `provider` string column, `provider_payment_id`, `razorpay_payment_id` | Supports both `local` and `razorpay` providers | LocalTestPaymentProvider active by default; Razorpay ready | **MATCHED**: Both provider fields exist and support simulation. |
| **Check-in Concurrency** | Unique ticket check-in semantics, indexed `ticket_id` | Transactional update with pessimistic lock | Prevents duplicate ticket entry (anti-passback) | **MATCHED**: Verified via `SELECT ... FOR UPDATE` row locks in Prisma `$transaction`. |
| **Destructive Migration Risk** | 18 tables populated with valid data | No schema alterations requested | Zero data loss, zero table drops | **MATCHED**: `prisma db pull` cleanly introspected without schema drift. No destructive migration is proposed. |

---

## 3. Query Patterns & Migration Equivalents

### 3.1 Find by Primary Key
- **Sequelize**:
  ```javascript
  const user = await User.findByPk(id);
  ```
- **Prisma**:
  ```javascript
  const user = await prisma.user.findUnique({
    where: { id: parseInt(id, 10) }
  });
  ```

### 3.2 Find One with Filter & Relations (Includes)
- **Sequelize**:
  ```javascript
  const event = await Event.findOne({
    where: { slug, tenantId },
    include: [
      { model: TicketType, as: 'ticketTypes', where: { isActive: true }, required: false },
      { model: Activity, as: 'activities', where: { status: 'PUBLISHED' }, required: false }
    ]
  });
  ```
- **Prisma**:
  ```javascript
  const event = await prisma.event.findFirst({
    where: { slug, tenantId: parseInt(tenantId, 10) },
    include: {
      ticketTypes: { where: { isActive: true } },
      activities: { where: { status: 'PUBLISHED' } }
    }
  });
  ```

### 3.3 Find and Count All (Pagination)
- **Sequelize**:
  ```javascript
  const { count, rows } = await Event.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });
  ```
- **Prisma**:
  ```javascript
  const [total, items] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: ...
    })
  ]);
  ```

### 3.4 Concurrency Row-Level Locks
- **Sequelize**:
  ```javascript
  await sequelize.transaction(async (t) => {
    const ticket = await Ticket.findOne({
      where: { verificationToken: token },
      lock: t.LOCK.UPDATE,
      transaction: t
    });
  });
  ```
- **Prisma**:
  ```javascript
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id, status FROM tickets WHERE verification_token = ${token} FOR UPDATE`;
    const ticket = await tx.ticket.findUnique({ where: { verificationToken: token } });
  });
  ```
