import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../config/database';
import { connectDatabase } from '../config/database';
import { AUDIT_QUEUE_NAME, AuditJobData } from '../services/queue.service';
import { analyzeLighthouse } from '../services/analysis/lighthouse.service';
import { analyzeSEO } from '../services/analysis/seo.service';
import { analyzeResponsiveness } from '../services/analysis/responsiveness.service';
import { analyzeCodeQuality } from '../services/analysis/code-quality.service';
import { analyzeUX } from '../services/analysis/ux.service';
import { analyzeSecurityHeaders } from '../services/analysis/security.service';
import { calculateOverallScore } from '../services/analysis/scoring';
import { AuditScores } from '../types';
import { logger } from '../utils/logger';
import config from '../config';
import * as fs from 'fs';

const FRAMEWORK_LABELS: Record<string, string> = {
  html: 'HTML/CSS/JS',
  php: 'PHP',
  nextjs: 'Next.js',
  react: 'React',
  vue: 'Vue.js',
  laravel: 'Laravel',
  codeigniter: 'CodeIgniter',
  wordpress: 'WordPress',
};

function buildNoRepoIssue(projectType: string, framework: string) {
  if (projectType === 'landing_page') {
    return [{
      id: 'no-repo-lp',
      category: 'code-quality' as const,
      severity: 'suggestion' as const,
      title: 'No repository provided for code quality analysis',
      description: 'This landing page was analysed without a source repository.',
      recommendation: 'Provide a git repository URL to enable linting, formatting, and file-structure checks.',
      impact: 'Code quality metrics are unavailable without repository access.',
    }];
  }
  const label = FRAMEWORK_LABELS[framework] ?? framework;
  return [{
    id: 'no-repo',
    category: 'code-quality' as const,
    severity: 'suggestion' as const,
    title: `No repository provided for ${label} project`,
    description: `Code quality analysis for ${label} requires a repository URL.`,
    recommendation: `Provide a git repository URL to enable ${label}-specific linting, dependency audits, and structure checks.`,
    impact: 'Code quality metrics are unavailable without repository access.',
  }];
}

async function processAuditJob(job: Job<AuditJobData>): Promise<void> {
  const { auditId, websiteUrl, repoUrl, repoToken, projectType = 'website', framework = 'html' } = job.data;
  logger.info('Processing audit job', { auditId, websiteUrl, jobId: job.id });

  await prisma.audit.update({
    where: { id: auditId },
    data: { status: 'RUNNING' },
  });

  await job.updateProgress(5);

  try {
    // Run all analyses in parallel where possible
    const [lighthouseResults, seoResult, responsivenessResult, uxResult, securityResult] = await Promise.all([
      analyzeLighthouse(websiteUrl).catch((err) => {
        logger.error('Lighthouse analysis error', { err, auditId });
        return null;
      }),
      analyzeSEO(websiteUrl).catch((err) => {
        logger.error('SEO analysis error', { err, auditId });
        return null;
      }),
      analyzeResponsiveness(websiteUrl).catch((err) => {
        logger.error('Responsiveness analysis error', { err, auditId });
        return null;
      }),
      analyzeUX(websiteUrl).catch((err) => {
        logger.error('UX analysis error', { err, auditId });
        return null;
      }),
      analyzeSecurityHeaders(websiteUrl).catch((err) => {
        logger.error('Security analysis error', { err, auditId });
        return null;
      }),
    ]);

    await job.updateProgress(70);

    // Code quality analysis (only if repo URL provided)
    let codeQualityResult = null;
    if (repoUrl) {
      codeQualityResult = await analyzeCodeQuality(repoUrl, framework, repoToken).catch((err) => {
        logger.error('Code quality analysis error', { err, auditId });
        return null;
      });
    }

    await job.updateProgress(90);

    const noRepoIssue = buildNoRepoIssue(projectType, framework);

    const scores: AuditScores = {
      performance: lighthouseResults?.performance ?? { score: 0, issues: [], metrics: {} },
      accessibility: lighthouseResults?.accessibility ?? { score: 0, issues: [], metrics: {} },
      seo: seoResult ?? { score: 0, issues: [], metrics: {} },
      bestPractices: lighthouseResults?.bestPractices ?? { score: 0, issues: [], metrics: {} },
      security: securityResult ?? { score: 0, issues: [], metrics: {} },
      codeQuality: codeQualityResult ?? {
        score: repoUrl ? 0 : 5,
        issues: repoUrl ? [] : noRepoIssue,
        metrics: { skipped: !repoUrl, projectType, framework },
      },
      responsiveness: responsivenessResult ?? { score: 0, issues: [], metrics: {} },
      uxUi: uxResult ?? { score: 0, issues: [], metrics: {} },
    };

    const overallScore = calculateOverallScore(scores);

    // Flatten all issues into a single array for quick querying
    const allIssues = Object.values(scores).flatMap((cat) => cat.issues);

    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: 'COMPLETED',
        overallScore,
        scores: scores as object,
        issues: allIssues as object,
        lighthouseData: lighthouseResults?.lighthouseData
          ? (lighthouseResults.lighthouseData as object)
          : undefined,
        completedAt: new Date(),
      },
    });

    await job.updateProgress(100);
    logger.info('Audit completed', { auditId, overallScore });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Audit job failed', { error, auditId });

    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: 'FAILED',
        errorMessage: message,
      },
    });

    throw error;
  }
}

export async function startWorkerInProcess(): Promise<Worker<AuditJobData>> {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker<AuditJobData>(AUDIT_QUEUE_NAME, processAuditJob, {
    connection,
    concurrency: config.audit.maxConcurrent,
    limiter: {
      max: config.audit.maxConcurrent,
      duration: 60000,
    },
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, err: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { err });
  });

  logger.info('Audit worker started', {
    queue: AUDIT_QUEUE_NAME,
    concurrency: config.audit.maxConcurrent,
  });

  return worker;
}

// Standalone entry point (local dev / Docker worker)
if (require.main === module) {
  (async () => {
    fs.mkdirSync(config.audit.tmpDir, { recursive: true });
    await connectDatabase();
    const worker = await startWorkerInProcess();

    const shutdown = async () => {
      logger.info('Worker shutting down...');
      await worker.close();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })().catch((err) => {
    logger.error('Failed to start worker', { err });
    process.exit(1);
  });
}
