import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { csvRows, readImportGrid } from '../apps/business/src/import-parser.js';
import { mapProductGrid } from '../apps/business/src/import-mapping.js';
import { mapOpeningGrid } from '../apps/business/src/opening-mapping.js';
function workbook(cell: string, header = 'sku') {
  const files: Record<string, string> = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Parts" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${header}</t></is></c></row><row r="2">${cell}</row></sheetData></worksheet>`,
  };
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}
test('Opening template preserves counter evidence and parses Arabic integer pieces without inventing approval', () => {
  const header = [
      'sku',
      'branch',
      'warehouse',
      'condition',
      'quantity_counted',
      'counted_by',
      'count_date',
      'source_document',
    ],
    row = ['000-X', 'CASA', 'WH', 'SELLABLE', '١٠', 'staff-id', '2026-10-29', 'COUNT-001'];
  const mapped = mapOpeningGrid([header, row])[0]!;
  assert.equal(mapped.quantity_counted, 10);
  assert.equal(mapped.sku, '000-X');
  assert.ok(!('approver' in mapped));
  assert.throws(
    () => mapOpeningGrid([header, [...row.slice(0, 4), '1.5', ...row.slice(5)]]),
    /INVALID_QUANTITY/,
  );
  assert.throws(() => mapOpeningGrid([['sku'], ['X']]), /IMPORT_COLUMNS_UNSUPPORTED/);
});
test('Import parser preserves mixed-script exact text and rejects formulas, numeric identifiers and archive expansion abuse', async () => {
  const valid = workbook('<c r="A2" t="inlineStr"><is><t>00012-OEM/ع</t></is></c>');
  assert.equal((await readImportGrid(valid, 'parts.xlsx'))[1]![0], '00012-OEM/ع');
  await assert.rejects(
    readImportGrid(workbook('<c r="A2"><f>1+1</f><v>2</v></c>'), 'parts.xlsx'),
    /FORMULA_REJECTED/,
  );
  await assert.rejects(
    readImportGrid(workbook('<c r="A2"><v>123</v></c>'), 'parts.xlsx'),
    /IDENTIFIER_TEXT_REQUIRED/,
  );
  for (const header of ['manufacturer_part_no', 'ean_gtin', 'supplier_ref', 'oem_refs'])
    await assert.rejects(
      readImportGrid(workbook('<c r="A2"><v>123</v></c>', header), 'parts.xlsx'),
      /IDENTIFIER_TEXT_REQUIRED/,
    );
  const bomb = workbook('<c r="A2" t="inlineStr"><is><t>SAFE</t></is></c>'),
    view = new DataView(bomb);
  for (let i = 0; i < view.byteLength - 28; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, 129_000_000, true);
      break;
    }
  }
  await assert.rejects(readImportGrid(bomb, 'parts.xlsx'), /PAYLOAD_TOO_LARGE/);
  assert.deepEqual(csvRows('sku,name_en\r\n"00-A","Part, with \"\"quotes\"\""'), [
    ['sku', 'name_en'],
    ['00-A', 'Part, with "quotes"'],
  ]);
  assert.throws(() => csvRows('sku\n"unclosed'), /IMPORT_INVALID/);
});
test('Blueprint product template maps exact MAD prices, category, packaging and identifiers without silently trusting review claims', () => {
  const mapped = mapProductGrid([
    [
      'sku',
      'brand',
      'manufacturer_part_no',
      'name_fr',
      'category_path',
      'unit',
      'pack_qty',
      'oem_refs',
      'ean_gtin',
      'price_mad',
      'cost_mad',
      'translation_review_status_ar',
    ],
    [
      '001-X',
      'SYNTHETIC',
      '00-MFR/ع',
      'Pièce exemple',
      'Engine > Filtration',
      'piece',
      '10',
      'OEM-01',
      '0012345678905',
      '١٢٥٫٥٠',
      '80,25',
      'APPROVED',
    ],
  ])[0]!;
  assert.equal(mapped.priceMinor, 12550);
  assert.equal(mapped.costMinor, 8025);
  assert.equal(mapped.packSize, 10);
  assert.equal(mapped.manufacturerPartNo, '00-MFR/ع');
  assert.equal(mapped.barcode, '0012345678905');
  assert.equal(mapped.status, 'DRAFT');
  assert.equal(mapped.companyMetadata.suppliedReviewStatus.ar, 'APPROVED');
  assert.ok(!('translationStatus' in mapped));
  assert.throws(
    () =>
      mapProductGrid([
        ['sku', 'unrecognized'],
        ['X', 'Y'],
      ]),
    /IMPORT_COLUMNS_UNSUPPORTED/,
  );
  assert.throws(
    () =>
      mapProductGrid([
        ['sku', 'price_mad', 'priceMinor'],
        ['X', '1.00', '999'],
      ]),
    /IMPORT_MAPPING_CONFLICT/,
  );
  assert.throws(
    () =>
      mapProductGrid([
        ['sku', 'unit'],
        ['X', 'carton'],
      ]),
    /IMPORT_UNIT_UNSUPPORTED/,
  );
});
