import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {translate} from '../../packages/i18n/src/business';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import moment from 'moment-timezone';
import {
  locales,
  login,
  switchLanguage,
  navigate,
  capture,
  checkHeader,
  currentSession,
  jsonEvidence,
  password,
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
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await jsonEvidence(`axe-${name}`, {
    url: page.url(),
    viewport: page.viewportSize(),
    locale: await page.locator('html').getAttribute('lang'),
    violations: result.violations,
    passes: result.passes.length,
    incomplete: result.incomplete.map((v) => ({ id: v.id, impact: v.impact })),
  });
  expect.soft(
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
    await page.getByTestId('language-toggle').focus();
    await page.keyboard.press('Enter');
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
  const savedSale = await (await page.request.get(`/api/sales/${committed!.id}`)).json();
  expect(committed!.createdAt).toBe(savedSale.createdAt);
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
    await expect(page.getByTestId('receipt')).toContainText(translate(locale, 'demoNotice'));
    const utc = Date.parse(savedSale.createdAt);
    const wallClock = utc - moment.tz.zone('Africa/Casablanca')!.utcOffset(utc) * 60000;
    const expectedDate = new Intl.DateTimeFormat({ ar:'ar-MA', fr:'fr-MA', en:'en-GB' }[locale], {
      dateStyle:'medium', timeStyle:'short', timeZone:'UTC', calendar:'gregory',
    }).format(new Date(wallClock));
    await expect(page.getByTestId('receipt-date')).toHaveText(expectedDate);
    await expect(page.getByTestId('receipt-date')).toHaveAttribute('datetime', savedSale.createdAt);
    await capture(page, `tablet-receipt-${locale}`, testInfo);
    const viewport=page.viewportSize()!;
    await page.setViewportSize({width:320,height:700});
    const amounts=page.getByTestId('receipt').locator('.receipt-line > bdi, .total-row > bdi, .receipt-total strong:last-child > bdi');
    expect(await amounts.count()).toBeGreaterThanOrEqual(4);
    for(const amount of await amounts.all()){
      expect(await amount.evaluate(el=>{
        const range=document.createRange();range.selectNodeContents(el);
        const rects=Array.from(range.getClientRects()).filter(r=>r.height>0);
        return rects.length>0 && Math.max(...rects.map(r=>r.top))-Math.min(...rects.map(r=>r.top))<2;
      })).toBe(true);
    }
    await page.setViewportSize(viewport);
  }
  await jsonEvidence('sale-response-loss', {
    saleId: committed!.id,
    sku,
    attempts: writes,
    expectedMinor,
    stockBefore: priorStock,
    stockAfter: nextStock,
    userIdUnchanged: true,
    persistedCreatedAt: savedSale.createdAt,
    receiptTimeZoneData: moment.tz.dataVersion,
    receiptDatesMatchInAllLocales: true,
    requestResult: 'one sale after lost response and recovery lookup',
  });
});

test('I18N-03 shared tablet isolates employee preferences and independent sessions', async ({
  page,
  browser,
}) => {
  // An asynchronous logout must finish before a new employee signs in.
  // The lock dialog also has login-submit, but its email is readonly; waiting for
  // the actual logout response prevents an interrupted request from leaking sessions.
  const signOut = async (tab: typeof page) => {
    const finished = tab.waitForResponse(r => r.url().endsWith('/api/auth/logout') && r.request().method() === 'POST');
    await tab.getByTestId('logout').click();
    expect((await finished).ok()).toBe(true);
    await expect(tab.getByTestId('login-email')).toBeEditable();
  };
  const preparation = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    locale: 'fr-FR',
  });
  try {
    const setup = await preparation.newPage();
    await login(setup, 'warehouse');
    await switchLanguage(setup, 'ar');
    await expect.poll(async () => (await currentSession(setup)).user.locale).toBe('ar');
    await signOut(setup);
  } finally {
    await preparation.close();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, 'sales');
  await switchLanguage(page, 'en');
  await expect.poll(async () => (await currentSession(page)).user.locale).toBe('en');
  await signOut(page);
  await expect(page.getByTestId('login-submit')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await login(page, 'warehouse');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByTestId('nav-team')).toHaveCount(0);
  await signOut(page);
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
  browser,
}, testInfo) => {
  test.setTimeout(600000);
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
    await axe(page,`phone-product-draft-${locale}`);
  }
  await page.getByTestId('product-submit').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const created = await product(page, sku);
  expect(created.oem).toBe(oem);
  expect(created.barcode).toBe(barcode);
  expect(created.packSize).toBe(10);
  expect(created.priceMinor).toBe(8950);
  await navigate(page, 'inventory');
  await page.locator('.product-picker').filter({ has: page.getByTestId('receipt-product') })
    .getByRole('textbox').fill(sku);
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
    await axe(page,`phone-receipt-draft-${locale}`);
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
    imageFixture: 'Original synthetic 8 × 8 PNG',
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
        await axe(page,`${viewport.name}-${screen}-${locale}`);
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
  await switchLanguage(page, 'en');
  await navigate(page, 'imports');
  const source = (await (await page.request.get('/api/sources')).json()).items.find((s: any) => s.canStore);
  await page.locator('main select').first().selectOption(source.id);
  const importedSku = 'QA-IMPORT-' + randomUUID().slice(0, 8);
  const csv =
    'sku,brand,manufacturer_part_no,name_ar,name_fr,name_en,category_path,unit,pack_qty,ean_gtin,price_mad,cost_mad\n' +
    `${importedSku},SYNTHETIC,00-QA-MFR,قطعة تجريبية,Pièce de test,Test part,filters,piece,10,0012345678905,12.50,8.00`;
  await page
    .locator('main input[type=file]')
    .setInputFiles({ name: 'blueprint-template.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('button', { name: 'Validate and preview', exact: true })).toBeEnabled();
  for (const locale of locales) {
    await switchLanguage(page, locale);
    expect(
      await page
        .locator('main input[type=file]')
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe('blueprint-template.csv');
  }
  await page.getByRole('button', { name: 'Validate and preview', exact: true }).click();
  await expect(page.locator('.operation-preview')).toContainText(importedSku);
  await page.getByRole('button', { name: 'Approve and commit', exact: true }).click();
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/products?q=' + importedSku);
      return (await r.json()).items.length;
    })
    .toBe(1);
  const imported = await product(page, importedSku);
  expect(imported.priceMinor).toBe(1250);
  expect(imported.packSize).toBe(10);
  expect(imported.manufacturerPartNo).toBe('00-QA-MFR');
  expect(imported.barcode).toBe('0012345678905');
  await capture(page, 'tablet-import-committed', testInfo);
  await navigate(page, 'inventory');
  await page.getByRole('button', { name: 'Storage bins', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('textbox', { name: 'Search', exact: true }).fill(sku);
  await dialog.getByRole('combobox', { name: 'Part', exact: true }).selectOption(created.id);
  await dialog.getByRole('button', { name: 'Add bin', exact: true }).click();
  const binCode = 'QA-' + randomUUID().slice(0, 8);
  await dialog.getByLabel('Bin code', { exact: true }).fill(binCode);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'From bin', exact: true }).selectOption({ label: 'RECEIVING' });
  await dialog.getByRole('combobox', { name: 'To bin', exact: true }).selectOption({ label: binCode });
  await dialog.getByLabel('Quantity', { exact: true }).fill('2');
  await dialog.getByLabel('Reason', { exact: true }).fill('Synthetic bin test');
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await capture(page, `tablet-bin-draft-${locale}`);
  }
  await dialog.getByRole('button', { name: 'Confirm operation', exact: true }).click();
  await expect
    .poll(async () => {
      const r = await page.request.get(`/api/bins?productId=${created.id}`);
      return (await r.json()).items.find((b: any) => b.code === binCode)?.onHand;
    })
    .toBe(2);
  expect((await product(page, sku)).stock.reduce((n: number, s: any) => n + s.onHand, 0)).toBe(10);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await jsonEvidence('browser-import-bins', {
    date: new Date().toISOString(),
    importedSku,
    manufacturerPartNo: imported.manufacturerPartNo,
    priceMinor: imported.priceMinor,
    binMoved: 2,
    warehouseTotal: 10,
  });
  await navigate(page,'suppliers');
  await page.getByRole('button',{name:'Supplier catalog',exact:true}).first().click();
  await dialog.getByRole('textbox',{name:'Search',exact:true}).fill(sku);
  await dialog.getByRole('combobox',{name:'Part',exact:true}).selectOption(created.id);
  await dialog.getByRole('textbox',{name:'Supplier reference',exact:true}).fill('00-SUP/ع-'+sku);
  await dialog.getByRole('textbox',{name:'Purchase cost (MAD)',exact:true}).fill('8,25');
  for(const locale of locales){await switchLanguage(page,locale);await capture(page,`supplier-reference-${locale}`);}
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(dialog.locator('tbody')).toContainText('00-SUP/ع-'+sku);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await navigate(page,'catalog');await page.getByTestId('product-search').fill(sku);
  await page.locator('.product-cell').first().click();
  await dialog.getByRole('textbox',{name:'Search',exact:true}).fill('AP-FLT-001');
  const replacement=await product(page,'AP-FLT-001');
  await dialog.getByRole('combobox',{name:'Part',exact:true}).selectOption(replacement.id);
  await dialog.getByRole('combobox',{name:'Source',exact:true}).selectOption(source.id);
  await dialog.getByRole('textbox',{name:'Evidence',exact:true}).fill('Synthetic supplier replacement notice; no vehicle compatibility claim.');
  for(const locale of locales){await switchLanguage(page,locale);await capture(page,`replacement-reference-${locale}`);}
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Withdraw',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  const ownerSession=await currentSession(page),openingSku='QA-OPEN-'+randomUUID().slice(0,8);
  const openingPart=await page.request.post('/api/products',{headers:{'x-csrf-token':ownerSession.csrfToken,'idempotency-key':randomUUID()},data:{sku:openingSku,names:{ar:'قطعة جرد تجريبية',fr:'Pièce inventaire test',en:'Test counted part'},brand:'SYNTHETIC',category:'filters',packSize:1,priceMinor:200,costMinor:100,status:'ACTIVE_INTERNAL'}});
  expect(openingPart.ok()).toBe(true);
  const counterContext=await browser.newContext({baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:4173'});
  try{
    const counterPage=await counterContext.newPage();await login(counterPage,'warehouse');await switchLanguage(counterPage,'en');
    const counterSession=await currentSession(counterPage),wh=(await (await counterPage.request.get('/api/warehouses')).json()).items[0];
    await navigate(counterPage,'inventory');await counterPage.getByRole('button',{name:'Opening balances',exact:true}).click();
    const countDialog=counterPage.locator('dialog[open]');
    const openingCsv=`sku,branch,warehouse,condition,quantity_counted,counted_by,count_date,source_document\n${openingSku},Synthetic Casablanca,${wh.code},SELLABLE,10,${counterSession.user.id},2026-10-29,Synthetic signed count sheet`;
    await countDialog.locator('input[type=file]').setInputFiles({name:'opening.csv',mimeType:'text/csv',buffer:Buffer.from(openingCsv)});
    await expect(countDialog.getByRole('button',{name:'Validate and preview',exact:true})).toBeVisible();
    for(const locale of locales)await switchLanguage(counterPage,locale);
    await countDialog.getByRole('button',{name:'Validate and preview',exact:true}).click();
    await expect(countDialog.locator('.operation-preview')).toContainText(openingSku);
    expect((await product(page,openingSku)).stock.reduce((n:number,s:any)=>n+s.onHand,0)).toBe(0);
  }finally{await counterContext.close();}
  await navigate(page,'inventory');await page.getByRole('button',{name:'Opening balances',exact:true}).click();
  await dialog.getByRole('button',{name:'View',exact:true}).first().click();
  await expect(dialog.locator('.operation-preview')).toContainText(openingSku);
  await dialog.getByRole('textbox',{name:'Reviewer notes and qualification',exact:true}).fill('Synthetic count sheet reviewed independently by demo owner.');
  for(const locale of locales){await switchLanguage(page,locale);await capture(page,`opening-review-${locale}`);}
  await dialog.getByRole('button',{name:'Approve and commit',exact:true}).click();
  await expect.poll(async()=>(await product(page,openingSku)).stock.reduce((n:number,s:any)=>n+s.onHand,0)).toBe(10);
  await jsonEvidence('browser-catalog-opening',{date:new Date().toISOString(),supplierReference:'00-SUP/ع-'+sku,openingSku,countedBy:'warehouse role',approvedBy:'owner role',stockBefore:0,stockAfter:10});
});

test('Offline and expired sessions preserve the sale draft through trilingual reauthentication',async({page,context})=>{
 await login(page,'sales');await switchLanguage(page,'en');const sku='AP-SPK-004',before=await product(page,sku);
 await page.getByTestId('product-search').fill(sku);await page.getByTestId(`add-to-cart-${sku}`).click();await page.getByTestId(`cart-quantity-${sku}`).fill('3');
 await context.setOffline(true);for(const locale of locales){await switchLanguage(page,locale);await expect(page.getByTestId(`cart-quantity-${sku}`)).toHaveValue('3');}
 await context.setOffline(false);await expect.poll(async()=>(await currentSession(page)).user.locale).toBe('en');
 const session=await currentSession(page);expect((await page.request.post('/api/auth/lock',{headers:{'x-csrf-token':session.csrfToken},data:{}})).ok()).toBe(true);
 await page.getByRole('button',{name:'Refresh cart prices',exact:true}).click();await expect(page.locator('.lock-overlay')).toBeVisible();
 for(const locale of locales)await switchLanguage(page,locale);
 await page.getByTestId('login-password').fill(password());await page.getByTestId('login-submit').click();await expect(page.locator('.lock-overlay')).toHaveCount(0);
 await expect(page.getByTestId(`cart-quantity-${sku}`)).toHaveValue('3');expect((await product(page,sku)).stock).toEqual(before.stock);
 await page.setViewportSize({width:320,height:720});for(const locale of locales){await switchLanguage(page,locale);await checkHeader(page);}
 await jsonEvidence('offline-session-draft',{date:new Date().toISOString(),cartQuantity:3,stockUnchanged:true,reauthenticated:true,narrowViewport:320});
});

test('Installed offline shell remains trilingual with no cached private records',async({page,context})=>{
 await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();
 await context.setOffline(true);await page.reload();
 for(const locale of locales){await page.locator(`[data-locale="${locale}"]`).click();await expect(page.locator('html')).toHaveAttribute('lang',locale);await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');await expect(page.locator(`[data-content="${locale}"]`)).toBeVisible();}
 const cached=await page.evaluate(async()=>{const urls=[];for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys())urls.push(new URL(request.url).pathname);return urls;});
 expect(cached.sort()).toEqual(['/icon.svg','/offline.css','/offline.html','/offline.js'].sort());
 await capture(page,'offline-en');await jsonEvidence('offline-shell',{date:new Date().toISOString(),locales,cachedPrivateResponses:0,cachedPaths:cached});
});
