# Ticket Panda — Prisma Transaction & Concurrency Audit
**Milestone:** Milestone 2 (Service Migration)  
**Date:** 2026-09-20  
**Database:** MySQL 8.4 LTS (`ticket_panda_dev`)  
**Engine:** InnoDB (ACID compliant, Row-Level Locking)

---

## 1. Overview & Concurrency Philosophy

Ticketing systems have strict, zero-tolerance data-integrity requirements:
1. **Inventory Overselling Protection:** Two buyers must never be allowed to claim the last available ticket at the exact same instant.
2. **Anti-Passback Entry Protection:** Two gate attendants scanning the exact same ticket QR code at the exact same millisecond must never both admit the bearer.
3. **Multi-Entity Atomicity:** Tenant provisioning and booking initiation span multiple database tables that must succeed together or roll back entirely.

In Sequelize, these guarantees were provided via `sequelize.transaction(async (t) => ...)` with `lock: t.LOCK.UPDATE`. In Prisma ORM, these are implemented via interactive transactions `prisma.$transaction(async (tx) => ...)` combined with explicit MySQL pessimistic row locks (`SELECT ... FOR UPDATE`).

---

## 2. Transaction Audits by Service

### 2.1 Tenant Provisioning Transaction
- **File:** `src/modules/auth/auth.service.js` -> `registerTenant`
- **Tables Affected:** `users`, `tenants`, `tenant_members`
- **Implementation:**
  ```javascript
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name, email, passwordHash, phone } });
    const tenant = await tx.tenant.create({ data: { name, slug, email, phone, websiteUrl, status: 'PENDING_VERIFICATION' } });
    await tx.tenantMember.create({ data: { userId: user.id, tenantId: tenant.id, role: 'TENANT_OWNER', isActive: true } });
    return { user, tenant };
  });
  ```
- **Atomicity Guarantee:** If any step fails (e.g., duplicate slug or connection glitch), neither the user nor the tenant is created. Zero orphaned records.

---

### 2.2 Booking Initiation & Capacity Row-Locking
- **File:** `src/modules/booking/booking.service.js` -> `initiateBooking`
- **Tables Affected:** `ticket_types` (locked), `customers`, `registrations`, `registration_data`, `orders`, `payments`
- **Implementation:**
  ```javascript
  const { registration, order } = await prisma.$transaction(async (tx) => {
    // 1. MySQL Pessimistic Row Lock on Ticket Type
    const [locked] = await tx.$queryRaw`SELECT * FROM ticket_types WHERE id = ${ticketType.id} FOR UPDATE`;
    if (!locked) throw new NotFoundError('Ticket type not found');

    // 2. Exact Inventory Check Under Lock
    if (locked.sold_count + quantity > locked.quantity) {
      throw new ConflictError('Not enough tickets remaining for this ticket type');
    }

    // 3. Event-Level Maximum Capacity Check Under Lock
    if (event.maxCapacity) {
      const heldAgg = await tx.ticketType.aggregate({
        _sum: { soldCount: true },
        where: { eventId: event.id },
      });
      const held = Number(heldAgg._sum.soldCount || 0);
      if (held + quantity > event.maxCapacity) {
        throw new ConflictError('This event has reached its maximum capacity');
      }
    }

    // 4. Reserve Inventory Atomically
    await tx.ticketType.update({
      where: { id: ticketType.id },
      data: { soldCount: { increment: quantity } },
    });

    // 5. Create Customer, Registration, Form Data, Order, Payment
    ...
  });
  ```
- **Concurrency Proof (Milestone 2 Test #15):**
  - **Setup:** A ticket type was created with `quantity = 1` and `soldCount = 0`.
  - **Action:** Two concurrent `POST /api/v1/booking/initiate` requests were fired at the exact same millisecond via `Promise.all`.
  - **Outcome:** Exactly one request was granted `201 Created` and reserved the seat. The competing request was blocked by the row lock and rejected with `409 Conflict: Not enough tickets remaining for this ticket type`. `soldCount` remained exactly `1`.

---

### 2.3 Payment Finalisation & Ticket Issuance (Idempotent)
- **File:** `src/modules/booking/booking.service.js` -> `finalisePaidOrder`
- **Tables Affected:** `payments`, `orders`, `registrations`, `tickets`
- **Implementation:**
  ```javascript
  if (order.status === 'PAID') {
    return prisma.ticket.findMany({ where: { orderId: order.id } });
  }

  const tickets = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'CAPTURED', capturedAt: new Date(), ... },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'PAID' },
    });
    await tx.registration.update({
      where: { id: registration.id },
      data: { status: 'CONFIRMED' },
    });

    return generateTicketsForOrder({ order, registration, tx });
  });
  ```
- **Idempotency Proof (Milestone 2 Test #13):**
  - Calling payment verification a second time for an already paid order immediately returns the existing tickets with `alreadyProcessed: true`. Zero duplicate tickets are created.

---

### 2.4 Gate Check-In & Anti-Passback Concurrency Guard
- **File:** `src/modules/verification/verification.service.js` -> `checkIn`
- **Tables Affected:** `tickets` (locked), `checkins`
- **Implementation:**
  ```javascript
  const checkin = await prisma.$transaction(async (tx) => {
    // 1. Pessimistic Row Lock on Ticket
    const [locked] = await tx.$queryRaw`SELECT * FROM tickets WHERE id = ${ticket.id} FOR UPDATE`;
    if (!locked) throw new NotFoundError('Ticket not found');

    // 2. Anti-Passback Guard: Confirm status is still ACTIVE
    if (locked.status !== 'ACTIVE') {
      throw new ConflictError('This ticket has already been checked in');
    }

    // 3. Invalidate Ticket
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED' },
    });

    // 4. Create Entry Log
    return tx.checkin.create({
      data: {
        ticketId: ticket.id,
        tenantId: ticket.tenantId,
        eventId: ticket.eventId,
        activityId: ticket.activityId || null,
        checkedInBy: user.id,
        gateName,
      },
    });
  });
  ```
- **Concurrency Proof (Milestone 2 Test #14):**
  - **Setup:** A valid active ticket was scanned simultaneously from two simulated gate readers (`Gate North` and `Gate South`) via `Promise.all`.
  - **Outcome:** The transaction serialized the requests in MySQL. The first scanner received `200 OK` (`result: 'CHECKED_IN'`). The second scanner was immediately rejected with `409 Conflict` (`This ticket was already used at ...`).

---

## 3. Audit Summary Table

| Transaction Target | Locking Mechanism | Isolation Level | Rollback Trigger | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **Tenant Registration** | Implicit table/row lock | Read Committed | Any insert failure or unique clash | Auth Registration |
| **Inventory Reservation** | `SELECT ... FOR UPDATE` | Read Committed | `sold_count + qty > capacity` | Milestone 2 Test #15 |
| **Payment Finalisation** | Idempotent status check | Read Committed | Payment mismatch or signature error | Milestone 2 Test #12, 13 |
| **Gate Check-in Entry** | `SELECT ... FOR UPDATE` | Read Committed | `ticket.status !== 'ACTIVE'` | Milestone 2 Test #14 |
| **Order Expiry Cleanup** | Row lock on ticket type | Read Committed | Timeout or concurrency | Order Expiry Job |
