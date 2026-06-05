import { Router } from 'express';
import {
  createSessionHandler,
  getSessionHandler,
  listSessionsHandler,
  deleteSessionHandler,
} from '../controllers/session.controller';

const router = Router();

router.post('/session', createSessionHandler);
router.get('/session', listSessionsHandler);
router.get('/session/:id', getSessionHandler);
router.delete('/session/:id', deleteSessionHandler);

export default router;
