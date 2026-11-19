import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { login, currentSession, navigate, switchLanguage, locales, capture, jsonEvidence } from './helpers';
import { translate as t } from '../../packages/i18n/src/business';
async function fixturePhoto(sku:string,width:number,height:number,background:string){
 return sharp({create:{width,height,channels:3,background}}).composite([{input:Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="80" fill="#fff"/><text x="20" y="32" font-family="Arial" font-size="20" fill="#111">SYNTHETIC TEST FIXTURE</text><text x="20" y="60" font-family="Arial" font-size="16" fill="#111">${sku}</text></svg>`)}]).png().toBuffer();
}
test('IMG-06/08: staged upload resumes after response loss; gallery, rights and RTL work on phone/tablet', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  await login(page, 'owner');
  await switchLanguage(page, 'en');
  const session = await currentSession(page),
    headers = { 'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID() },
    sku = 'IMG-UI-' + randomUUID().slice(0, 8);
  const productResponse = await page.request.post('/api/products', {
    headers,
    data: {
      sku,
      names: {
        en: 'Synthetic photographed part',
        fr: 'Pièce photographiée fictive',
        ar: 'قطعة مصورة تجريبية',
      },
      brand: 'SYNTHETIC',
      manufacturerPartNo: '00-UI/ع',
      category: 'filters',
      packSize: 1,
      priceMinor: 12000,
      costMinor: 8000,
      status: 'ACTIVE_INTERNAL',
    },
  });
  expect(productResponse.ok()).toBe(true);
  const product = await productResponse.json();
  const licenseResponse = await page.request.post('/api/media/licenses', {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {
      name: 'UI synthetic original rights ' + sku,
      sourceType: 'COMPANY',
      termsVersion: 'QA-1',
      proof: 'Synthetic original pixel fixture only; no real product photo or vehicle claims.',
      internalDisplayPermitted: true,
      publicDisplayPermitted: false,
    },
  });
  expect(licenseResponse.ok()).toBe(true);
  const license = await licenseResponse.json();
  await navigate(page, 'catalog');
  await page.getByTestId('product-search').fill(sku);
  await page.locator('.catalog-table tr').filter({has:page.getByText(sku,{exact:true})}).locator('.product-cell').click();
  await page.getByRole('button', { name: t('en', 'addPhotos'), exact: true }).click();
  const dialog = () => page.locator('dialog[open]').last();
  await dialog().getByTestId('media-license').selectOption(license.id);
  await dialog().getByLabel(t('en', 'viewAngle'), { exact: true }).fill('SYNTHETIC front / أمامي');
  const bytes = await fixturePhoto(sku,640,480,'#2250b8');
  await dialog()
    .getByTestId('media-files')
    .setInputFiles({ name: 'synthetic-fixture.png', mimeType: 'image/png', buffer: bytes });
  // Preview real user-selected bytes locally; no unreviewed upload is published.
  await expect(dialog().getByTestId('photo-capture-guide')).toBeVisible();
  await expect(dialog().getByTestId('photo-preview-grid').locator('img')).toHaveCount(1);
  await expect(dialog().getByTestId('photo-preview-grid').locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(dialog().getByTestId('photo-capture-guide')).toContainText(t('en', 'photoCaptureReference'));
  let writes = 0;
  await page.route('**/api/media/stage', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await route.fetch();
    await route.abort('failed');
  });
  await dialog()
    .getByRole('button', { name: t('en', 'addPhotos'), exact: true })
    .click();
  await expect(dialog().getByRole('alert')).toBeVisible();
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(dialog().getByTestId('media-license')).toHaveValue(license.id);
    await expect(dialog().getByLabel(t(locale, 'viewAngle'), { exact: true })).toHaveValue(
      'SYNTHETIC front / أمامي',
    );
    await expect(dialog().getByText('synthetic-fixture.png', { exact: true }).first()).toBeVisible();
    await expect(dialog().getByTestId('photo-capture-guide')).toContainText(t(locale, 'photoCaptureFace'));
    await expect(dialog().getByTestId('photo-preview-grid').locator('img')).toHaveCount(1);
    await capture(page, `upload-retry-${locale}`, testInfo);
  }
  await page.unroute('**/api/media/stage');
  await switchLanguage(page, 'en');
  await dialog()
    .getByRole('button', { name: t('en', 'retry'), exact: true })
    .click();
  await expect(dialog().getByText(t('en', 'uploadComplete'))).toBeVisible();
  expect(writes).toBe(1);
  await dialog()
    .getByRole('button', { name: t('en', 'close'), exact: true })
    .click();
  await page.getByRole('button', { name: t('en', 'photoReview'), exact: true }).click();
  await dialog()
    .getByTestId('media-review-note')
    .fill('Synthetic image exact manufacturer reference and licensing reviewed for test.');
  await dialog().getByLabel(t('en', 'physicalMatch'), { exact: true }).check();
  await dialog().getByLabel(t('en', 'applicabilityMatch'), { exact: true }).check();
  await dialog()
    .getByRole('button', { name: t('en', 'approveInternal'), exact: true })
    .click();
  const productGallery = () => page.getByRole('region',{ name: t('en','gallery'), exact: true });
  await expect(productGallery().locator('.media-card')).toHaveCount(1);
  // Review saves asynchronously. Poll the server's authoritative persisted result,
  // rather than inferring completion from an already-mounted gallery card.
  await expect.poll(async () => {
    const response = await page.request.get(`/api/products/${product.id}/gallery`);
    expect(response.ok()).toBe(true);
    const gallery = await response.json();
    return {
      count: gallery.items.length,
      state: gallery.items[0]?.state,
      displayApproved: gallery.items[0]?.displayApproved,
    };
  }, { timeout: 15000 }).toEqual({
    count: 1,
    state: 'APPROVED_INTERNAL',
    displayApproved: true,
  });
  const approvedGallery = await (await page.request.get(`/api/products/${product.id}/gallery`)).json();
  // The identity hero must update in-place when an exact company photo is approved.
  // A cashier should not have to close and reopen the product to see its reviewed image.
  await expect(dialog().getByTestId('part-photo-confidence')).toContainText(
    t('en', 'partPhotoReview'), { timeout: 15000 },
  );
  await expect(dialog().locator('.detail-intro .product-visual img')).toBeVisible();
  const latestProduct = await (await page.request.get(`/api/products/${product.id}`)).json();
  expect(latestProduct.mediaId).toBe(approvedGallery.items[0].id);
  expect(latestProduct.stock).toHaveLength(0);
  const audits = [];
  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    for (const locale of locales) {
      await switchLanguage(page, locale);
      const img = page.getByRole('region',{ name: t(locale,'gallery'), exact: true }).locator('.media-card img');
      await expect(img).toHaveAttribute('alt', /00|Synthetic|IMG-/);
      await expect(img).toHaveAttribute('src', /size=thumbnail$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      await jsonEvidence(`axe-gallery-${viewport.name}-${locale}`, {
        violations: result.violations,
        passes: result.passes.length,
      });
      expect.soft(result.violations).toEqual([]);
      audits.push({ device: viewport.name, locale, violations: result.violations.length });
      await capture(page, `gallery-${viewport.name}-${locale}`, testInfo);
    }
  }
  await page.route('**/api/media/*?size=display', (route) => route.abort('failed'));
  await switchLanguage(page, 'en');
  await productGallery().getByRole('button', { name: new RegExp(t('en', 'zoomPhoto')) }).click();
  await expect(dialog().getByText(t('en', 'IMAGE_UNAVAILABLE'), { exact: true })).toBeVisible();
  await jsonEvidence('image-browser', {
    recordedAt: new Date().toISOString(),
    syntheticOnly: true,
    uploadResponseLost: true,
    writes,
    assets: approvedGallery.items.length,
    stockUnchanged: true,
    audits,
    brokenImageFallback: true,
  });
});

test('IMG-05/06: CSV plus ZIP preview and interrupted batch resume preserve exact mapping in every language', async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await login(page, 'owner');
  await switchLanguage(page, 'en');
  const session = await currentSession(page),
    headers = { 'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID() },
    sku = 'IMG-BULK-' + randomUUID().slice(0, 8);
  const p = await page.request.post('/api/products', {
    headers,
    data: {
      sku,
      names: { en: 'Synthetic bulk item', fr: 'Article lot fictif', ar: 'قطعة دفعة تجريبية' },
      brand: 'SYNTHETIC',
      manufacturerPartNo: '000-BULK-UI',
      category: 'filters',
      packSize: 1,
      priceMinor: 100,
      costMinor: 50,
      status: 'ACTIVE_INTERNAL',
    },
  });
  expect(p.ok()).toBe(true);
  const product = await p.json();
  const l = await page.request.post('/api/media/licenses', {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {
      name: 'Synthetic batch rights ' + sku,
      sourceType: 'COMPANY',
      termsVersion: 'QA-bulk-1',
      proof: 'Synthetic generated fixture pixels only, with no real product claims.',
      internalDisplayPermitted: true,
      publicDisplayPermitted: false,
    },
  });
  expect(l.ok()).toBe(true);
  const license = await l.json();
  const bytes = await fixturePhoto(sku,600,400,'#4413a1'),
    zipped = zipSync({ 'one.png': bytes, 'duplicate.png': bytes, 'broken.png': Buffer.from('broken image') });
  const csv =
    'filename,sku,manufacturer_brand,manufacturer_part_no\n' +
    [
      ['one.png', sku, 'SYNTHETIC', '000-BULK-UI'],
      ['duplicate.png', sku, 'SYNTHETIC', '000-BULK-UI'],
      ['broken.png', sku, 'SYNTHETIC', '000-BULK-UI'],
      ['one.png', sku, 'SYNTHETIC', 'WRONG-MFR'],
    ]
      .map((r) => r.join(','))
      .join('\n');
  await navigate(page, 'catalog');
  await page.getByRole('button', { name: t('en', 'imageBulk'), exact: true }).click();
  const dialog = () => page.locator('dialog[open]').last();
  await dialog()
    .getByLabel(t('en', 'imageZip'), { exact: true })
    .setInputFiles({
      name: 'synthetic-photos.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipped),
    });
  await dialog()
    .getByLabel(t('en', 'imageManifest'), { exact: true })
    .setInputFiles({ name: 'manifest.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await dialog()
    .getByRole('combobox', { name: t('en', 'mediaLicenses'), exact: true })
    .selectOption(license.id);
  await dialog()
    .getByRole('button', { name: t('en', 'previewMapping'), exact: true })
    .click();
  await expect(dialog().locator('tbody tr')).toHaveCount(4);
  let firstWrites = 0;
  await page.route('**/api/media/imports/*/rows/1', async (route) => {
    firstWrites++;
    await route.fetch();
    await route.abort('failed');
  });
  await dialog()
    .getByRole('button', { name: t('en', 'stageBatch'), exact: true })
    .click();
  await expect(dialog().getByRole('alert')).toBeVisible();
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(dialog().locator('tbody tr')).toHaveCount(4);
    await expect(
      dialog().getByRole('combobox', { name: t(locale, 'mediaLicenses'), exact: true }),
    ).toHaveValue(license.id);
    await capture(page, `bulk-image-retry-${locale}`, testInfo);
  }
  await page.unroute('**/api/media/imports/*/rows/1');
  await switchLanguage(page, 'en');
  await dialog()
    .getByRole('button', { name: t('en', 'retry'), exact: true })
    .click();
  await expect(dialog().getByRole('status')).toHaveText(t('en', 'batchProgress', { done: 4, total: 4 }));
  expect(firstWrites).toBe(1);
  const statuses = await dialog().locator('tbody .badge').allTextContents();
  expect(statuses).toEqual([t('en', 'STAGED'), t('en', 'DUPLICATE'), t('en', 'ERROR'), t('en', 'ERROR')]);
  const gallery = await (await page.request.get(`/api/products/${product.id}/gallery`)).json();
  expect(gallery.items).toHaveLength(1);
  expect(gallery.items[0].state).toBe('REVIEW_REQUIRED');
  expect(gallery.items[0].manufacturerPartNumber).toBe('000-BULK-UI');
  const downloadPromise = page.waitForEvent('download');
  await dialog()
    .getByRole('button', { name: t('en', 'downloadResults'), exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe('image-import-results.csv');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await jsonEvidence('image-bulk-browser', {
    recordedAt: new Date().toISOString(),
    rows: 4,
    firstRowWrites: firstWrites,
    assets: 1,
    states: statuses,
    errors: ['INVALID_IMAGE', 'MEDIA_REFERENCE_MISMATCH'],
    languageDraftsPreserved: true,
    axeViolations: axe.violations,
  });
});
