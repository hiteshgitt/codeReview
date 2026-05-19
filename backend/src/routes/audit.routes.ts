import { Router } from 'express';
import {
  createAudit,
  getAudit,
  listAudits,
  deleteAudit,
  getAuditStats,
  downloadReport,
  createAuditValidation,
} from '../controllers/audit.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/stats', getAuditStats);
router.get('/', listAudits);
router.post('/', createAuditValidation, createAudit);
router.get('/:id', getAudit);
router.delete('/:id', deleteAudit);
router.get('/:id/report/pdf', downloadReport);

export default router;
