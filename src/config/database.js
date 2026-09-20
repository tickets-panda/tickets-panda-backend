import path from 'node:path';
import fs from 'node:fs';
import { Sequelize } from 'sequelize';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const shared = {
  logging: env.db.logging ? (msg) => logger.debug(msg) : false,
  define: {
    underscored: true,
    timestamps: true,
    freezeTableName: true,
  },
};

function createSequelize() {
  if (env.db.dialect === 'sqlite') {
    // Dev-only fallback: no server required, so the whole stack can run locally.
    const storage = path.resolve(process.cwd(), env.db.storage);
    fs.mkdirSync(path.dirname(storage), { recursive: true });
    logger.warn(`DB_DIALECT=sqlite — using ${storage}. Switch to mysql for production.`);
    return new Sequelize({ ...shared, dialect: 'sqlite', storage });
  }

  return new Sequelize(env.db.name, env.db.user, env.db.password, {
    ...shared,
    host: env.db.host,
    port: env.db.port,
    dialect: 'mysql',
    timezone: '+00:00',
    pool: {
      min: env.db.poolMin,
      max: env.db.poolMax,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      dateStrings: true,
      typeCast: true,
    },
  });
}

export const sequelize = createSequelize();

/** True when running on the SQLite dev fallback. */
export const isSqlite = () => sequelize.getDialect() === 'sqlite';

/** SQL expression that subtracts `amount` from sold_count without going negative. */
export const clampDecrement = (column, amount) =>
  isSqlite()
    ? sequelize.literal(`MAX(${column} - ${Number(amount)}, 0)`)
    : sequelize.literal(`GREATEST(${column} - ${Number(amount)}, 0)`);

export async function connectDatabase() {
  await sequelize.authenticate();
  if (isSqlite()) {
    logger.info(`Database connected: sqlite (${env.db.storage})`);
  } else {
    logger.info(`Database connected: ${env.db.host}:${env.db.port}/${env.db.name}`);
  }
  return sequelize;
}

export default sequelize;
