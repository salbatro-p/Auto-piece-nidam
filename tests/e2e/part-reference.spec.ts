import { test, expect } from '@playwright/test';
import { login, navigate, switchLanguage, locales, capture } from './helpers';
import { translate as t } from '../../packages/i18n/src/business';

test('Part identity panel copies exact SKU and OEM without changing records or misleading about photography', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page,'owner');
  await switchLanguage(page,'en');
  await navigate(page,'catalog');
  await page.getByTestId('product-search').fill('AP-FLT-001');
  await page.locator('.catalog-table .product-cell').first().click();
  const dialog=page.getByRole('dialog').last();

  await expect(dialog.getByTestId('part-copy-sku')).toBeVisible();
  const sku=await dialog.locator('.part-hero-facts .reference-identifier').textContent();
  expect(sku?.trim()).toBe('AP-FLT-001');
  await dialog.getByTestId('part-copy-sku').click();
  await expect(dialog.getByTestId('part-copy-sku')).toHaveAttribute('data-copy-state','copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('AP-FLT-001');

  const source=await (await page.request.get('/api/products?q=AP-FLT-001')).json();
  const product=source.items.find((p: {sku:string})=>p.sku==='AP-FLT-001');
  expect(product).toBeTruthy();
  await expect(dialog.getByTestId('part-photo-confidence')).toContainText(
    t('en',product.mediaId ? 'partPhotoReview' : 'partPhotoPending')
  );

  for(const locale of locales) {
    await switchLanguage(page,locale);
    await expect(dialog.getByTestId('part-photo-confidence')).toContainText(
      t(locale,product.mediaId ? 'partPhotoReview' : 'partPhotoPending')
    );
    await expect(dialog.getByTestId('part-copy-sku')).toBeVisible();
    await expect(dialog.getByTestId('part-show-gallery')).toHaveAccessibleName(t(locale,'gallery'));
    await dialog.getByTestId('part-show-gallery').click();
    await expect(dialog.getByTestId('part-media-section')).toBeFocused();
    await expect(dialog.getByTestId('part-media-section')).toBeInViewport();
    await capture(page,`part-gallery-jump-phone-${locale}`,testInfo);
    // Restore identity panel before the next language to keep screenshot comparisons stable.
    await dialog.locator('.detail-intro').scrollIntoViewIfNeeded();
    await capture(page,`part-reference-panel-phone-${locale}`,testInfo);
  }
  const oemButton=dialog.getByTestId('part-copy-oem');
  if(product.oem) {
    await oemButton.click();
    await expect(oemButton).toHaveAttribute('data-copy-state','copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(product.oem);
  } else {
    await expect(oemButton).toHaveCount(0);
  }
  await page.setViewportSize({width:1280,height:800});
  await capture(page,'part-reference-panel-tablet',testInfo);
  await expect(dialog.getByTestId('part-copy-sku')).toBeVisible();
});
