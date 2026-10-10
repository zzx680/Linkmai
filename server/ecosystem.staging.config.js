module.exports = {
  apps: [
    {
      name: 'linkmai-staging-api',
      cwd: process.env.LINKMAI_CURRENT || '/var/www/linkmai-staging/current/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      uid: 'linkmai',
      gid: 'linkmai',
      autorestart: true,
      max_memory_restart: '640M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      time: true,
      env: {
        NODE_ENV: 'staging',
        DOTENV_CONFIG_PATH: process.env.LINKMAI_ENV_FILE || '/etc/linkmai/staging.env',
      },
      out_file: '/var/log/linkmai/staging-out.log',
      error_file: '/var/log/linkmai/staging-error.log',
      merge_logs: true,
    },
  ],
}
