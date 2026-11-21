import { test, expect } from '@playwright/test';
import { login, switchLanguage } from './helpers';
import { translate } from '../../packages/i18n/src/business';

test('Counter accepts consecutive scanner returns and resolves a lost reservation before another checkout action', async ({page}) => {
  await login(page, 'sales');
  await switchLanguage(page,'en');
  const sku='AP-FLT-001';
  const search=page.getByTestId('product-search');
  await search.fill(sku);
  await search.press('Enter');
  await search.press('Enter');
  const quantity=page.getByTestId('cart-quantity-'+sku);
  await expect(quantity).toHaveValue('2');
  await search.fill('NO-SUCH-REF-TEST');
  await search.press('Enter');
  await expect(page.getByText(translate('en','inspectScan'))).toBeVisible();
  await expect(quantity).toHaveValue('2');

  let posts=0;
  await page.route('**/api/inventory/reservations',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    posts++;
    const response=await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed');
  });
  await page.getByRole('button',{name:translate('en','reserve'),exact:true}).click();
  const retry=page.getByRole('button',{name:translate('en','retry'),exact:true});
  await expect(retry).toBeEnabled();
  await expect(page.getByTestId('sale-submit')).toBeDisabled();
  await expect(page.getByRole('button',{name:translate('en','saveQuote'),exact:true})).toBeDisabled();
  await switchLanguage(page,'ar');
  await page.getByRole('button',{name:translate('ar','retry'),exact:true}).click();
  const release=page.getByRole('button',{name:translate('ar','release'),exact:true});
  await expect(release).toBeEnabled();
  expect(posts).toBe(1);
  await release.click();
  await expect(quantity).toBeEnabled();
  await expect(quantity).toHaveValue('2');
});
