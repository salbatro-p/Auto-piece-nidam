import {randomUUID} from 'node:crypto';
import {expect, test} from '@playwright/test';
import {currentSession, login, navigate, switchLanguage} from './helpers';
import {translate as t} from '../../packages/i18n/src/business';
import {quantity as formatQuantity} from '../../packages/i18n/src/index';

test('Counter explains warehouse limits and preserves quotes and reserved sales', async ({page}) => {
  await login(page, 'owner');
  await switchLanguage(page, 'en');
  await navigate(page, 'dashboard');
  const history = page.locator('section.panel').filter({has: page.getByRole('heading',{name:t('en','recentMovements')})});
  await expect(history).toBeVisible();
  await expect(history.getByText(t('en','today'), {exact:true})).toHaveCount(0);

  const sku = 'LIMIT-' + randomUUID();
  const session = await currentSession(page);
  const warehouses = await (await page.request.get('/api/warehouses')).json();
  const warehouse = warehouses.items[0];
  async function post(path:string, data:object) {
    const res = await page.request.post('/api' + path, {data, headers:{
      'x-csrf-token':session.csrfToken, 'idempotency-key':randomUUID(),
    }});
    expect(res.ok(),path+' '+res.status()).toBe(true);
    return res.json();
  }
  const product = await post('/products',{
    sku, brand:'QA', names:{ar:'قطعة اختبار',fr:'Pièce de test',en:'Counter test part'},
    category:'HARDWARE_BEARING', packSize:1, priceMinor:100, costMinor:0, status:'ACTIVE_INTERNAL',
  });
  await post('/inventory/receipts',{productId:product.id, warehouseId:warehouse.id,
    quantity:1, unit:'PCS', reference:sku, condition:'SELLABLE'});
  await navigate(page,'pos');
  await page.locator('.pos-products select').selectOption(warehouse.id);
  const search = page.getByTestId('product-search');
  await search.fill(sku);
  const tile = page.getByTestId('add-to-cart-'+sku);
  const input = page.getByTestId('cart-quantity-'+sku);
  await tile.click();
  // Two attempts to add the last item, by touch and scanner, keep the same saleable quantity.
  await tile.click();
  const terms = (lang:'ar'|'fr'|'en') => ({sku, warehouse:warehouse.name, available:formatQuantity(1,lang)});
  await expect(page.getByText(t('en','cartStockLimit',terms('en')))).toBeVisible();
  await search.press('Enter');
  await expect(input).toHaveValue('1');
  await input.fill('2');
  for (const lang of ['ar','fr','en'] as const) {
    await switchLanguage(page,lang);
    await expect(input).toHaveAccessibleDescription(t(lang,'cartStockExcess',terms(lang)));
    await expect(input).toHaveValue('2');
    await expect(page.getByTestId('sale-submit')).toBeDisabled();
    await expect(page.getByRole('button',{name:t(lang,'reserve'),exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:t(lang,'saveQuote'),exact:true})).toBeEnabled();
  }
  await page.getByRole('button',{name:t('en','saveQuote'),exact:true}).click();
  await expect(page.getByTestId('receipt')).toContainText(sku);
  await page.getByRole('dialog').getByRole('button',{name:t('en','close'),exact:true}).click();
  await input.fill('1');
  await page.getByRole('button',{name:t('en','reserve'),exact:true}).click();
  await expect(page.getByRole('button',{name:t('en','release'),exact:true})).toBeEnabled();
  await page.getByRole('button',{name:t('en','refreshPrices'),exact:true}).click();
  // The snapshot collected while this unit was reserved showed zero freely available.
  await page.getByRole('button',{name:t('en','release'),exact:true}).click();
  await expect(page.getByRole('button',{name:t('en','reserve'),exact:true})).toBeEnabled();
  await page.getByTestId('sale-submit').click();
  await expect(page.getByTestId('receipt')).toContainText(sku);
  await page.getByRole('dialog').getByRole('button',{name:t('en','close'),exact:true}).click();

  // Replenish and exercise the separate reserved-sale path as well.
  await post('/inventory/receipts',{productId:product.id, warehouseId:warehouse.id,
    quantity:1, unit:'PCS', reference:sku+'-2', condition:'SELLABLE'});
  await search.press('Enter');
  await expect(input).toHaveValue('1');
  await page.getByRole('button',{name:t('en','reserve'),exact:true}).click();
  await expect(page.getByRole('button',{name:t('en','release'),exact:true})).toBeEnabled();
  await page.getByRole('button',{name:t('en','refreshPrices'),exact:true}).click();
  await page.getByTestId('sale-submit').click();
  await expect(page.getByTestId('receipt')).toContainText(sku);
  const saved = await (await page.request.get('/api/products/'+product.id)).json();
  const balance = saved.stock.find((row:{warehouseId:string}) => row.warehouseId === warehouse.id);
  expect(Number(balance.onHand)).toBe(0);
  expect(Number(balance.reserved)).toBe(0);
});
