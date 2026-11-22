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
const counterTerms: Record<string, string> = {
  MOTOR_OILS: 'vidange huile moteur زيت زيوت موتور فيدانج zit zyout',
  DRIVE_FLUIDS: 'huile boite pont زيت زيوت فيتاس بواط',
  GREASES: 'grease greases graisse graisses gresse gresses شحم شحوم گريس كريص',
  COOLANT_SHELF: 'antigel antifreeze antijene antigene anti gel refroidissement ماء الرادياتور ليكيد روبيديسمون انتيجيل أنتيجيل تبريد',
  COUNTER_ACCESSORIES: 'accessoire accessoires accessoires auto accessories acccessewares إكسسوارات اكسسوار',
};

// A proposed starter range for a parts counter. Actual demand comes from each shop's sales.
export const counterEssentials = new Set([
  'ENGINE_OIL_FILTER','ENGINE_AIR_FILTER','ENGINE_FUEL_FILTER','ENGINE_CABIN_FILTER','ENGINE_SPARK_PLUG',
  'ENGINE_GLOW_PLUG','ENGINE_TIMING_BELT','ENGINE_ACCESSORY_BELT','BRAKE_PAD','BRAKE_DISC','BRAKE_SHOE',
  'SUSP_SHOCK','SUSP_BALL_JOINT','SUSP_LINK','SUSP_WHEEL_BEARING','DRIVE_CLUTCH_KIT','ELEC_BATTERY',
  'ELEC_FUSE','ELEC_RELAY','LIGHT_BULB','BODY_WIPER','WHEELS_VALVE','COOL_HOSE','ENGINE_THERMOSTAT',
  'ENGINE_WATER_PUMP','MOTOR_OILS_0W20','MOTOR_OILS_5W30','MOTOR_OILS_5W40','MOTOR_OILS_10W40',
  'MOTOR_OILS_15W40','MOTOR_OILS_20W50','DRIVE_FLUIDS_ATF','DRIVE_FLUIDS_75W80','DRIVE_FLUIDS_80W90',
  'FLUID_POWER_STEERING','GREASES_LITHIUM','GREASES_EP','GREASES_BEARING','GREASES_CV','GREASES_SILICONE',
  'COOLANT_SHELF_PREMIX','COOLANT_SHELF_CONCENTRATE','COOLANT_SHELF_WATER','SERVICE_FLUIDS_DOT4',
  'FLUID_WASHER','FLUIDS_UREA','SERVICE_FLUIDS_BRAKE_CLEAN','SERVICE_FLUIDS_CONTACT','FLUIDS_PENETRANT',
  'SERVICE_KITS_DRAIN','SERVICE_KITS_FILTER_WRENCH','SERVICE_KITS_GREASE_GUN','HARDWARE_CLAMP','HARDWARE_CLIP',
  'HARDWARE_SEALANT','COUNTER_ACCESSORIES_CABLE','COUNTER_ACCESSORIES_CHARGER','COUNTER_ACCESSORIES_AIR_VENT',
  'COUNTER_ACCESSORIES_PERFUME','COUNTER_ACCESSORIES_WATERPROOF_MAT','COUNTER_ACCESSORIES_JUMP',
  'COUNTER_ACCESSORIES_PUMP','COUNTER_ACCESSORIES_TRIANGLE','COUNTER_ACCESSORIES_VEST','COUNTER_ACCESSORIES_GLASS',
  'DETAILING_WASH','DETAILING_CLOTH','WHEELS_REPAIR',
]);
function normalizeTerm(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}|ـ/gu, '')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
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
  text: normalizeTerm([code, en, fr, ar, ...Object.values(group.names), aliases[code] ?? '', counterTerms[group.code] ?? ''].join(' ')),
})));

export function findMerchandiseTypes(query: string, group = '', essentialsOnly = false) {
  const words = normalizeTerm(query).split(/\s+/).filter(Boolean);
  return searchIndex.filter(row => (!group || row.type.group === group) && (!essentialsOnly || counterEssentials.has(row.type.code)) && words.every(word => row.text.includes(word)))
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
