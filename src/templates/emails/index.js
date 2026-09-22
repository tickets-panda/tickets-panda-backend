import { env } from '../../config/env.js';

const layout = ({ title, body, footer = 'Ticket Panda — Automate the gate. 🐼' }) => `
<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;color:#18181b;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      <div style="background:#F97316;padding:18px 24px;border-radius:12px 12px 0 0;">
        <span style="color:#fff;font-size:18px;font-weight:700;">🐼 Ticket Panda</span>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;">
        <h2 style="margin:0 0 16px;font-size:20px;">${title}</h2>
        ${body}
      </div>
      <p style="text-align:center;color:#71717a;font-size:12px;margin-top:16px;">${footer}</p>
    </div>
  </body>
</html>`;

const button = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:#F97316;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">${label}</a>`;

const row = (label, value) =>
  `<tr><td style="padding:6px 0;color:#71717a;">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${value}</td></tr>`;

export const welcomeTenantEmail = ({ name, tenantName, dashboardUrl }) => ({
  subject: `Welcome to Ticket Panda, ${tenantName}!`,
  templateName: 'welcome_tenant',
  html: layout({
    title: `Welcome aboard, ${name}!`,
    body: `
      <p>Your organization <strong>${tenantName}</strong> is now on Ticket Panda.</p>
      <p>Create your first event, add ticket types and share the public link — payments, tickets and gate check-in are handled for you.</p>
      <p style="margin:24px 0;">${button(dashboardUrl, 'Open your dashboard')}</p>
      <p style="color:#71717a;font-size:13px;">If you didn't create this account, you can ignore this email.</p>`,
  }),
});

export const otpEmail = ({ otp, expiryMinutes }) => ({
  subject: `Your Ticket Panda access code: ${otp}`,
  templateName: 'otp',
  html: layout({
    title: 'Your access code',
    body: `
      <p>Use the code below to access your tickets. It expires in ${expiryMinutes} minutes.</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;text-align:center;margin:24px 0;">${otp}</p>
      <p style="color:#71717a;font-size:13px;">Never share this code with anyone.</p>`,
  }),
});

export const passwordResetEmail = ({ name, resetUrl }) => ({
  subject: 'Reset your Ticket Panda password',
  templateName: 'password_reset',
  html: layout({
    title: 'Reset your password',
    body: `
      <p>Hi ${name}, we received a request to reset your password.</p>
      <p style="margin:24px 0;">${button(resetUrl, 'Reset password')}</p>
      <p style="color:#71717a;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>`,
  }),
});

export const ticketConfirmationEmail = ({ customerName, event, orderRef, amount, currency, tickets }) => {
  const ticketRows = tickets
    .map(
      (t) => `<tr><td style="padding:8px 0;">${t.ticketTypeName}</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-weight:600;">${t.ticketKey}</td></tr>`,
    )
    .join('');

  return {
    subject: `Your tickets for ${event.title} are confirmed 🎟️`,
    templateName: 'ticket_confirmation',
    html: layout({
      title: `You're going to ${event.title}!`,
      body: `
        <p>Hi ${customerName}, your payment was verified and your tickets are ready.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${row('Order', orderRef)}
          ${row('Date', event.eventDate)}
          ${row('Time', event.eventTimeStart)}
          ${row('Venue', event.venueName)}
          ${row('Amount', `${currency} ${Number(amount).toFixed(2)}`)}
        </table>
        <h3 style="font-size:15px;margin:20px 0 8px;">Your tickets</h3>
        <table style="width:100%;border-collapse:collapse;">${ticketRows}</table>
        <p style="color:#71717a;font-size:13px;margin-top:20px;">Each ticket has a QR code attached. Show it at the gate for entry.</p>`,
    }),
  };
};

export const tenantBookingEmail = ({ tenantName, event, orderRef, customer, quantity, amount, currency, dashboardUrl }) => ({
  subject: `New booking: ${event.title} (${orderRef})`,
  templateName: 'tenant_booking',
  html: layout({
    title: 'You have a new booking 🎉',
    body: `
      <p><strong>${tenantName}</strong>, a new booking was confirmed for ${event.title}.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${row('Order', orderRef)}
        ${row('Customer', customer.name)}
        ${row('Email', customer.email)}
        ${row('Tickets', quantity)}
        ${row('Amount', `${currency} ${Number(amount).toFixed(2)}`)}
      </table>
      <p style="margin:24px 0;">${button(dashboardUrl, 'View in dashboard')}</p>`,
  }),
});

export const emailTemplates = {
  welcome_tenant: welcomeTenantEmail,
  otp: otpEmail,
  password_reset: passwordResetEmail,
  ticket_confirmation: ticketConfirmationEmail,
  tenant_booking: tenantBookingEmail,
};

export const defaultDashboardUrl = () => `${env.tenantUrl}/studio/dashboard`;

export default emailTemplates;
