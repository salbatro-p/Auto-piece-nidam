import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {login,navigate,switchLanguage,currentSession} from './helpers';
import {translate as t} from '../../packages/i18n/src/business';

test('Original measured views require the exact reference, year, review and live vehicle evidence',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page,'owner');await switchLanguage(page,'en');
  const session=await currentSession(page);
  const post=async(url:string,data:object)=>{
    const r=await page.request.post('/api'+url,{data,headers:{'x-csrf-token':session.csrfToken,'idempotency-key':randomUUID()}});
    expect(r.ok(),url+' '+r.status()).toBeTruthy();return r.json();
  };
  const sku='SPIN-'+randomUUID().slice(0,8),mpn='QA-SLEEVE-'+sku;
  const v=(await (await page.request.get('/api/vehicles')).json()).items[0];
  const src=(await (await page.request.get('/api/sources')).json()).items.find((s:{canStore:boolean})=>s.canStore);
  const product=await post('/products',{sku,manufacturerPartNo:mpn,brand:'QA',names:{en:'Measured QA sleeve'},category:'HARDWARE_BEARING',packSize:1,priceMinor:0,costMinor:0});
  const link={productId:product.id,vehicleId:v.id,sourceId:src.id,evidence:'Synthetic drawing and vehicle evidence for this isolated turntable test.'};
  await post('/fitments',{...link,status:'VERIFIED'});
  const license=await post('/media/licenses',{name:'QA geometry '+sku,sourceType:'COMPANY',termsVersion:'QA v1',proof:'Company-authored synthetic measurements. Internal QA display only.',internalDisplayPermitted:true,publicDisplayPermitted:false});
  await navigate(page,'catalog');
  const openProduct=async()=>{await page.getByTestId('product-search').fill(sku);await page.locator('.catalog-table tr').filter({hasText:sku}).locator('.product-cell').click();};
  const modal=()=>page.getByRole('dialog').last();
  await openProduct();await expect(modal().getByText(t('en','needsSkuGeometry'))).toBeVisible();
  await modal().getByRole('button',{name:t('en','addPhotos'),exact:true}).first().click();
  await modal().locator('.stl-intake summary').click();
  await modal().getByLabel(t('en','verifiedSpinVehicles')).selectOption(v.id);
  const year=v.yearFrom??v.year_from;
  await modal().getByLabel(t('en','spinModelYear')).fill(String(year));
  await modal().getByLabel(t('en','spinEvidence')).fill('QA independent measured section revision 1');
  const profile={kind:'measured-revolution-v1',unit:'mm',axisymmetric:true,sku,manufacturerPartNumber:mpn,vehicleId:v.id,year,profile:[[10,0],[20,0],[20,8],[15,8],[15,14],[10,14]]};
  await modal().getByTestId('stl-file').setInputFiles({name:'measured.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(profile))});
  await expect(modal().locator('.photo-selected-card')).toHaveCount(12);
  await switchLanguage(page,'fr');
  await modal().getByTestId('media-license').selectOption(license.id);
  await modal().getByRole('button',{name:t('fr','addPhotos'),exact:true}).click();
  await expect(modal().getByText(t('fr','uploadComplete'))).toBeVisible({timeout:40000});
  const endpoint='/api/products/'+product.id+'/spin-frames';
  expect((await(await page.request.get(endpoint)).json()).items).toHaveLength(0);
  const frames=(await(await page.request.get('/api/products/'+product.id+'/gallery')).json()).items;
  expect(frames).toHaveLength(12);
  for(const f of frames)await post('/media/'+f.id+'/review',{version:f.version,state:'APPROVED_INTERNAL',note:'QA section and model-year association reviewed against synthetic reference.',physicalMatchConfirmed:true,applicabilityConfirmed:true});
  expect((await(await page.request.get(endpoint)).json()).items).toHaveLength(12);
  await page.reload();await navigate(page,'catalog');await openProduct();await switchLanguage(page,'ar');
  await modal().locator('.part-spin summary').click();
  const section=modal().locator('.part-spin');await expect(section.locator('figcaption')).toContainText(String(year));
  const img=section.getByRole('img');await expect.poll(()=>img.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBeGreaterThan(0);
  const first=await img.getAttribute('src');await section.getByRole('button',{name:t('ar','rotateNext')}).click();await expect(img).not.toHaveAttribute('src',first!);
  await section.getByRole('button',{name:t('ar','playSpin')}).click();await section.getByRole('button',{name:t('ar','pauseSpin')}).click();
  await mkdir('docs/evidence/assortment',{recursive:true});await section.screenshot({path:'docs/evidence/assortment/measured-spin-ar.png'});
  await post('/fitments',{...link,status:'REVIEW_REQUIRED'});
  expect((await(await page.request.get(endpoint)).json()).items).toHaveLength(0);
  expect((await page.request.get('/api/media/'+frames[0].id)).status()).toBe(404);
});

test('BMW nominal drawing downloads only on its manufacturer reference in all three languages', async ({page}) => {
  await login(page, 'owner');
  await switchLanguage(page, 'en');
  const session = await currentSession(page);
  for (const brand of ['REFERENCE-QA', 'BMW']) {
    const sku = 'RING-' + randomUUID().slice(0, 8);
    const response = await page.request.post('/api/products', {
      headers: {'x-csrf-token': session.csrfToken, 'idempotency-key': randomUUID()},
      data: {sku, brand, manufacturerPartNo: '11 43 1 740 045', names: {en: 'Reference drawing check'}, category: 'HARDWARE_BEARING', packSize: 1, priceMinor: 0, costMinor: 0},
    });
    expect(response.ok()).toBeTruthy();
    await page.reload();
    await navigate(page, 'catalog');
    await page.getByTestId('product-search').fill(sku);
    await page.locator('.catalog-table tr').filter({hasText: sku}).locator('.product-cell').click();
    const dialog = page.getByRole('dialog').last();
    await expect(dialog.getByText(t('en', 'needsSkuGeometry'))).toBeVisible();
    if (brand !== 'BMW') {
      await expect(dialog.getByRole('link', {name: t('en', 'downloadRingDrawing')})).toHaveCount(0);
      continue;
    }
    for (const language of ['en', 'fr', 'ar'] as const) {
      await switchLanguage(page, language);
      const link = dialog.getByRole('link', {name: t(language, 'downloadRingDrawing')});
      await expect(link).toBeVisible();
      const asset = await page.request.get((await link.getAttribute('href'))!);
      expect(asset.ok()).toBeTruthy();
      const bytes = await asset.body();
      expect(bytes.readUInt32LE(80)).toBe(6144);
      expect(bytes.length).toBe(84 + 6144 * 50);
    }
    await expect(dialog.locator('.part-spin')).toHaveCount(0);
  }
});

