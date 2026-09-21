# Ticket Panda API — VPS deploy (PM2 + standalone MySQL 8)

## 0. Non-negotiables

- **HTTPS on the API domain is mandatory.** In production the API sets
  `Secure; SameSite=None` refresh cookies — browsers drop them over plain
  HTTP, which breaks login on the Vercel frontend. Terminate TLS with
  Nginx + Let's Encrypt (sample below).
- **JWT secrets must be fresh** (`openssl rand -hex 32` twice).
- **Payments:** `PAYMENT_PROVIDER=razorpay` + live Razorpay keys.
  The `local` provider refuses to run when `NODE_ENV=production`.
- **Mail:** switch the Resend temp block back to the Gmail SMTP block
  (both live in `.env`; production creds below).
- **Single API process.** The order-expiry job runs in-process
  (`ecosystem.config.cjs` uses 1 forked instance) — never scale past 1
  without externalizing it.

## 1. DNS + MySQL

Point `api.yourdomain.com` (A record) at the VPS, then on the server:

```bash
sudo apt update && sudo apt install -y mysql-server-8.0 nodejs npm
sudo mysql <<'SQL'
CREATE DATABASE ticket_panda CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ticketpanda'@'localhost' IDENTIFIED BY '<STRONG_PASSWORD>';
GRANT ALL PRIVILEGES ON ticket_panda.* TO 'ticketpanda'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 2. App env

Copy `.env.example` to `.env` and set:

| Var | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `APP_URL` | `https://api.yourdomain.com` |
| `DATABASE_URL` | `mysql://ticketpanda:<STRONG_PASSWORD>@localhost:3306/ticket_panda` |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | same values, split out |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | fresh random hex |
| `CLIENT_URL` / `TENANT_DASHBOARD_URL` / `PLATFORM_ADMIN_URL` | `https://your-vercel-app.vercel.app` (all three) |
| `PAYMENT_PROVIDER` | `razorpay` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | live keys |
| `SMTP_*` / `EMAIL_FROM` | Gmail SMTP block |
| `SEED_*` | platform owner + whether to seed the demo tenant |

## 3. Deploy

```bash
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
node prisma/seed.js                                # first deploy only
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup
curl https://api.yourdomain.com/health
```

## 4. Nginx + TLS

```nginx
server {
  listen 443 ssl;
  server_name api.yourdomain.com;
  ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then `certbot --nginx -d api.yourdomain.com`. The app already sets
`trust proxy`, so rate limiting sees real client IPs.

## 5. Local dev is unchanged

`npm run db:setup` (`prisma db push`) remains the local flow.
`prisma/migrations/` is the prod baseline applied via `migrate deploy`.
