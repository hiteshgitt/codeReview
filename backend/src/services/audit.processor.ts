import { prisma } from '../config/database';
import { AuditJobData } from './queue.service';
import { analyzeLighthouse } from './analysis/lighthouse.service';
import { analyzeSEO } from './analysis/seo.service';
import { analyzeResponsiveness } from './analysis/responsiveness.service';
import { analyzeCodeQuality } from './analysis/code-quality.service';
import { analyzeUX } from './analysis/ux.service';
import { analyzeSecurityHeaders } from './analysis/security.service';
import { calculateOverallScore } from './analysis/scoring';
import { AuditScores } from '../types';
import { logger } from '../utils/logger';

let activeJobs = 0;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_AUDITS || '2', 10);

function buildNoRepoIssue(projectType: string, framework: string) {
  const labels: Record<string, string> = {
    html: 'HTML/CSS/JS', php: 'PHP', nextjs: 'Next.js', react: 'React',
    vue: 'Vue.js', laravel: 'Laravel', codeigniter: 'CodeIgniter', wordpress: 'WordPress',
  };
  const label = labels[framework] ?? framework;
  if (projectType === 'landing_page') {
    return [{ id: 'no-repo-lp', category: 'code-quality' as const, severity: 'suggestion' as const,
      title: 'No repository provided for code quality analysis',
      description: 'This landing page was analysed without a source repository.',
      recommendation: 'Provide a git repository URL to enable linting, formatting, and file-structure checks.',
      impact: 'Code quality metrics are unavailable without repository access.' }];
  }
  return [{ id: 'no-repo', category: 'code-quality' as const, severity: 'suggestion' as const,
    title: `No repository provided for ${label} project`,
    description: `Code quality analysis for ${label} requires a repository URL.`,
    recommendation: `Provide a git repository URL to enable ${label}-specific linting, dependency audits, and structure checks.`,
    impact: 'Code quality metrics are unavailable without repository access.' }];
}

export async function runAudit(data: AuditJobData): Promise<void> {
  const { auditId, websiteUrl, repoUrl, repoToken, projectType = 'website', framework = 'html' } = data;
  logger.info('Processing audit', { auditId, websiteUrl });

  await prisma.audit.update({ where: { id: auditId }, data: { status: 'RUNNING' } });

  try {
    const [lighthouseResults, seoResult, responsivenessResult, uxResult, securityResult] = await Promise.all([
      analyzeLighthouse(websiteUrl).catch((err) => { logger.error('Lighthouse error', { err, auditId }); return null; }),
      analyzeSEO(websiteUrl).catch((err) => { logger.error('SEO error', { err, auditId }); return null; }),
      analyzeResponsiveness(websiteUrl).catch((err) => { logger.error('Responsiveness error', { err, auditId }); return null; }),
      analyzeUX(websiteUrl).catch((err) => { logger.error('UX error', { err, auditId }); return null; }),
      analyzeSecurityHeaders(websiteUrl).catch((err) => { logger.error('Security error', { err, auditId }); return null; }),
    ]);

    let codeQualityResult = null;
    if (repoUrl) {
      codeQualityResult = await analyzeCodeQuality(repoUrl, framework, repoToken).catch((err) => {
        logger.error('Code quality error', { err, auditId }); return null;
      });
    }

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
    const allIssues = Object.values(scores).flatMap((cat) => cat.issues);

    await prisma.audit.update({
      where: { id: auditId },
      data: { status: 'COMPLETED', overallScore, scores: scores as object,
        issues: allIssues as object,
        lighthouseData: lighthouseResults?.lighthouseData ? (lighthouseResults.lighthouseData as object) : undefined,
        completedAt: new Date() },
    });

    logger.info('Audit completed', { auditId, overallScore });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Audit failed', { error, auditId });
    await prisma.audit.update({ where: { id: auditId }, data: { status: 'FAILED', errorMessage: message } });
  }
}

export function scheduleAudit(data: AuditJobData): void {
  if (activeJobs >= MAX_CONCURRENT) {
    logger.warn('Max concurrent audits reached, queuing via setImmediate', { auditId: data.auditId });
  }
  setImmediate(async () => {
    activeJobs++;
    try {
      await runAudit(data);
    } finally {
      activeJobs--;
    }
  });
}
