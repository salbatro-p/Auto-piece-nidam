import { unzipSync } from 'fflate';
import { readImportGrid } from './import-parser';
export type ImageManifestRow = {
  filename: string;
  sku: string;
  manufacturerBrand: string;
  manufacturerPartNumber: string;
  licenseId: string;
  kind: string;
  viewAngle: string;
  vehicleVariantId?: string;
  sourceUrl: string;
  applicability: Record<string, string>;
  provider: string;
  illustrationId: string;
  clientError?: string;
};
const fields = [
  'filename',
  'sku',
  'manufacturer_brand',
  'manufacturer_part_no',
  'license_id',
  'kind',
  'view_angle',
  'side',
  'axle',
  'vehicle_variant_id',
  'engine',
  'equipment',
  'source_url',
  'provider',
  'illustration_id',
];
const safePath = (name: string) =>
  !!name &&
  !name.startsWith('/') &&
  !name.includes('\\') &&
  !name.includes(':') &&
  !name.split('/').some((s) => s === '..' || s === '.');
const digest = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
/** Keep one compressed archive plus a single decoded file. Never expand the whole photo archive. */
export class ImageArchive {
  private archive: Uint8Array;
  private entries = new Map<string, number>();
  constructor(buffer: ArrayBuffer) {
    if (buffer.byteLength > 64_000_000) throw new Error('PAYLOAD_TOO_LARGE');
    this.archive = new Uint8Array(buffer);
    let expanded = 0;
    unzipSync(this.archive, {
      filter: (file) => {
        if (!safePath(file.name) || this.entries.has(file.name)) throw new Error('IMPORT_INVALID');
        this.entries.set(file.name, file.originalSize);
        expanded += file.originalSize;
        if (this.entries.size > 10010 || expanded > 256_000_000 || file.originalSize > 8_000_000)
          throw new Error('PAYLOAD_TOO_LARGE');
        return false;
      },
    });
  }
  extract(name: string) {
    if (!safePath(name) || !this.entries.has(name)) throw new Error('IMAGE_UNAVAILABLE');
    return unzipSync(this.archive, { filter: (f) => f.name === name })[name];
  }
  async manifest(defaultLicense: string, external?: { name: string; buffer: ArrayBuffer }) {
    const manifests = [...this.entries.keys()].filter((name) => /\.(csv|xlsx)$/i.test(name));
    if (!external && manifests.length !== 1) throw new Error('IMPORT_INVALID');
    const name = external?.name ?? manifests[0],
      bytes = external ? new Uint8Array(external.buffer) : this.extract(name);
    if (bytes.byteLength > 8_000_000) throw new Error('PAYLOAD_TOO_LARGE');
    const grid = await readImportGrid(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        name,
      ),
      headers =
        grid[0]?.map((v) =>
          String(v ?? '')
            .replace(/^\uFEFF/, '')
            .trim(),
        ) ?? [];
    if (
      new Set(headers).size !== headers.length ||
      headers.some((h) => !fields.includes(h)) ||
      !['filename', 'sku', 'manufacturer_brand', 'manufacturer_part_no'].every((h) => headers.includes(h)) ||
      grid.length < 2 ||
      grid.length > 10001
    )
      throw new Error('IMPORT_INVALID');
    const rows: ImageManifestRow[] = grid.slice(1).map((cells) => {
      const record = Object.fromEntries(headers.map((key, i) => [key, cells[i] ?? '']));
      let clientError: string | undefined;
      if (Object.values(record).some((v) => typeof v !== 'string' || /^\s*[=+@]/.test(v)))
        clientError = 'VALIDATION_ERROR';
      const get = (key: string) => String(record[key] ?? '');
      if (!safePath(get('filename')) || !this.entries.has(get('filename'))) clientError = 'IMAGE_UNAVAILABLE';
      const kind = get('kind') || 'EXACT_PRODUCT_PHOTO';
      if (
        ![
          'EXACT_PRODUCT_PHOTO',
          'COMPANY_ORIGINAL_PHOTO',
          'GENERIC_CATEGORY_ILLUSTRATION',
          'VEHICLE_PHOTO',
          'EXPLODED_DIAGRAM',
        ].includes(kind)
      )
        clientError = 'VALIDATION_ERROR';
      if (
        !['VEHICLE_PHOTO', 'EXPLODED_DIAGRAM'].includes(kind) &&
        (!get('sku') || !get('manufacturer_brand') || !get('manufacturer_part_no'))
      )
        clientError = 'MEDIA_REFERENCE_MISMATCH';
      return {
        filename: get('filename'),
        sku: get('sku'),
        manufacturerBrand: get('manufacturer_brand'),
        manufacturerPartNumber: get('manufacturer_part_no'),
        licenseId: get('license_id') || defaultLicense,
        kind,
        viewAngle: get('view_angle'),
        vehicleVariantId: get('vehicle_variant_id') || undefined,
        sourceUrl: get('source_url'),
        applicability: Object.fromEntries(
          ['side', 'axle', 'engine', 'equipment'].filter((k) => get(k)).map((k) => [k, get(k)]),
        ),
        provider: get('provider'),
        illustrationId: get('illustration_id'),
        clientError,
      };
    });
    return {
      rows,
      fileHash: await digest(
        new TextEncoder().encode(`${await digest(this.archive)}:${await digest(bytes)}:${defaultLicense}`),
      ),
    };
  }
  file(row: ImageManifestRow) {
    try {
      if (row.clientError) return { data: '', mime: 'image/png', clientError: row.clientError };
      const bytes = this.extract(row.filename);
      if (bytes.length > 4_000_000) throw new Error('INVALID_IMAGE');
      const mime = /\.jpe?g$/i.test(row.filename)
        ? 'image/jpeg'
        : /\.png$/i.test(row.filename)
          ? 'image/png'
          : /\.webp$/i.test(row.filename)
            ? 'image/webp'
            : '';
      if (!mime) throw new Error('INVALID_IMAGE');
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return { data: btoa(binary), mime };
    } catch (err) {
      return {
        data: '',
        mime: 'image/png',
        clientError:
          err instanceof Error && err.message === 'IMAGE_UNAVAILABLE' ? 'IMAGE_UNAVAILABLE' : 'INVALID_IMAGE',
      };
    }
  }
}
