import { Router } from 'express';
import { upload, validateMagicBytes } from '../middleware/upload.middleware';
import { extractHandler } from '../controllers/extract.controller';

const router = Router();

router.post('/extract/:sessionId', upload.single('file'), validateMagicBytes, extractHandler);

export default router;
