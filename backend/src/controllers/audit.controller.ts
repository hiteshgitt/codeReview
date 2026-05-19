import { Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { auditService } from '../services/audit.service';
import { generateAuditPDF } from '../services/pdf.service';
import { validate } from '../middleware/validate';
import { AuditScores } from '../types';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';

const VALID_PROJECT_TYPES = ['landing_page', 'website'];
const VALID_FRAMEWORKS = ['html', 'php', 'nextjs', 'react', 'vue', 'laravel', 'codeigniter', 'wordpress'];

export const createAuditValidation = [
  body('websiteUrl').isURL({ protocols: ['http', 'https'] }).withMessage('Valid website URL required'),
  body('repoUrl').optional({ nullable: true }).isURL().withMessage('Valid repository URL required'),
  body('repoToken').optional({ nullable: true }).isString().trim().withMessage('Repository token must be a string'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name must be under 100 characters'),
  body('projectType').optional().isIn(VALID_PROJECT_TYPES).withMessage('Invalid project type'),
  body('framework').optional().isIn(VALID_FRAMEWORKS).withMessage('Invalid framework'),
  validate,
];

export async function createAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const audit = await auditService.createAudit(req.user!.userId, req.body);
    res.status(202).json({ success: true, data: { audit } });
  } catch (error) {
    next(error);
  }
}

export async function getAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const audit = await auditService.getAuditById(req.params.id, req.user!.userId);
    res.json({ success: true, data: { audit } });
  } catch (error) {
    next(error);
  }
}

export async function listAudits(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '10', 10);
    const result = await auditService.listAudits(req.user!.userId, page, Math.min(limit, 50));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await auditService.deleteAudit(req.params.id, req.user!.userId);
    res.json({ success: true, message: 'Audit deleted' });
  } catch (error) {
    next(error);
  }
}

export async function getAuditStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await auditService.getAuditStats(req.user!.userId);
    res.json({ success: true, data: { stats } });
  } catch (error) {
    next(error);
  }
}

export async function downloadReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const audit = await prisma.audit.findFirst({
      where: { id: req.params.id, userId: req.user!.userId, status: 'COMPLETED' },
    });

    if (!audit) throw new AppError('Completed audit not found', 404);

    const pdfBuffer = await generateAuditPDF({
      id: audit.id,
      websiteUrl: audit.websiteUrl,
      repoUrl: audit.repoUrl,
      name: audit.name,
      overallScore: audit.overallScore ?? 0,
      scores: audit.scores as unknown as AuditScores,
      createdAt: audit.createdAt,
      completedAt: audit.completedAt,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${audit.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}
