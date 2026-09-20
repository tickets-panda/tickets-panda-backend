import prisma from '../../lib/prisma.js';
import { sendMail, isMailConfigured } from '../../config/mailer.js';
import { logger } from '../../utils/logger.js';
import { emailTemplates } from '../../templates/emails/index.js';

/**
 * Renders a named template, sends it, and records the attempt in email_logs.
 * Failures are logged and swallowed so they never abort a business transaction.
 */
export async function sendTemplateEmail({
  template,
  to,
  data = {},
  tenantId = null,
  refType = 'general',
  refId = 0,
  attachments = [],
}) {
  const renderer = emailTemplates[template];
  if (!renderer) throw new Error(`Unknown email template: ${template}`);

  const { subject, html, templateName } = renderer(data);

  let status = 'SENT';
  let errorMessage = null;
  let sentAt = new Date();

  try {
    await sendMail({ to, subject, html, attachments });
  } catch (err) {
    status = 'FAILED';
    errorMessage = err.message;
    sentAt = new Date();
    logger.error(`Email "${template}" to ${to} failed: ${err.message}`);
  }

  try {
    await prisma.emailLog.create({
      data: {
        tenantId: tenantId ? Number(tenantId) : null,
        toEmail: to,
        subject,
        templateName,
        refType,
        refId: refId ? Number(refId) : null,
        status,
        errorMessage,
        sentAt,
      },
    });
  } catch (err) {
    logger.error(`Failed to record email log: ${err.message}`);
  }

  return { status, subject, dryRun: !isMailConfigured() };
}

export default { sendTemplateEmail };
