import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { seedPlatformAdmin } from './platformAdmin.js';
import { seedDemoTenant } from './demoTenant.js';

export async function seedDatabase() {
  const admin = await seedPlatformAdmin();
  logger.info(admin.created ? `Platform owner created: ${admin.user.email}` : `Platform owner already exists: ${admin.user.email}`);

  if (env.seed.demoTenant) {
    const demo = await seedDemoTenant();
    if (demo.created) {
      logger.info(`Demo tenant created: ${demo.tenant.slug} (login ${demo.user.email})`);
    } else {
      logger.info('Demo tenant already exists — skipping.');
    }
  }

  return { admin };
}

export default seedDatabase;
