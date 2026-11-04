import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  locales,
  login,
  switchLanguage,
  navigate,
  capture,
  checkHeader,
  currentSession,
  jsonEvidence,
} from './helpers';

test.describe.configure({ mode: 'serial' });
const timings: { screen: string; locale: string; durationMs: number }[] = [];
async function product(page: Page, sku: string) {
  const response = await page.request.get(`/api/products?q=${encodeURIComponent(sku)}`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  const row = body.items.find((item: { sku: string }) => item.sku === sku);
  expect(row).toBeTruthy();
  return row;
}
async function axe(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await jsonEvidence(`axe-${name}`, {
    url: page.url(),
    viewport: page.viewportSize(),
    locale: await page.locator('html').getAttribute('lang'),
    violations: result.violations,
    passes: result.passes.length,
    incomplete: result.incomplete.map((v) => ({ id: v.id, impact: v.impact })),
  });
  expect(
    result.violations,
    `Accessibility violations: ${result.violations.map((v) => v.id).join(', ')}`,
  ).toEqual([]);
}

for (const viewport of [
  { width: 390, height: 844, name: 'phone' },
  { width: 1280, height: 800, name: 'tablet' },
]) {
  test(`I18N-05 login header, RTL, keyboard and accessibility — ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByTestId('login-email')).toBeVisible();
    for (const locale of locales) {
      timings.push({
        screen: `login-${viewport.name}`,
        locale,
        durationMs: await switchLanguage(page, locale),
      });
      await checkHeader(page);
      await capture(page, `${viewport.name}-login-${locale}`, testInfo);
      await axe(page, `${viewport.name}-login-${locale}`);
    }
    await page.getByTestId('language-ar').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('login-email').fill('qa@invalid.local');
    await page.getByTestId('login-submit').click();
    const arabicError = await page.getByRole('alert').innerText();
    await switchLanguage(page, 'fr');
    await expect(page.getByTestId('login-email')).toHaveValue('qa@invalid.local');
    expect(await page.getByRole('alert').innerText()).not.toEqual(arabicError);
  });
}

test('I18N-01 tablet mid-sale language changes and lost response produce exactly one sale', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, 'sales');
  const sessionBefore = await currentSession(page);
  const sku = 'AP-SPK-004',
    before = await product(page, sku);
  await page.getByTestId('product-search').fill(sku);
  await page.getByTestId(`add-to-cart-${sku}`).click();
  await page.getByTestId(`cart-quantity-${sku}`).fill('2');
  const expectedMinor = before.priceMinor * 2;
  for (const locale of locales) {
    timings.push({ screen: 'pos-cart-tablet', locale, durationMs: await switchLanguage(page, locale) });
    await expect(page.getByTestId(`cart-quantity-${sku}`)).toHaveValue('2');
    await expect(page.getByTestId('cart-total')).toHaveAttribute('data-minor', String(expectedMinor));
    await expect(page.getByTestId('product-search')).toHaveValue(sku);
    await checkHeader(page);
    await capture(page, `tablet-pos-draft-${locale}`, testInfo);
  }
  expect((await currentSession(page)).user.id).toBe(sessionBefore.user.id);
  let committed: Record<string, any> | undefined;
  let writes = 0;
  await page.route('**/api/sales', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    writes++;
    const response = await route.fetch();
    if (writes === 1) {
      expect(response.ok()).toBe(true);
      committed = await response.json();
      await route.abort('connectionreset');
    } else await route.fulfill({ response });
  });
  await page.getByTestId('sale-submit').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('receipt')).toHaveCount(0);
  await switchLanguage(page, 'ar');
  await page.getByTestId('sale-submit').click();
  await expect(page.getByTestId('receipt')).toBeVisible();
  expect(writes).toBe(1);
  expect(committed).toBeTruthy();
  await expect(page.getByTestId('receipt')).toHaveAttribute('data-sale-id', committed!.id);
  const after = await product(page, sku),
    warehouse = sessionBefore.user.warehouseIds[0];
  const priorStock = before.stock.find((s: any) => s.warehouseId === warehouse),
    nextStock = after.stock.find((s: any) => s.warehouseId === warehouse);
  expect(nextStock.onHand).toBe(priorStock.onHand - 2);
  expect(nextStock.reserved).toBe(priorStock.reserved);
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(page.getByTestId('receipt-total')).toHaveAttribute('data-minor', String(expectedMinor));
    await expect(page.getByTestId('receipt')).toContainText(sku);
    await capture(page, `tablet-receipt-${locale}`, testInfo);
  }
  await jsonEvidence('sale-response-loss', {
    saleId: committed!.id,
    sku,
    attempts: writes,
    expectedMinor,
    stockBefore: priorStock,
    stockAfter: nextStock,
    userIdUnchanged: true,
    requestResult: 'one sale after lost response and recovery lookup',
  });
});

test('I18N-03 shared tablet isolates employee preferences and independent sessions', async ({
  page,
  browser,
}) => {
  const preparation = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    locale: 'fr-FR',
  });
  try {
    const setup = await preparation.newPage();
    await login(setup, 'warehouse');
    await switchLanguage(setup, 'ar');
    await expect.poll(async () => (await currentSession(setup)).user.locale).toBe('ar');
    await setup.getByTestId('logout').click();
  } finally {
    await preparation.close();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, 'sales');
  await switchLanguage(page, 'en');
  await expect.poll(async () => (await currentSession(page)).user.locale).toBe('en');
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login-submit')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await login(page, 'warehouse');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByTestId('nav-team')).toHaveCount(0);
  await page.getByTestId('logout').click();
  await login(page, 'sales');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const other = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    locale: 'fr-FR',
  });
  try {
    const otherPage = await other.newPage();
    await login(otherPage, 'warehouse');
    await switchLanguage(otherPage, 'fr');
    await switchLanguage(page, 'ar');
    await expect(otherPage.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  } finally {
    await other.close();
  }
});

test('SEC-01 anonymous localized routes cannot expose Business data', async ({ request }) => {
  for (const path of [
    '/api/products',
    '/api/suppliers',
    '/api/audit',
    '/api/staff',
    '/api/openapi.json',
    '/api/shop/products',
    '/api/ar/products',
    '/api/fr/products',
    '/api/en/products',
  ]) {
    const response = await request.get(path);
    expect([401, 403, 404]).toContain(response.status());
    const text = await response.text();
    expect(text).not.toContain('costMinor');
    expect(text).not.toContain('AP-FLT-001');
  }
});

test('I18N-02 owner phone product image and carton receipt preserve drafts; screen matrix', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'owner');
  await navigate(page, 'catalog');
  await page.getByTestId('product-create').click();
  const sku = `QA-${randomUUID().slice(0, 8)}`,
    oem = 'QA OEM-82 00-768 / أ',
    barcode = '2000000999999';
  await page.getByTestId('product-sku').fill(sku);
  await page.getByTestId('product-brand').fill('SYNTHETIC');
  await page.getByTestId('product-category').fill('filters');
  await page.getByTestId('product-name-ar').fill('فلتر اختبار');
  await page.getByTestId('product-name-fr').fill('Filtre de test');
  await page.getByTestId('product-name-en').fill('Test filter');
  await page.getByTestId('product-price').fill('89,50');
  await page.getByTestId('product-cost').fill('40,00');
  await page.getByTestId('product-pack-size').fill('10');
  await page.getByTestId('product-oem').fill(oem);
  await page.getByTestId('product-barcode').fill(barcode);
  await page.getByTestId('product-image').setInputFiles({
    name: 'original-qa-pixel.png',
    mimeType: 'image/png',
    buffer: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#17695f' } })
      .png()
      .toBuffer(),
  });
  await page.getByTestId('product-rights').fill('Original one-pixel QA fixture. Internal test use only.');
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(page.getByTestId('product-sku')).toHaveValue(sku);
    await expect(page.getByTestId('product-oem')).toHaveValue(oem);
    await expect(page.getByTestId('product-price')).toHaveValue('89,50');
    expect(
      await page.getByTestId('product-image').evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe('original-qa-pixel.png');
    await capture(page, `phone-product-draft-${locale}`, testInfo);
  }
  await page.getByTestId('product-submit').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const created = await product(page, sku);
  expect(created.oem).toBe(oem);
  expect(created.barcode).toBe(barcode);
  expect(created.packSize).toBe(10);
  expect(created.priceMinor).toBe(8950);
  await navigate(page, 'inventory');
  await page.getByTestId('receipt-product').selectOption(created.id);
  await page.getByTestId('receipt-quantity').fill('1');
  await page.getByTestId('receipt-unit').selectOption('CARTON');
  await page.getByTestId('receipt-reference').fill(`QA-BILL-${sku}`);
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(page.getByTestId('receipt-product')).toHaveValue(created.id);
    await expect(page.getByTestId('receipt-quantity')).toHaveValue('1');
    await expect(page.getByTestId('receipt-unit')).toHaveValue('CARTON');
    await capture(page, `phone-receipt-draft-${locale}`, testInfo);
  }
  await page.getByTestId('receipt-preview').click();
  await page.getByTestId('receipt-submit').click();
  await expect
    .poll(async () => (await product(page, sku)).stock.reduce((sum: number, s: any) => sum + s.onHand, 0))
    .toBe(10);
  await jsonEvidence('owner-product-receipt', {
    sku,
    oem,
    barcode,
    priceMinor: created.priceMinor,
    packSize: created.packSize,
    receivedPCS: 10,
    imageFixture: 'Original synthetic one-pixel PNG',
  });
  for (const viewport of [
    { width: 390, height: 844, name: 'phone' },
    { width: 1280, height: 800, name: 'tablet' },
  ]) {
    await page.setViewportSize(viewport);
    for (const screen of [
      'dashboard',
      'catalog',
      'inventory',
      'purchases',
      'suppliers',
      'vehicles',
      'imports',
      'audit',
      'team',
    ]) {
      await navigate(page, screen);
      for (const locale of locales) {
        timings.push({
          screen: `${screen}-${viewport.name}`,
          locale,
          durationMs: await switchLanguage(page, locale),
        });
        await checkHeader(page);
        await capture(page, `${viewport.name}-${screen}-${locale}`);
      }
    }
  }
  await navigate(page, 'dashboard');
  await axe(page, 'owner-dashboard-en');
  await switchLanguage(page, 'ar');
  await axe(page, 'owner-dashboard-ar');
  await jsonEvidence('locale-switch-timings', {
    environment:
      'Desktop Chromium browser emulation; click-to-lang/dir assertion includes automation round trips; not target hardware render profiling',
    observations: timings,
  });
});
