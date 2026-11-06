import { normalizeDigits } from '../../../packages/i18n/src/index';
export function mapOpeningGrid(grid: unknown[][]) {
  const headers = (grid[0] ?? []).map((v) => String(v ?? '').trim()),
    allowed = [
      'sku',
      'branch',
      'warehouse',
      'bin',
      'condition',
      'quantity_counted',
      'counted_by',
      'count_date',
      'approver',
      'source_document',
    ];
  if (
    !headers.length ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !allowed.includes(h)) ||
    allowed.filter((h) => !['bin', 'approver'].includes(h)).some((h) => !headers.includes(h)) ||
    grid.length < 2 ||
    grid.length > 501
  )
    throw new Error('IMPORT_COLUMNS_UNSUPPORTED');
  return grid.slice(1).map((values) => {
    if (values.length > headers.length) throw new Error('IMPORT_INVALID');
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      const value = values[i] ?? '';
      if (value instanceof Date) throw new Error('IMPORT_INVALID');
      row[header] = String(value);
    });
    const number = normalizeDigits(String(row.quantity_counted)).trim();
    if (!/^\d+$/.test(number)) throw new Error('INVALID_QUANTITY');
    row.quantity_counted = Number(number);
    if (!row.approver) delete row.approver;
    return row;
  });
}
