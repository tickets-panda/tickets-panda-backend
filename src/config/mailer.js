import nodemailer from 'nodemailer';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let transporter = null;

if (env.smtp.configured) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
} else {
  logger.warn('SMTP is not configured — emails will be logged instead of sent.');
}

/**
 * Sends an email. When SMTP is not configured (e.g. local dev) the message is
 * logged so flows can still be exercised end to end.
 */
export const sendMail = async ({ to, subject, html, text, attachments = [] }) => {
  if (!transporter) {
    logger.info(`[mail:dry-run] to=${to} subject="${subject}"`);
    return { dryRun: true, messageId: `dry-run-${Date.now()}` };
  }
  return transporter.sendMail({
    from: `"${env.smtp.fromName}" <${env.smtp.from}>`,
    to,
    subject,
    html,
    text,
    attachments,
  });
};

export const isMailConfigured = () => Boolean(transporter);

export default { sendMail, isMailConfigured };
