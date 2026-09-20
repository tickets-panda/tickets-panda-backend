import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { env } from '../../config/env.js';
import { normaliseEmail } from '../../utils/helpers.js';

/** Creates the platform owner account if it does not already exist. */
export async function seedPlatformAdmin() {
  const email = normaliseEmail(env.seed.ownerEmail);
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return { created: false, user: existing };
  }

  const passwordHash = await bcrypt.hash(env.seed.ownerPassword, 12);
  const user = await User.create({
    name: 'Ticket Panda Owner',
    email,
    passwordHash,
    role: 'PLATFORM_OWNER',
    isActive: true,
  });

  return { created: true, user };
}

export default seedPlatformAdmin;
