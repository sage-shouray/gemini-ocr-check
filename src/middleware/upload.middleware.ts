import multer, { FileFilterCallback } from 'multer';
import { Request, RequestHandler, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Read the first 12 bytes of a file — enough for every signature we check.
async function readHeader(filePath: string): Promise<Buffer> {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    const { bytesRead } = await fh.read(buf, 0, 12, 0);
    return buf.slice(0, bytesRead);
  } finally {
    await fh.close();
  }
}

// Returns the MIME type inferred from magic bytes, or null if unrecognised.
function detectMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';

  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';

  // PDF: %PDF = 25 50 44 46
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';

  // WebP: RIFF....WEBP (needs 12 bytes)
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';

  // TIFF little-endian (II*\0) or big-endian (MM\0*)
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) ||
      (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A)) return 'image/tiff';

  // HEIC / HEIF: ISO base media — ftyp box at offset 4 (needs 12 bytes)
  if (buf.length >= 12 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }

  return null;
}

export const validateMagicBytes: RequestHandler = async (req, res: Response, next: NextFunction) => {
  if (!req.file) return next();

  try {
    const header  = await readHeader(req.file.path);
    const detected = detectMime(header);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
      fs.unlinkSync(req.file.path);
      res.status(415).json({
        success: false,
        error: {
          message: detected
            ? `File content type '${detected}' is not allowed`
            : 'Could not determine file type from content',
        },
      });
      return;
    }

    req.file.mimetype = detected;
    next();
  } catch (err) {
    next(err);
  }
};
