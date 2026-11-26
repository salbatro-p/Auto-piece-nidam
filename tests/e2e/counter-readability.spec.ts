import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { money, quantity } from '../../packages/i18n/src/index';
import { currentSession, login, navigate, switchLanguage } from './helpers';

test('Counter staff can distinguish similar long references and read price and stock at every supported size and language', async ({ page, browser }, testInfo) => {
  const config = await page.request.get('/api/config');
  expect(config.ok()).toBeTruthy();
  expect((await config.json()).demo).toBe(true);
  await login(page, 'sales');
  await navigate(page, 'pos');
  const response = await page.request.get('/api/warehouses');
  expect(response.ok()).toBeTruthy();
  const warehouse = (await response.json()).items[0];
  const prefix = 'QA-CARD-' + randomUUID().slice(0, 8).toUpperCase();
  const common = prefix + '-AXLE-BEARING-' + 'A9X78C2B'.repeat(4);
  const oppositeSku = common + '-L', sku = common + '-R';
  const priceMinor = 12345, available = 12;
  // Only the owner prepares fixtures. The actual lookup, visual checks and selection all run as sales.
  const owner = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const setup = await owner.newPage();
    await login(setup, 'owner');
    const { csrfToken } = await currentSession(setup);
    async function post(path: string, data: object) {
      const result = await setup.request.post('/api' + path, {
        data, headers: { 'x-csrf-token': csrfToken, 'idempotency-key': randomUUID() },
      });
      expect(result.ok(), path + ' ' + result.status()).toBeTruthy();
      return result.json();
    }
    for (const ref of [oppositeSku, sku]) {
      const product = await post('/products', {
        sku: ref, brand: 'QA', names: { ar: 'محمل المحور', fr: 'Roulement de roue', en: 'Wheel bearing' },
        category: 'HARDWARE_BEARING', packSize: 1, priceMinor, costMinor: 0, status: 'ACTIVE_INTERNAL',
      });
      await post('/inventory/receipts', { productId: product.id, warehouseId: warehouse.id,
        quantity: available, unit: 'PCS', reference: ref, condition: 'SELLABLE' });
    }
  } finally {
    await owner.close();
  }

  const counter = page.locator('.pos-products:visible');
  await counter.locator('select').selectOption(warehouse.id);
  await page.getByTestId('product-search').fill(prefix);
  const card = page.getByTestId('add-to-cart-' + sku);
  const code = card.locator(':scope > .mono');
  await expect(page.getByTestId('add-to-cart-' + oppositeSku)).toBeEnabled();
  await mkdir('docs/evidence/screenshots', { recursive: true });
  for (const width of [320, 390, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : width === 1024 ? 768 : 900 });
    for (const locale of ['ar', 'fr', 'en'] as const) {
      await switchLanguage(page, locale);
      await expect(card).toBeEnabled();
      await expect(code).toHaveText(sku);
      await expect(code).toHaveAttribute('dir', 'ltr');
      await expect(card.locator('.part-card-bottom strong')).toHaveText(money(priceMinor, locale));
      await expect(card.locator('.stock-badge')).toContainText(quantity(available, locale));
      const layout = await card.evaluate(el => {
        const box = el.getBoundingClientRect(), grid = el.parentElement!.getBoundingClientRect();
        const skuField = el.querySelector<HTMLElement>(':scope > .mono')!;
        const range = document.createRange();
        range.selectNodeContents(skuField);
        const textRects = Array.from(range.getClientRects());
        const facts = [...el.querySelectorAll<HTMLElement>(':scope > .mono, .part-card-bottom strong, .stock-badge, .stock-badge > span:last-child')];
        return {
          fullRow: Math.abs(box.width - grid.width) <= 1,
          contained: facts.every(fact => fact.scrollWidth <= fact.clientWidth + 1) &&
            [...facts.map(fact => fact.getBoundingClientRect()), ...textRects].every(rect =>
              rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1),
          overflow: document.documentElement.scrollWidth - innerWidth,
          minimumFontSize: Math.min(...facts.map(fact => parseFloat(getComputedStyle(fact).fontSize))),
        };
      });
      expect(layout.contained, width + ' ' + locale + ' card contents').toBe(true);
      expect(layout.overflow, width + ' ' + locale + ' page overflow').toBeLessThanOrEqual(1);
      if (width < 500) {
        expect(layout.fullRow).toBe(true);
        expect(layout.minimumFontSize).toBeGreaterThanOrEqual(14);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const name = 'counter-parts-' + width + '-' + locale;
      const path = 'docs/evidence/screenshots/' + name + '.png';
      await page.screenshot({ path });
      await testInfo.attach(name, { path, contentType: 'image/png' });
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await switchLanguage(page, 'ar');
  await card.click();
  await expect(page.getByTestId('cart-quantity-' + sku)).toHaveValue('1');
  await expect(page.getByTestId('cart-quantity-' + oppositeSku)).toHaveCount(0);
  await expect(page.getByTestId('cart-total')).toHaveAttribute('data-minor', String(priceMinor));
});
