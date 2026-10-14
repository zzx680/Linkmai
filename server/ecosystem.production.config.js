module.exports = {
  apps: [
    {
      name: 'linkmai-production-api',
      cwd: process.env.LINKMAI_CURRENT || '/var/www/linkmai-production/current/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      uid: 'linkmai',
      gid: 'linkmai',
      autorestart: true,
      max_memory_restart: '1024M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      time: true,
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: process.env.LINKMAI_ENV_FILE || '/etc/linkmai/production.env',
      },
      out_file: '/var/log/linkmai/production-out.log',
      error_file: '/var/log/linkmai/production-error.log',
      merge_logs: true,
    },
  ],
}
