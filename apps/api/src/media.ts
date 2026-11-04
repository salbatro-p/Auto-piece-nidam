import sharp from 'sharp';
import { DomainError } from './db.js';
export async function sanitizeImage(data: string, mime: string) {
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 12 || bytes.length > 4_000_000) throw new DomainError('INVALID_IMAGE');
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: 'error', animated: false });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || (meta.pages && meta.pages > 1) || 'image/' + meta.format !== mime)
      throw new Error('Invalid format');
    // Decode and re-encode instead of trusting a MIME header; strip metadata by default.
    const sanitized = await image
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .toFormat(meta.format as 'png' | 'jpeg' | 'webp')
      .toBuffer();
    return sanitized;
  } catch {
    throw new DomainError('INVALID_IMAGE');
  }
}
