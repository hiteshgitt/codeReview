import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

function newBullConnection(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });
  client.on('error', (err) => logger.error('BullMQ queue Redis error', { err }));
  return client;
}

export const AUDIT_QUEUE_NAME = 'audit-jobs';

export interface AuditJobData {
  auditId: string;
  websiteUrl: string;
  repoUrl?: string;
  repoToken?: string;
  projectType?: string;
  framework?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auditQueue: Queue<AuditJobData, any, string> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAuditQueue(): Queue<AuditJobData, any, string> {
  if (!auditQueue) {
    const connection = newBullConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditQueue = new Queue<AuditJobData, any, string>(AUDIT_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });

    auditQueue.on('error', (err) => {
      logger.error('Audit queue error', { err });
    });
  }

  return auditQueue;
}

class QueueService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async enqueueAudit(data: AuditJobData): Promise<Job<AuditJobData, any, string>> {
    const queue = getAuditQueue();
    const job = await queue.add('run-audit', data, {
      jobId: `audit-${data.auditId}`,
    });
    logger.info('Audit job enqueued', { jobId: job.id, auditId: data.auditId });
    return job;
  }

  async getJobStatus(jobId: string) {
    const queue = getAuditQueue();
    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return { state, progress: job.progress, failedReason: job.failedReason };
  }

  async getQueueMetrics() {
    const queue = getAuditQueue();
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }
}

export const queueService = new QueueService();
