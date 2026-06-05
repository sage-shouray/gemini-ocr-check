import sharp from 'sharp';

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: string;
  steps: string[];
  warnings: string[];
}

export async function preprocessImage(
  inputBuffer: Buffer,
  mimeType: string
): Promise<PreprocessResult> {
  const steps: string[] = [];
  const warnings: string[] = [];

  try {
    let workingBuffer = inputBuffer;

    // Step 1: HEIC/HEIF → JPEG
    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const heicConvert = require('heic-convert') as (opts: {
        buffer: Buffer;
        format: 'JPEG';
        quality: number;
      }) => Promise<ArrayBuffer>;

      const converted = await heicConvert({ buffer: workingBuffer, format: 'JPEG', quality: 0.95 });
      workingBuffer = Buffer.from(converted);
      steps.push('Converted HEIC/HEIF to JPEG');
    }

    // Step 2: Auto-rotate based on EXIF orientation, then capture the rotated buffer
    // so subsequent metadata reads reflect the true post-rotation dimensions.
    workingBuffer = await sharp(workingBuffer).rotate().toBuffer();
    steps.push('Applied EXIF auto-rotation');

    const { width = 0 } = await sharp(workingBuffer).metadata();

    if (width < 800) {
      warnings.push('Low resolution input — extraction may be less accurate');
    }

    let pipeline = sharp(workingBuffer);

    // Step 3: Upscale if too small
    if (width > 0 && width < 1200) {
      pipeline = pipeline.resize({ width: 1500 });
      steps.push('Upscaled to 1500px width (input was under 1200px)');
    }

    // Step 4: Downscale if too large
    if (width > 4000) {
      pipeline = pipeline.resize({ width: 3000 });
      steps.push('Downscaled to 3000px width (input exceeded 4000px)');
    }

    // Step 5: Contrast normalization
    pipeline = pipeline.normalize();
    steps.push('Applied contrast normalization');

    // Step 6: Sharpening
    pipeline = pipeline.sharpen({ sigma: 1.5 });
    steps.push('Applied sharpening (sigma: 1.5)');

    // Step 7: PNG output
    const outputBuffer = await pipeline.png().toBuffer();
    steps.push('Converted output to PNG');

    return { buffer: outputBuffer, mimeType: 'image/png', steps, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Image preprocessing failed: ${message}`);
  }
}
