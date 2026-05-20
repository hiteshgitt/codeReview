import app from './app';
import { connectDatabase, disconnectDatabase, prisma } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { scheduleAudit } from './services/audit.processor';
import config from './config';
import { logger } from './utils/logger';
import * as fs from 'fs';

async function recoverOrphanedAudits(): Promise<void> {
  const stuck = await prisma.audit.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    select: { id: true, websiteUrl: true, repoUrl: true, projectType: true, framework: true },
  });

  if (stuck.length === 0) return;

  logger.info(`Recovering ${stuck.length} orphaned audit(s) from previous run`);

  for (const audit of stuck) {
    await prisma.audit.update({ where: { id: audit.id }, data: { status: 'PENDING' } });
    scheduleAudit({
      auditId: audit.id,
      websiteUrl: audit.websiteUrl,
      repoUrl: audit.repoUrl ?? undefined,
      // repoToken is not stored in DB — private repos will re-run without auth
      projectType: audit.projectType ?? 'website',
      framework: audit.framework ?? 'html',
    });
  }
}

async function start(): Promise<void> {
  fs.mkdirSync(config.audit.tmpDir, { recursive: true });

  await connectDatabase();
  await connectRedis();

  // Re-schedule any audits that were in-flight when the process last exited
  await recoverOrphanedAudits();

  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`, {
      env: config.env,
      pid: process.pid,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — graceful shutdown`);
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
