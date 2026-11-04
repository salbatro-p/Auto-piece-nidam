import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicationGate } from '../packages/contracts/src/commerce.js';
test('public projection refuses internal draft even when rights are approved', () => {
  const result = publicationGate({
    status: 'DRAFT',
    licensedDisplay: true,
    licensedSyndication: true,
    mediaApproved: true,
    pricingApproved: true,
    translations: { ar: 'APPROVED', fr: 'APPROVED', en: 'APPROVED' },
    safetyWarningsApproved: true,
  });
  assert.equal(result.permitted, false);
});
test('missing Arabic review blocks publication across all locale routes', () => {
  const result = publicationGate({
    status: 'PUBLIC_READY',
    licensedDisplay: true,
    licensedSyndication: true,
    mediaApproved: true,
    pricingApproved: true,
    translations: { ar: 'REVIEW_REQUIRED', fr: 'APPROVED', en: 'APPROVED' },
    safetyWarningsApproved: true,
  });
  assert.equal(result.permitted, false);
  if (!result.permitted) assert.ok(result.reasons.includes('TRANSLATION_NOT_APPROVED'));
});
