# Ticket Panda — Prisma Service Migration Status
**Milestone:** Milestone 2 (Service Migration)  
**Date:** 2026-09-20  
**Database:** MySQL 8.4 LTS (`ticket_panda_dev` on `127.0.0.1:3306`)  
**Prisma Version:** `5.22.0`  
**Sequelize Status:** Retained in codebase for compatibility; 0 active database calls in migrated services.

---

## 1. Services Migration Tracker

| Service / Module | Path | Status | Old ORM | New ORM | Tests Covering Service | Known Issues |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| **Prisma Singleton** | `src/lib/prisma.js` | **MIGRATED** | N/A | Prisma 5.22.0 | Connection tests, All E2E | None |
| **Tenant Middleware** | `src/middleware/tenant.middleware.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 4, 5, 6; Milestone2 1-7 | None |
| **Audit Service** | `src/modules/audit/audit.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | All E2E audit logs | None |
| **Notifications Service** | `src/modules/notifications/notifications.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 10, 16; Milestone2 12, 16 | None |
| **Auth Service** | `src/modules/auth/auth.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 2, 4; Milestone2 Auth | None |
| **Tenants Service** | `src/modules/tenants/tenant.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 5, 6; Milestone2 1-7 | None |
| **Events Service** | `src/modules/events/events.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 7, 8; Milestone2 1, 2 | None |
| **Activity Service** | `src/modules/activities/activity.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 8, 9; Milestone2 Event/Act | None |
| **Ticket Types Service** | `src/modules/ticketTypes/ticketType.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 8, 9; Milestone2 15, 16 | None |
| **Dynamic Forms Service** | `src/modules/registrationForms/formField.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 8, 9; Milestone2 8 | None |
| **Customer Service** | `src/modules/customers/customer.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 16, 17, 18 | None |
| **Booking Service** | `src/modules/booking/booking.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 9, 10, 11; Milestone2 8-13, 15, 16 | None |
| **Tickets Service** | `src/modules/tickets/ticket.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 10, 12, 13; Milestone2 12, 14 | None |
| **Payments Service** | `src/modules/payments/payment.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 10; Milestone2 8-13 | None |
| **Webhook Controller** | `src/modules/payments/webhook.controller.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | Webhook tests, idempotency | None |
| **Verification Service** | `src/modules/verification/verification.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 12, 13, 14, 15; Milestone2 5, 6, 14 | None |
| **Public Service** | `src/modules/public/public.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 7, 8 | None |
| **Platform Service** | `src/modules/platform/platform.service.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | E2E 2, 3 | None |
| **Order Expiry Job** | `src/jobs/orderExpiry.job.js` | **MIGRATED** | Sequelize | Prisma 5.22.0 | Automated background runner | None |

---

## 2. Migration Phase Checklist

- [x] **Phase A: Shared Prisma Infrastructure**
  - Singleton `src/lib/prisma.js` instantiated.
  - Connection verified to MySQL `127.0.0.1:3306` (`ticket_panda_dev`).
  - Production-safe and dev-friendly logging configured.
  - Graceful shutdown handlers installed (`beforeExit`, `SIGINT`, `SIGTERM`).
- [x] **Phase B: Non-Critical & Read-Heavy Services**
  - `tenant.middleware.js` migrated with role and event scope enforcement.
  - `audit.service.js` migrated with non-blocking error absorption.
  - `notifications.service.js` migrated with email log persistence.
- [x] **Phase C: Core Domain Services**
  - Authentication and multi-step registration migrated.
  - Tenant profile, members, and settings management migrated.
  - Events, festival activities, ticket types, and dynamic forms migrated.
  - Customer recovery and OTP lifecycle migrated.
- [x] **Phase D: Transaction-Sensitive Services**
  - Booking initiation with MySQL row-level locking (`SELECT ... FOR UPDATE`).
  - Local test payment provider verified across all simulation states (`SUCCESS`, `FAILED`, `PENDING`, `RETRY`).
  - Idempotent ticket issuance (preventing duplicate ticket passes on double webhook/verification).
  - Gate scan preview, admission check-in, and anti-passback concurrency guard.
- [x] **Phase E: Full Regression & Deep Verification Testing**
  - 18/18 tests in `backend/tests/e2e.test.js` passed.
  - 16/16 tests in `backend/tests/milestone2.test.js` passed (tenant isolation, capacity race, payment lifecycle, check-in race).
- [x] **Phase F: Sequelize Decommissioning**
  - Removed `sequelize` dependency from `package.json`.
  - Permanently deleted legacy `src/config/database.js` and `src/database/` directory.
  - Zero remaining references to Sequelize in backend codebase.
  - Final full-suite regression (`npm run test:all`) passed with 34/34 tests green.
