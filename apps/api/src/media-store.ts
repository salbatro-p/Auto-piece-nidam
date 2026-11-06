import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { DomainError } from './db.js';
const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let processing = 0;
function objectPath(key: string) {
  if (!/^[a-f0-9]{64}\/(source|display|thumbnail)\.webp$/.test(key)) throw new DomainError('NOT_FOUND', 404);
  const root = resolve(process.env.MEDIA_STORAGE_DIR ?? '.local/media'),
    target = resolve(root, key);
  if (!target.startsWith(root + sep)) throw new DomainError('NOT_FOUND', 404);
  return target;
}
async function put(key: string, bytes: Buffer) {
  const target = objectPath(key),
    temporary = target + '.' + randomUUID() + '.tmp';
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function readMediaObject(key: string) {
  try {
    return await readFile(objectPath(key));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('IMAGE_UNAVAILABLE', 404);
  }
}
export async function storeMedia(data: string, mime: string) {
  if (processing >= 2) throw new DomainError('BUSY_RETRY', 503);
  const input = Buffer.from(data, 'base64');
  if (input.length < 12 || input.length > 4_000_000) throw new DomainError('INVALID_IMAGE');
  processing++;
  try {
    const decoded = sharp(input, { limitInputPixels: 20_000_000, failOn: 'error', animated: false }),
      meta = await decoded.metadata();
    if (
      !meta.width ||
      !meta.height ||
      (meta.pages && meta.pages > 1) ||
      !['jpeg', 'png', 'webp'].includes(meta.format) ||
      'image/' + meta.format !== mime
    )
      throw new Error('Invalid image');
    // Only decoded pixel data crosses into our private media service; scripts, EXIF and location metadata are discarded.
    const source = await decoded.rotate().webp({ lossless: true }).toBuffer();
    if (source.length > 24_000_000) throw new Error('Decoded source too large');
    const id = checksum(source),
      display = await sharp(source)
        .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
      thumbnail = await sharp(source)
        .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    const objectKey = `${id}/source.webp`,
      displayKey = `${id}/display.webp`,
      thumbnailKey = `${id}/thumbnail.webp`;
    await put(objectKey, source);
    await put(displayKey, display);
    await put(thumbnailKey, thumbnail);
    return {
      objectKey,
      displayKey,
      thumbnailKey,
      checksum: id,
      mime: 'image/webp',
      fileSize: source.length,
      dimensions: {
        width: meta.autoOrient?.width ?? meta.width,
        height: meta.autoOrient?.height ?? meta.height,
      },
      thumbnailBytes: thumbnail.length,
      displayBytes: display.length,
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_IMAGE');
  } finally {
    processing--;
  }
}
