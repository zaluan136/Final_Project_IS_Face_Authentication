const env = require('./config/env');
const { createApp } = require('./app');

if (env.isProduction && env.sessionSecret.startsWith('dev-only')) {
  console.error('FATAL: SESSION_SECRET must be changed from the default value in production.');
  process.exit(1);
}

const { app, close } = createApp();

const server = app.listen(env.port, env.host, () => {
  console.log(`AttendSecure server running at http://${env.host}:${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
