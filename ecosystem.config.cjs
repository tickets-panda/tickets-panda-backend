// PM2 process file for VPS deploys without Docker.
// Usage: npm ci --omit=dev && npx prisma generate && npx prisma migrate deploy
//        pm2 start ecosystem.config.cjs --env production && pm2 save
module.exports = {
  apps: [
    {
      name: 'ticket-panda-api',
      script: 'server.js',
      instances: 1, // keep 1: the order-expiry job must run exactly once
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
