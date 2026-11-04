/** Phase 2 contracts only. No live payment, shipping or customer endpoints in Phase 1. */
export type Money = Readonly<{ currency: 'MAD'; minor: number }>;
export type PublicAvailability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type PublicProduct = Readonly<{
  publicId: string;
  slug: string;
  brand: string;
  manufacturerReference: string;
  locale: 'ar' | 'fr' | 'en';
  name: string;
  description: string;
  price: Money;
  availability: PublicAvailability;
  approvedMediaUrls: readonly string[];
  fitment: 'VERIFIED' | 'NEEDS_DETAILS' | 'UNVERIFIED';
}>;
export interface PaymentProvider {
  createIntent(input: {
    orderId: string;
    amount: Money;
    idempotencyKey: string;
    returnUrl: string;
  }): Promise<{ providerId: string; hostedUrl: string }>;
  verifyWebhook(input: {
    rawBody: Uint8Array;
    signature: string;
  }): Promise<{ eventId: string; providerId: string; state: 'PAID' | 'FAILED' | 'REFUNDED'; amount: Money }>;
  reconcile(
    providerId: string,
  ): Promise<{ state: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'; amount: Money }>;
  refund(input: { providerId: string; amount: Money; idempotencyKey: string }): Promise<{ refundId: string }>;
}
export interface ShippingProvider {
  quote(input: { destinationCode: string; weightGrams: number }): Promise<{ quoteId: string; amount: Money }>;
  createShipment(input: {
    orderId: string;
    quoteId: string;
    idempotencyKey: string;
  }): Promise<{ shipmentId: string; labelUrl: string }>;
  findShipmentByRequest(idempotencyKey: string): Promise<{ shipmentId: string } | null>;
  track(
    shipmentId: string,
  ): Promise<
    { eventId: string; state: 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED'; occurredAt: string }[]
  >;
}
export type PublicationDecision = { permitted: true } | { permitted: false; reasons: string[] };
export function publicationGate(input: {
  status: string;
  licensedDisplay: boolean;
  licensedSyndication: boolean;
  mediaApproved: boolean;
  pricingApproved: boolean;
  translations: Record<'ar' | 'fr' | 'en', string>;
  safetyWarningsApproved: boolean;
}): PublicationDecision {
  const reasons: string[] = [];
  if (input.status !== 'PUBLIC_READY') reasons.push('NOT_PUBLIC_READY');
  if (!input.licensedDisplay || !input.licensedSyndication) reasons.push('RIGHTS_NOT_APPROVED');
  if (!input.mediaApproved) reasons.push('MEDIA_NOT_APPROVED');
  if (!input.pricingApproved) reasons.push('PRICING_NOT_APPROVED');
  if (Object.values(input.translations).some((status) => status !== 'APPROVED'))
    reasons.push('TRANSLATION_NOT_APPROVED');
  if (!input.safetyWarningsApproved) reasons.push('SAFETY_WARNINGS_NOT_APPROVED');
  return reasons.length ? { permitted: false, reasons } : { permitted: true };
}
