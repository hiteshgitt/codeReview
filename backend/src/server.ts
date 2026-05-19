import app from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { startWorkerInProcess } from './workers/audit.worker';
import config from './config';
import { logger } from './utils/logger';
import { Worker } from 'bullmq';
import * as fs from 'fs';

async function start(): Promise<void> {
  // Ensure temp dir exists
  fs.mkdirSync(config.audit.tmpDir, { recursive: true });

  await connectDatabase();
  await connectRedis();

  let worker: Worker | null = null;

  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`, {
      env: config.env,
      pid: process.pid,
    });
    // Start worker after server is listening so startup errors don't block HTTP
    startWorkerInProcess()
      .then((w) => { worker = w; })
      .catch((err) => logger.error('Failed to start embedded worker', { err }));
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — graceful shutdown`);
    if (worker) await worker.close();
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
