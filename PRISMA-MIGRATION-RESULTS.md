# Ticket Panda — Sequelize to Prisma Migration Results
**Migration Date:** 2026-09-20  
**Target Environment:** Node.js v24.x LTS (ES Modules) | Prisma ORM 5.22.0 | MySQL 8.4 LTS  
**Target Database:** `ticket_panda_dev` on `localhost:3306`  
**Status:** **100% COMPLETED & VERIFIED (Zero Regressions)**

---

## 1. Executive Summary

The persistence and ORM layer of **Ticket Panda** has been completely migrated from Sequelize (`sequelize ^6.37.3`) to **Prisma ORM (`@prisma/client ^5.22.0`)** against MySQL 8.4 LTS.

All business capabilities, security constraints, multi-tenant isolation, local test payment workflows, QR/PDF generation, concurrency controls, and API contracts (`/api/v1/...`) have been fully preserved and verified with zero regressions.

Sequelize and SQLite dependencies have been completely removed from the codebase.

---

## 2. Scope of Migration

### 2.1 Schema & Models (18 Models, 10 Enums)
The entire relational model was translated into a clean, type-safe schema in `backend/prisma/schema.prisma` with explicit `@map` column names and `@@map` table names matching the MySQL snake_case conventions:

1. **`User`** (`users`): Superadmin & tenant staff authentication.
2. **`Tenant`** (`tenants`): Multi-tenant organizer workspaces with custom branding and settings.
3. **`TenantMember`** (`tenant_members`): Role-based staff assignments (`TENANT_ADMIN`, `EVENT_MANAGER`, `GATE_STAFF`).
4. **`Customer`** (`customers`): Ticket buyers with email and phone indexing.
5. **`Event`** (`events`): Festivals/events with venue information, date ranges, and capacities.
6. **`Activity`** (`activities`): Sub-events / competitions under festivals.
7. **`TicketType`** (`ticket_types`): Entry tiers with capacity constraints, pricing, and sold counters.
8. **`RegistrationForm`** (`registration_forms`): Configurable custom form fields per event or activity.
9. **`Registration`** (`registrations`): Attendee registration records.
10. **`RegistrationData`** (`registration_data`): Form response key-value store.
11. **`Order`** (`orders`): Orders with countdown expiry timers and financial summaries.
12. **`Payment`** (`payments`): Payment records supporting `local` test provider and future Razorpay.
13. **`Ticket`** (`tickets`): Unique ticket keys, cryptographically random verification tokens, and QR base64 codes.
14. **`Checkin`** (`checkins`): Gate check-in logs with staff and gate tracking.
15. **`AuditLog`** (`audit_logs`): Immutable audit trails for tenant and platform operations.
16. **`EmailLog`** (`email_logs`): Outbound notification logs.
17. **`OtpVerification`** (`otp_verifications`): One-time recovery codes for customer ticket access.
18. **`WebhookEvent`** (`webhook_events`): Deduplication ledger for incoming payment webhooks.

---

## 3. Service-by-Service Migration Details

| Module / Service | File Path | Migration Implementation Details |
| :--- | :--- | :--- |
| **Prisma Client Singleton** | `src/lib/prisma.js` | Configured environment-aware logging (`query`, `info`, `warn`, `error`) and graceful exit handlers (`beforeExit`). |
| **Tenant Middleware** | `src/middleware/tenant.middleware.js` | Replaced Sequelize queries with `prisma.tenant.findUnique` / `findFirst` based on headers/subdomains. |
| **Audit Service** | `src/modules/audit/audit.service.js` | `recordAudit` now writes to `prisma.auditLog.create`. Non-blocking error handling preserved. |
| **Notifications Service** | `src/modules/notifications/notifications.service.js` | Uses `prisma.emailLog.create` for tracking sent transactional emails (tickets, OTPs, receipts). |
| **Auth Service** | `src/modules/auth/auth.service.js` | Migrated platform admin and tenant staff login, registration, password hashing (bcrypt), token refresh, and user profiles. |
| **Tenants Service** | `src/modules/tenants/tenant.service.js` | Implemented organizer profile management, member invites, staff listings, and dashboard analytics aggregations using `prisma.$transaction`. |
| **Events Service** | `src/modules/events/events.service.js` | Event CRUD, slug auto-generation, tenant isolation filtering, date parsing, and activity counts. |
| **Activity Service** | `src/modules/activities/activity.service.js` | Activity creation, status transitions (`DRAFT` -> `PUBLISHED`), and nested ticket-type associations. |
| **Ticket Types Service** | `src/modules/ticketTypes/ticketType.service.js` | Capacity validations, pricing tiers, and active status toggling. |
| **Dynamic Forms Service** | `src/modules/registrationForms/formField.service.js` | Custom form field builder supporting TEXT, SELECT, MULTISELECT, FILE, NUMBER, etc. |
| **Customer Service** | `src/modules/customers/customer.service.js` | OTP dispatch via Gmail SMTP, OTP verification with single-use flag, and "My Tickets" recovery query with nested order, event, and activity joins. |
| **Booking Service** | `src/modules/booking/booking.service.js` | **Critical Path:** <br>• Inventory checking and reserving.<br>• Dynamic form data validation & storage.<br>• Atomic MySQL row-locking (`SELECT ... FOR UPDATE`) in `prisma.$transaction`.<br>• Local test payment verification & simulation states.<br>• Idempotent finalisation (`finalisePaidOrder`) preventing duplicate ticket generation. |
| **Tickets Service** | `src/modules/tickets/ticket.service.js` | High-entropy ticket key generation (`TP-XXXX-XXXX`), QR data URL rendering, and ticket serialisation. |
| **Payments Service** | `src/modules/payments/payment.service.js` | Provider abstraction (`local` test provider default), clean provider decoupling. |
| **Webhooks Service** | `src/modules/payments/webhook.controller.js` | Idempotent webhook event ledger using `prisma.webhookEvent`. |
| **Verification Service** | `src/modules/verification/verification.service.js` | **Concurrency Protection:**<br>• Gate staff check-in with row-level locking (`SELECT ... FOR UPDATE`).<br>• Immediate duplicate entry rejection with HTTP 409 Conflict.<br>• Live gate statistics by event and ticket type. |
| **Public Service** | `src/modules/public/public.service.js` | Multi-tenant public landing pages (`/t/:tenantSlug`), festival activities, remaining ticket calculations, and full event details. |
| **Platform Service** | `src/modules/platform/platform.service.js` | Superadmin platform metrics, tenant provisioning, and global revenue analytics. |
| **Order Expiry Job** | `src/jobs/orderExpiry.job.js` | Automated background sweep for expired pending orders (`>15 mins`) with inventory release. |
| **Server Lifecycle** | `server.js` | Connects via `prisma.$connect()` on startup; disconnects on `SIGINT`/`SIGTERM`. |

---

## 4. Key Architectural Guarantees Preserved

### 4.1 Strict Multi-Tenant Isolation
All tenant-scoped queries explicitly enforce `where: { tenantId }`. No tenant can query, update, or check in tickets belonging to another tenant organizer.

### 4.2 Row-Level Locking & Inventory Integrity
During booking and payment finalisation, inventory is protected against overselling:
```javascript
await tx.$executeRaw`SELECT id FROM ticket_types WHERE id = ${ticketTypeId} FOR UPDATE`;
```
Ensures that concurrent booking requests serialize cleanly at the database engine level.

### 4.3 Anti-Passback Concurrency Guard
During gate scanning, multiple staff devices scanning the same ticket QR code simultaneously are safeguarded:
```javascript
await tx.$executeRaw`SELECT id, status FROM tickets WHERE id = ${ticket.id} FOR UPDATE`;
```
If the ticket status is already `USED` or a checkin record exists, the transaction aborts and returns an HTTP 409 Conflict with the timestamp of the prior scan.

### 4.4 Complete Elimination of Sequelize
- `sequelize` and `sqlite3` packages removed from `backend/package.json`.
- Removed `src/config/database.js`.
- Removed `src/database/` directory (models, migrations, legacy seeders).
- Replaced Sequelize error handlers in `src/middleware/error.middleware.js` with native Prisma client error codes (`P2002`, `P2003`, `P2025`, `PrismaClientValidationError`).
- Cleaned up environment variables in `src/config/env.js`.

---

## 5. Verification Summary
All 18 stages of the automated end-to-end test suite (`npm test`) executed successfully with exit code 0 against MySQL 8.4 on `ticket_panda_dev`.
