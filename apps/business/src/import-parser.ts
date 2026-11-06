import { unzipSync, strFromU8 } from 'fflate';
import { readSheet } from 'read-excel-file/universal';
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += c;
    if (rows.length > 100001 || row.length > 40 || value.length > 4000) throw new Error('IMPORT_INVALID');
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  if (quoted) throw new Error('IMPORT_INVALID');
  return rows;
}
export async function readImportGrid(buffer: ArrayBuffer, name: string): Promise<unknown[][]> {
  if (buffer.byteLength > 50_000_000) throw new Error('PAYLOAD_TOO_LARGE');
  if (name.toLowerCase().endsWith('.csv'))
    return csvRows(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  if (!name.toLowerCase().endsWith('.xlsx')) throw new Error('IMPORT_INVALID');
  let expanded = 0,
    entries = 0;
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      expanded += file.originalSize;
      entries++;
      if (expanded > 128_000_000 || file.originalSize > 96_000_000 || entries > 200)
        throw new Error('PAYLOAD_TOO_LARGE');
      if (/\.bin$|externalLinks\//i.test(file.name)) throw new Error('IMPORT_INVALID');
      return file.name.endsWith('.xml');
    },
  });
  for (const bytes of Object.values(files)) {
    const text = strFromU8(bytes);
    if (/<(?:[\w]+:)?f(?:\s|>)/.test(text)) throw new Error('FORMULA_REJECTED');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('IMPORT_INVALID');
  }
  const grid = await readSheet(buffer);
  if (grid.length > 100001 || grid.some((row) => row.length > 40)) throw new Error('IMPORT_INVALID');
  const headers = grid[0]?.map((value) => String(value).trim()) ?? [];
  for (let i = 1; i < grid.length; i++)
    for (const name of [
      'sku',
      'oem',
      'barcode',
      'manufacturer_part_no',
      'manufacturerPartNo',
      'oem_refs',
      'ean_gtin',
      'supplier_ref',
    ]) {
      const index = headers.indexOf(name);
      const value = grid[i]?.[index];
      if (index >= 0 && value !== null && value !== undefined && typeof value !== 'string')
        throw new Error('IDENTIFIER_TEXT_REQUIRED');
    }
  return grid;
}
