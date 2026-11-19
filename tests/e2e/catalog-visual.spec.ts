import { test, expect } from '@playwright/test';
import { login, navigate, switchLanguage, locales, capture, checkHeader } from './helpers';

test('Catalog switches between operational table and visual product cards without changing stock data', async ({page},testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await login(page,'owner');
  await navigate(page,'catalog');
  await page.getByTestId('product-search').fill('AP-FLT-001');
  const table=page.locator('.catalog-table');
  await expect(table).toBeVisible();
  await expect(page.getByTestId('catalog-view-table')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('catalog-view-visual').click();
  await expect(page.getByTestId('catalog-view-visual')).toHaveAttribute('aria-pressed','true');
  await expect(table).toHaveCount(0);
  const cards=page.getByTestId('catalog-visual-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByText('AP-FLT-001')).toBeVisible();
  const before=await cards.first().locator('.catalog-visual-price').textContent();
  const availability=await cards.first().locator('.catalog-visual-meta').textContent();
  for(const locale of locales) {
    await switchLanguage(page,locale);
    await checkHeader(page);
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.catalog-visual-price')).toHaveText(before ?? '');
    await expect(cards.first().locator('.catalog-visual-meta')).toContainText((availability ?? '').trim().slice(0,1));
    await expect(cards.first().locator('.catalog-visual-image-kind')).toBeVisible();
    await capture(page,`catalog-cards-phone-${locale}`,testInfo);
  }
  await page.setViewportSize({width:320,height:720});
  await checkHeader(page);
  const rect=await cards.first().boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.width).toBeGreaterThan(250);
  await capture(page,'catalog-cards-narrow-ar',testInfo);
  await cards.first().getByRole('button').first().click();
  await expect(page.getByRole('dialog').last()).toBeVisible();
  await page.getByRole('dialog').last().getByRole('button',{name:/close|fermer|إغلاق/i}).first().click();
  await page.setViewportSize({width:1280,height:800});
  await expect(cards).toHaveCount(1);
  await capture(page,'catalog-cards-tablet',testInfo);
  await page.getByTestId('catalog-view-table').click();
  await expect(table).toBeVisible();
  await expect(page.getByTestId('catalog-view-table')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('catalog-visual-results')).toHaveCount(0);
});
