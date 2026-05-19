import { Router } from 'express';
import authRoutes from './auth.routes';
import auditRoutes from './audit.routes';

const router = Router();

router.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/audits', auditRoutes);

export default router;
