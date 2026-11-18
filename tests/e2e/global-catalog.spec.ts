import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { capture, login, navigate, switchLanguage, locales, currentSession } from './helpers';

test('Official model-year snapshot and reviewed original category visuals work in AR, FR and EN', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page,'owner');
  const me = await currentSession(page);
  const post = (url: string,data: object) => page.request.post(url,{ data,headers: { 'x-csrf-token': me.csrfToken,'idempotency-key': randomUUID() } });
  const sourceName = 'NHTSA vPIC · US model-year references';
  const sources = (await (await page.request.get('/api/sources')).json()).items;
  if (!sources.some((source: {name:string}) => source.name === sourceName)) {
    const result = await post('/api/sources',{
      name: sourceName,origin:'https://vpic.nhtsa.dot.gov/api/',
      license:'Official documentation: https://vpic.nhtsa.dot.gov/api/Home/Index/FAQ. Internal factual model-year reference only.',
      canStore:true,canDisplay:true,canSyndicate:false,
    });
    expect(result.ok()).toBe(true);
  }
  const licenseName = 'Original local educational templates';
  const licenses = (await (await page.request.get('/api/media/licenses')).json()).items;
  if (!licenses.some((license: {name:string}) => license.name === licenseName)) {
    const result = await post('/api/media/licenses',{
      name:licenseName,sourceType:'COMPANY',termsVersion:'AutoParts local template v1',
      proof:'Original AutoParts artwork from local geometric templates. Internal educational display only.',
      internalDisplayPermitted:true,publicDisplayPermitted:false,
    });
    expect(result.ok()).toBe(true);
  }
  const samplePath = 'samples/vpic-honda-2020.json';
  const sample = JSON.parse(await readFile(samplePath,'utf8'));
  await switchLanguage(page,'en');
  await navigate(page,'imports');
  await page.getByRole('button',{name:'Catalog reference imports'}).click();
  let dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Source',{exact:true}).selectOption({label:sourceName});
  await dialog.locator('input[type=file]').setInputFiles(samplePath);
  await expect(dialog.getByLabel('Dataset version')).toHaveValue(sample.datasetVersion);
  for (const locale of locales) await switchLanguage(page,locale);
  await dialog.getByRole('button',{name:'Review rows'}).click();
  await expect(dialog.getByText(/^HONDA · Civic · 2020$/)).toBeVisible();
  const run = dialog.getByRole('button',{name:'Approve and process'});
  if (await run.count()) await run.click();
  await expect(dialog.getByText('6 accepted · 0 duplicate · 0 conflicting · 0 rejected')).toBeVisible();
  const jobs = (await (await page.request.get('/api/catalog/feeds')).json()).items;
  const job = jobs.find((item: {datasetVersion:string}) => item.datasetVersion === sample.datasetVersion);
  expect(job.provenance.rawSha256).toBe(sample.rawSha256);
  expect(job.checkpoint).toBe(6);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();

  await navigate(page,'vehicles');
  await page.getByRole('button',{name:'Source references'}).click();
  dialog = page.getByRole('dialog').last();
  await expect(dialog.getByText(/^HONDA · Civic · 2020 · US$/)).toBeVisible();
  await expect(dialog.getByText(/compatibility has not been verified/)).toBeVisible();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();

  await navigate(page,'catalog');
  await page.getByRole('button',{name:'Illustrations and diagrams'}).click();
  dialog = page.getByRole('dialog').last();
  await dialog.getByLabel('Category',{exact:true}).selectOption('filters');
  await dialog.getByLabel('License / permissions',{exact:true}).selectOption({label:licenseName});
  for (const locale of locales) await switchLanguage(page,locale);
  await dialog.getByRole('button',{name:'Queue illustration'}).click();
  const card = dialog.locator('.media-card').filter({hasText:'Category illustration (3D style)'}).filter({hasText:licenseName}).first();
  await expect(card.getByRole('img')).toBeVisible();
  const image = card.getByRole('img');
  await expect.poll(() => image.evaluate((el:HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await card.getByRole('button',{name:'Review illustration'}).click();
  await dialog.getByLabel('Review note (at least 8 characters)').fill('Reviewed as a general filter-category example.');
  const approve = dialog.getByRole('button',{name:'Approved for internal use',exact:true});
  if (await approve.count()) await approve.click();
  await expect.poll(async () => {
    const assets = (await (await page.request.get('/api/visuals?category=filters')).json()).items;
    return assets.some((item: {kind:string}) => item.kind === 'CATEGORY_3D');
  }).toBe(true);

  const licenseId = (await (await page.request.get('/api/media/licenses')).json()).items
    .find((license: {name:string}) => license.name === licenseName).id;
  const diagramResponse = await post('/api/visuals',{ category:'filters',kind:'SYSTEM_DIAGRAM',template:'OIL_FILTER',licenseId });
  expect(diagramResponse.ok()).toBe(true);
  const diagramId = (await diagramResponse.json()).id;
  await expect.poll(async () => {
    const jobs = (await (await page.request.get('/api/visuals')).json()).items;
    return jobs.find((entry: {id:string}) => entry.id === diagramId)?.state;
  }).toMatch(/^(REVIEW_REQUIRED|APPROVED_INTERNAL)$/);
  const currentDiagram = (await (await page.request.get('/api/visuals')).json()).items.find((entry: {id:string}) => entry.id === diagramId);
  if (currentDiagram.state === 'REVIEW_REQUIRED') {
    const decision = await post(`/api/visuals/${diagramId}/review`,{
      decision:'APPROVED_INTERNAL',note:'General educational diagram, with no vehicle-specific applicability.',
    });
    expect(decision.ok()).toBe(true);
  }
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByTestId('product-search').fill('AP-FLT-001');
  await page.locator('.catalog-table tr').filter({has:page.getByText('AP-FLT-001',{exact:true})}).locator('.product-cell').click();
  dialog = page.getByRole('dialog').last();
  const disclaimer = dialog.getByText('Original illustration. It does not depict the exact SKU, fitment or installation location.');
  await expect(disclaimer).toBeVisible();
  await expect(dialog.getByText(/Oil circuit overview/)).toBeVisible();
  await disclaimer.scrollIntoViewIfNeeded();
  await expect.poll(() => dialog.getByAltText('General system diagram · Oil filter').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await capture(page,'global-catalog-original-visual');
});
