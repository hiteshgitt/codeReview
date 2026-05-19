import { prisma } from '../config/database';
import { queueService } from './queue.service';
import { AppError } from '../middleware/error';
import { CreateAuditDto } from '../types';
import { logger } from '../utils/logger';

export class AuditService {
  async createAudit(userId: string, dto: CreateAuditDto) {
    const projectType = dto.projectType ?? 'website';
    const framework = projectType === 'landing_page' ? 'html' : (dto.framework ?? 'html');

    const audit = await prisma.audit.create({
      data: {
        userId,
        websiteUrl: dto.websiteUrl,
        repoUrl: dto.repoUrl ?? null,
        name: dto.name ?? new URL(dto.websiteUrl).hostname,
        projectType,
        framework,
        status: 'PENDING',
      },
    });

    try {
      const job = await queueService.enqueueAudit({
        auditId: audit.id,
        websiteUrl: dto.websiteUrl,
        repoUrl: dto.repoUrl,
        repoToken: dto.repoToken,
        projectType,
        framework,
      });

      await prisma.audit.update({
        where: { id: audit.id },
        data: { jobId: job.id?.toString() },
      });

      logger.info('Audit queued', { auditId: audit.id, jobId: job.id });
    } catch (error) {
      logger.error('Failed to queue audit job', { error, auditId: audit.id });
      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'FAILED', errorMessage: 'Failed to queue audit job' },
      });
    }

    return audit;
  }

  async getAuditById(auditId: string, userId: string) {
    const audit = await prisma.audit.findFirst({
      where: { id: auditId, userId },
    });

    if (!audit) throw new AppError('Audit not found', 404);
    return audit;
  }

  async listAudits(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [audits, total] = await Promise.all([
      prisma.audit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          repoUrl: true,
          status: true,
          overallScore: true,
          projectType: true,
          framework: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.audit.count({ where: { userId } }),
    ]);

    return {
      audits,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async deleteAudit(auditId: string, userId: string): Promise<void> {
    const audit = await prisma.audit.findFirst({ where: { id: auditId, userId } });
    if (!audit) throw new AppError('Audit not found', 404);

    await prisma.audit.delete({ where: { id: auditId } });
  }

  async getAuditStats(userId: string) {
    const [total, completed, failed, avgScore] = await Promise.all([
      prisma.audit.count({ where: { userId } }),
      prisma.audit.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.audit.count({ where: { userId, status: 'FAILED' } }),
      prisma.audit.aggregate({
        where: { userId, status: 'COMPLETED', overallScore: { not: null } },
        _avg: { overallScore: true },
      }),
    ]);

    const criticalIssues = await this.countCriticalIssues(userId);

    return {
      total,
      completed,
      failed,
      pending: total - completed - failed,
      avgScore: avgScore._avg.overallScore
        ? Math.round(avgScore._avg.overallScore * 10) / 10
        : null,
      criticalIssues,
    };
  }

  private async countCriticalIssues(userId: string): Promise<number> {
    const audits = await prisma.audit.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { issues: true },
    });

    return audits.reduce((count, audit) => {
      const issues = audit.issues as Array<{ severity: string }> | null;
      if (!Array.isArray(issues)) return count;
      return count + issues.filter((i) => i.severity === 'critical').length;
    }, 0);
  }
}

export const auditService = new AuditService();
