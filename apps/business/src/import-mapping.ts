import { parseMoney } from '../../../packages/i18n/src/index';
const supported = new Set([
  'technical_attributes_json',
  'sku',
  'brand',
  'manufacturer_part_no',
  'name_ar',
  'name_fr',
  'name_en',
  'description_ar',
  'description_fr',
  'description_en',
  'category',
  'category_path',
  'category_ar',
  'category_fr',
  'category_en',
  'unit',
  'pack_qty',
  'packSize',
  'oem',
  'oem_refs',
  'barcode',
  'ean_gtin',
  'priceMinor',
  'costMinor',
  'price_mad',
  'cost_mad',
  'reorderLevel',
  'image_source',
  'supplier_ref',
  'translation_review_status_ar',
  'translation_review_status_fr',
  'translation_review_status_en',
]);
export function mapProductGrid(grid: unknown[][]) {
  if (grid.length < 2 || grid.length > 100001) throw new Error('IMPORT_INVALID');
  const headers = grid[0]!.map((x) =>
    String(x)
      .replace(/^\uFEFF/, '')
      .trim(),
  );
  if (
    !headers.includes('sku') ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !supported.has(h))
  )
    throw new Error('IMPORT_COLUMNS_UNSUPPORTED');
  return grid.slice(1).map((values) => {
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    const text = (key: string) => String(row[key] ?? '');
    if (text('unit') && !['piece', 'PCS', 'pcs', 'pièce', 'قطعة'].includes(text('unit')))
      throw new Error('IMPORT_UNIT_UNSUPPORTED');
    function alias(a: string, b: string) {
      if (text(a) && text(b) && text(a) !== text(b)) throw new Error('IMPORT_MAPPING_CONFLICT');
      return text(a) || text(b);
    }
    function price(minor: string, mad: string) {
      const amount = text(mad) ? parseMoney(text(mad)) : null;
      if (text(minor) && amount !== null && Number(row[minor]) !== amount)
        throw new Error('IMPORT_MAPPING_CONFLICT');
      return amount ?? Number(row[minor] || 0);
    }
    return {
      sku: text('sku'),
      brand: text('brand'),
      manufacturerPartNo: text('manufacturer_part_no'),
      names: { ar: text('name_ar'), fr: text('name_fr'), en: text('name_en') },
      descriptions: { ar: text('description_ar'), fr: text('description_fr'), en: text('description_en') },
      category: alias('category', 'category_path'),
      categoryNames: { ar: text('category_ar'), fr: text('category_fr'), en: text('category_en') },
      oem: alias('oem', 'oem_refs'),
      barcode: alias('barcode', 'ean_gtin'),
      packSize: Number(alias('packSize', 'pack_qty') || 1),
      priceMinor: price('priceMinor', 'price_mad'),
      costMinor: price('costMinor', 'cost_mad'),
      reorderLevel: Number(row.reorderLevel || 5),
      status: 'DRAFT',
      companyMetadata: {
        ...(text('technical_attributes_json')?{technicalAttributes:JSON.parse(text('technical_attributes_json'))}:{}),
        supplierReference: text('supplier_ref'),
        imageSource: text('image_source'),
        suppliedReviewStatus: {
          ar: text('translation_review_status_ar'),
          fr: text('translation_review_status_fr'),
          en: text('translation_review_status_en'),
        },
      },
    };
  });
}
