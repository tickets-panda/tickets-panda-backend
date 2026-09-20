import Joi from 'joi';

const identifier = {
  ticketKey: Joi.string().trim().max(40),
  verificationToken: Joi.string().trim().max(300),
  eventId: Joi.number().integer().positive(),
};

const hasIdentifier = (value, helpers) => {
  if (!value.ticketKey && !value.verificationToken && !value.token) {
    return helpers.error('any.custom', { message: 'Provide a ticket key or a scanned QR token' });
  }
  return value;
};

export const verifyTicketSchema = Joi.object({
  ...identifier,
  // Accepts either a raw token or a full verification URL from a QR scan.
  token: Joi.string().trim().max(300),
}).custom(hasIdentifier);

export const checkinSchema = Joi.object({
  ...identifier,
  token: Joi.string().trim().max(300),
  gateName: Joi.string().trim().max(50).allow('', null),
}).custom(hasIdentifier);

export default { verifyTicketSchema, checkinSchema };
