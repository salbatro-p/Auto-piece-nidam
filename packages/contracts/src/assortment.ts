import { assortmentGroups, type TypeNames } from './assortment-data.js';

export { assortmentGroups };
export type MerchandiseType = { code: string; group: string; names: TypeNames };

// Common alternate counter terms used alongside catalogue names.
const aliases: Record<string, string> = {
  BRAKE_PAD: 'plaquette plaquettes لويحات بلاكيت بلاكيط brake pad',
  ENGINE_SPARK_PLUG: 'bougie bougies بوجي بواجى بواجي',
  SUSP_SHOCK: 'amortisseur amortisseurs ممتصات مساعد امورتيسور',
  ENGINE_OIL_FILTER: 'filtre huile vidange فيلتر زيت فلتر زيت',
  ENGINE_TIMING_BELT: 'courroie distribution سير كاتينة',
  ENGINE_TIMING_CHAIN: 'chaine distribution كيت شين سلسلة التوزيع',
  DRIVE_CLUTCH_KIT: 'embrayage دبرياج لومبرياج كلتش',
  WHEEL_TIRE: 'tyre tire pneus عجل بنو روايض كاوتش',
  FUEL_AIR_FUEL_PUMP: 'pompe essence بومبة ليصانص طرمبة بنزين',
  DRIVETRAIN_TRANSMISSION: 'boite vitesse الفيتيس بواط فيتاس جيربوكس',
  TOOLS_DIAG: 'valise diagnostic سكانير دياگنوستيك دياكنوستيك',
  HARDWARE_BOLT: 'boulons écrous vis بولونات صواميل براغي',
  DETAILING_ODOR: 'parfum voiture عطر معطر السيارة',
  FLUID_ENGINE_OIL: 'huile vidange زيت موتور زيت محرك',
  ELEC_BATTERY: 'batterie بطارية باطري',
};
function normalizeTerm(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}|ـ/gu, '')
    .replace(/ى/g, 'ي').replace(/œ/g, 'oe').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export const merchandiseTypes = assortmentGroups.flatMap(group =>
  group.types.map(([code, en, fr, ar]) => ({ code, group: group.code, names: { en, fr, ar } })),
);
const byCode = new Map(merchandiseTypes.map(type => [type.code, type]));
export function merchandiseTypeByCode(code: string) {
  return byCode.get(code);
}
const searchIndex = assortmentGroups.flatMap(group => group.types.map(([code, en, fr, ar]) => ({
  type: byCode.get(code)!,
  text: normalizeTerm([code, en, fr, ar, ...Object.values(group.names), aliases[code] ?? ''].join(' ')),
})));

export function findMerchandiseTypes(query: string, group = '') {
  const words = normalizeTerm(query).split(/\s+/).filter(Boolean);
  return searchIndex.filter(row => (!group || row.type.group === group) && words.every(word => row.text.includes(word)))
    .map(row => row.type);
}

export function merchandiseTypesCsv(types: MerchandiseType[]) {
  const rows = [
    ['group_code', 'category', 'category_ar', 'category_fr', 'category_en'],
    ...types.map(type => [type.group, type.code, type.names.ar, type.names.fr, type.names.en]),
  ];
  return '\uFEFF' + rows.map(row => row.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(',')).join('\r\n') + '\r\n';
}

export function supplyCategoryNames<T extends { category: string; categoryNames: TypeNames }>(product: T): T {
  const type = byCode.get(product.category);
  if (!type) return product;
  return { ...product, categoryNames: {
    ar: product.categoryNames.ar || type.names.ar,
    fr: product.categoryNames.fr || type.names.fr,
    en: product.categoryNames.en || type.names.en,
  } };
}
