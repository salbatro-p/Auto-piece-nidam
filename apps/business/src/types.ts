import type { Locale } from '../../../packages/i18n/src/index';
export interface User {
  companyName?: string;
  demo?: boolean;
  id: string;
  name: string;
  email: string;
  role: string;
  locale: Locale;
  permissions: string[];
}
export interface Warehouse {
  id: string;
  name: string;
  code: string;
}
export interface Stock {
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  quarantine: number;
  damaged: number;
  incoming?: number;
}
export interface Product {
  id: string;
  sku: string;
  names: Partial<Record<Locale, string>>;
  descriptions?: Partial<Record<Locale, string>>;
  brand: string;
  oem?: string;
  barcode?: string;
  category: string;
  categoryNames?: Partial<Record<Locale, string>>;
  manufacturerPartNo?: string;
  companyMetadata?: {
    technicalAttributes?:TechnicalAttribute[];
    supplierReference?: string;
    imageSource?: string;
    suppliedReviewStatus?: Partial<Record<Locale, string>>;
  };
  packSize: number;
  priceMinor: number;
  costMinor?: number;
  reorderLevel: number;
  status: string;
  translationStatus?: Partial<Record<Locale, string>>;
  stock: Stock[];
  fitments?: { status: string; vehicleId?: string; sourceId?: string; sourceName?: string; make?: string;
    model?: string; generation?: string; yearFrom?: number; yearTo?: number; engine?: string; market?: string;
    equipment?: string; qualifiers?: string }[];
  mediaId?: string;
}
export interface TechnicalAttribute {code:string;labels:Partial<Record<Locale,string>>;value:string;unit:string;}
export interface SaleLine {
  productId: string;
  quantity: number;
  sku?: string;
  names?: Partial<Record<Locale, string>>;
  priceMinor?: number;
  unitPriceMinor?: number;
}
export interface Sale {
  kind?: string;
  expiresAt?: string;
  reference?: string;
  subtotalMinor?: number;
  taxMinor?: number;
  taxRateBps?: number;
  taxInclusive?: boolean;
  taxConfigured?: boolean;
  id: string;
  totalMinor: number;
  lines: SaleLine[];
  status: string;
  createdAt?: string;
  created_at?: string;
  warehouseId?: string;
}
export interface Supplier {
  id: string;
  name: string;
  contact: string;
  leadDays: number;
  notes?: string;
}
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  generation: string;
  market: string;
  yearFrom: number;
  yearTo: number;
  engine: string;
  fuel: string;
  transmission: string;
  body: string;
  equipment?: string;
}
export interface Source {
  id: string;
  name: string;
  origin: string;
  license: string;
  canStore: boolean;
  canDisplay: boolean;
  canSyndicate: boolean;
}
export type RecordRow = Record<string, unknown>;
