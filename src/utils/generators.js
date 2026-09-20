import { customAlphabet } from 'nanoid';
import crypto from 'crypto';

// 32-char alphabet — no I, O, 0, 1 to avoid transcription errors.
const ticketNanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 12);
const refNanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export const generateTicketKey = () => `TP-${ticketNanoid()}`;

export const generateVerificationToken = () => crypto.randomBytes(32).toString('hex');

export const generateOrderRef = () => `TP-ORD-${refNanoid()}`;

export const generateRegistrationRef = () => `TP-REG-${refNanoid()}`;

export const generateOtp = (length = 6) => {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
};

export const generateResetToken = () => crypto.randomBytes(24).toString('hex');

export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Generates a slug that is unique within the scope defined by `isTaken`.
 * @param {string} value base text
 * @param {(slug: string) => Promise<boolean>} isTaken async uniqueness check
 */
export const uniqueSlug = async (value, isTaken) => {
  const base = slugify(value) || 'item';
  let candidate = base;
  let counter = 1;
  // Bounded loop: 50 attempts then fall back to a random suffix.
  while (counter < 50 && (await isTaken(candidate))) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  if (await isTaken(candidate)) return `${base}-${refNanoid().toLowerCase()}`;
  return candidate;
};

export default {
  generateTicketKey,
  generateVerificationToken,
  generateOrderRef,
  generateRegistrationRef,
  generateOtp,
  generateResetToken,
  slugify,
  uniqueSlug,
};
