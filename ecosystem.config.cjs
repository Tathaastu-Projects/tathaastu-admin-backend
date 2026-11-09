/**
 * PM2 production process — DO NOT use `npm run dev` / nodemon on live.
 * Order saves write JSON under storage/; nodemon treats that as a code change
 * and restarts mid-Easebuzz initiate → socket closed / nginx 502.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "mantrit_store_backend",
      cwd: __dirname,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
