module.exports = {
  apps: [
    {
      name:         'crm-web',
      script:       'node_modules/.bin/next',
      args:         'start',
      cwd:          __dirname,
      instances:    1,
      autorestart:  true,
      watch:        false,
      env: {
        NODE_ENV: 'production',
        PORT:     3002,
      },
    },
    {
      name:         'crm-worker',
      script:       'node_modules/.bin/tsx',
      args:         'src/workers/index.ts',
      cwd:          __dirname,
      instances:    1,
      autorestart:  true,
      watch:        false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
