import { connectDatabase, sequelize } from '../config/database.js';
import { logger } from '../utils/logger.js';
import './models/index.js';
import { seedDatabase } from './seeders/index.js';

async function run() {
  await connectDatabase();
  await seedDatabase();
  await sequelize.close();
  logger.info('Seeding complete.');
}

run().catch(async (err) => {
  logger.error(`Seeding failed: ${err.message}`);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
