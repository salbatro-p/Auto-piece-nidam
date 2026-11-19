import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { checkHeader, locales, login, navigate, switchLanguage } from './helpers';
import { translate } from '../../packages/i18n/src/business';

test('Counter lookup preserves the active part across layouts, languages and evidence sections', async ({ page }, testInfo) => {
  const directory = 'docs/evidence/atelier';
  await mkdir(directory, { recursive: true });
  const captureViewport = async (name: string) => {
    const path = `${directory}/${name}.png`;
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'owner');
  await navigate(page, 'dashboard');
  for (const language of locales) {
    await switchLanguage(page, language);
    await expect(page.locator('.metric strong').first()).not.toHaveText('—');
    await checkHeader(page);
    await captureViewport(`phone-${language}`);
  }

  for (const width of [1024, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await checkHeader(page);
    const search = page.locator('.workspace-search-launch');
    await expect(search).toBeInViewport();
    await captureViewport(`dashboard-${width}`);
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await navigate(page, 'catalog');
  await page.getByTestId('product-search').fill('AP-FLT-001');
  await expect(page.locator('.catalog-table .product-cell')).toHaveCount(1);
  await page.getByTestId('catalog-view-visual').click();
  const card = page.getByTestId('catalog-visual-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('AP-FLT-001');
  await captureViewport('catalog-1024');
  await card.locator('.catalog-visual-inspect').click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByTestId('part-copy-sku')).toBeVisible();
  await captureViewport('part-1024');

  for (const language of locales) {
    await page.setViewportSize({ width: 320, height: 720 });
    await switchLanguage(page, language);
    const name = translate(language, 'vehicleCompatibility');
    await dialog.getByRole('button', { name, exact: true }).click();
    const heading = dialog.getByRole('heading', { name, exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await dialog.getByTestId('part-show-gallery').click();
    await expect(dialog.getByTestId('part-media-section')).toBeFocused();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await captureViewport('gallery-320');
  await dialog.locator('.modal-heading .icon-button').click();
  await expect(page.getByTestId('product-search')).toHaveValue('AP-FLT-001');
  await expect(card).toHaveCount(1);
});
