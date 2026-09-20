# Ticket Panda — Prisma & MySQL Local Development Setup Guide

This guide walks through setting up, running, testing, and managing the **Ticket Panda** backend using **Prisma ORM** with **MySQL 8.4 LTS**.

---

## 1. Prerequisites

- **Node.js**: v18+ (tested and verified on Node.js v24.x LTS)
- **MySQL**: MySQL 8.4 LTS (or 8.0+) running locally on port `3306`
- **npm**: v10+

---

## 2. Environment Configuration

In `backend/.env`, ensure the following MySQL connection URL and database credentials are set:

```ini
# Environment
NODE_ENV=development
PORT=5000
APP_NAME=TicketPanda
APP_URL=http://localhost:5000

# Prisma & MySQL Database Configuration
DATABASE_URL="mysql://ticketpanda:ticketpanda@localhost:3306/ticket_panda_dev"
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ticket_panda_dev
DB_USER=ticketpanda
DB_PASSWORD=ticketpanda
DB_LOGGING=false

# JWT Secrets
JWT_ACCESS_SECRET=2027a3d991c9053111553d85d0857d2610eafd83c7894cc1928551239464db9e575479ee167acd8e10d170d983760c6a
JWT_REFRESH_SECRET=787f788741fc50b147afb37546059f271678f3f2e29d9fc35c73c15236f3067ac2ca2d36a74233dcf586a0ab20723805
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
JWT_CUSTOMER_EXPIRY=30m

# Payment Provider
PAYMENT_PROVIDER=local

# Gmail SMTP (Configured for live ticket & OTP delivery)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ticketspanda.tech@gmail.com
SMTP_PASS=eorgfnshxzijkqov
EMAIL_FROM=ticketspanda.tech@gmail.com
EMAIL_FROM_NAME=Ticket Panda

# Frontend CORS
CLIENT_URL=http://localhost:3000
TENANT_DASHBOARD_URL=http://localhost:3000
PLATFORM_ADMIN_URL=http://localhost:3000
```

> **Note on Payments:** `PAYMENT_PROVIDER=local` enables the built-in `LocalTestPaymentProvider`. No Razorpay account or keys are required to test the entire booking, ticketing, and verification lifecycle.

---

## 3. Database Initialization & Push

If you are setting up on a fresh machine or need to reset the schema, run:

```bash
# Navigate to backend directory
cd backend

# Synchronize Prisma schema with MySQL database
npm run db:setup
# (This executes: prisma db push)
```

`prisma db push` inspects `prisma/schema.prisma` and creates/updates all 18 MySQL tables without requiring migration files during local development.

---

## 4. Seeding Demo Data

Seed the database with the initial platform admin and a complete demo college tenant ("Nehru College" with the "Pandaves 2026" festival):

```bash
npm run db:seed
# (This executes: node prisma/seed.js)
```

### Seeded Credentials

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **Platform Super Admin** | `admin@ticketpanda.io` | `Password123` | Full access to platform dashboard, tenants, and global stats. |
| **Tenant Admin** | `admin@nehru-college.edu` | `Password123` | Manages "Nehru Arts and Science College", Pandaves 2026 festival, activities, tickets, forms, and gate verification. |

### Seeded Festival Data
- **Tenant:** Nehru Arts and Science College (`slug: nehru-college`)
- **Event:** Pandaves 2026 (`slug: pandaves-2026`, 1,500 capacity, 30 days in future)
- **Activities (4):** Solo Dance, Solo Singing, Group Dance, Quiz
- **Ticket Types (5):**
  - Solo Dance Entry (₹150, qty 50)
  - Solo Singing Entry (₹150, qty 40)
  - Group Dance Team Entry (₹500, qty 30)
  - Quiz Team Entry (₹100, qty 60)
  - All-Access Delegate Pass (₹299, qty 500)
- **Dynamic Form Fields (3):** Register Number (required), Department (required), College Name (required)

---

## 5. Visual Database GUI: Prisma Studio

To explore, query, and inspect database records directly in a clean web browser GUI:

```bash
npx prisma studio
```
Prisma Studio opens at `http://localhost:5555`.

---

## 6. Running the Automated E2E Test Suite

Verify that all 18 end-to-end integration tests pass:

```bash
npm test
# (This executes: node tests/e2e.test.js)
```

The test runs through:
1. Health check
2. Platform Admin login & dashboard metrics
3. Tenant Admin login, profile, and dashboard stats
4. Public event search & festival detail retrieval
5. Dynamic registration form validation & booking initiation
6. Local test payment capture (`SUCCESS` state)
7. PDF ticket generation and QR code creation
8. Gate QR scan preview (`VALID` result)
9. Gate entry admission (1st scan)
10. Anti-passback duplicate rejection (2nd scan returns `409 Conflict`)
11. Real-time gate statistics calculation
12. Customer recovery OTP dispatch & verification
13. "My Tickets" recovery query

---

## 7. Starting the API Server

### Development Mode (with hot-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The backend server listens on `http://localhost:5000`.

---

## 8. Troubleshooting

### MySQL Authentication Error:
If you see `Authentication failed against database server at localhost`, ensure the user `ticketpanda` has been granted permissions:
```sql
ALTER USER 'ticketpanda'@'localhost' IDENTIFIED BY 'ticketpanda';
CREATE USER IF NOT EXISTS 'ticketpanda'@'127.0.0.1' IDENTIFIED BY 'ticketpanda';
GRANT ALL PRIVILEGES ON ticket_panda_dev.* TO 'ticketpanda'@'localhost';
GRANT ALL PRIVILEGES ON ticket_panda_dev.* TO 'ticketpanda'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### Generating Prisma Client:
If you modify `prisma/schema.prisma`, regenerate the client with:
```bash
npx prisma generate
```
