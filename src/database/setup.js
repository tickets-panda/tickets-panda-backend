import { connectDatabase, sequelize } from '../config/database.js';
import { logger } from '../utils/logger.js';
import './models/index.js';
import { seedDatabase } from './seeders/index.js';

/**
 * Creates all tables from the Sequelize models and seeds initial data.
 * Usage: npm run db:setup [-- --fresh]   (--fresh drops existing tables first)
 */
async function run() {
  const fresh = process.argv.includes('--fresh');
  await connectDatabase();

  if (fresh) {
    logger.warn('Dropping all tables (--fresh)');
    await sequelize.drop();
  }

  await sequelize.sync({ alter: false });
  logger.info('Schema synchronised — all tables are present.');

  await seedDatabase();
  await sequelize.close();
  logger.info('Database setup complete.');
}

run().catch(async (err) => {
  logger.error(`Database setup failed: ${err.message}`);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
