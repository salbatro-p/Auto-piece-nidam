import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { switchLanguage } from '../tests/e2e/helpers.ts';
import { translate } from '../packages/i18n/src/business.ts';

if(process.env.GITHUB_ACTIONS !== 'true'||!process.env.RUNNER_TEMP||!process.env.NODE_EXTRA_CA_CERTS)
  throw new Error('Use the isolated company-stack CI job');
const dir=process.env.RUNNER_TEMP;
const origin='https://localhost';
const {headers}=JSON.parse(await readFile(dir+'/company-session.json','utf8'));
const invite=await fetch(origin+'/api/staff/invitations',{method:'POST',headers:{...headers,origin,'content-type':'application/json','idempotency-key':randomUUID()},
  body:JSON.stringify({name:'QA counter',email:'counter@example.invalid',role:'sales',warehouseIds:[]})});
if(!invite.ok)throw new Error('Staff invitation failed');
const {token}=await invite.json(), password=randomBytes(24).toString('hex');
const browser=await chromium.launch();
try {
  await mkdir(dir+'/staff-evidence',{recursive:true});
  const ownerContext=await browser.newContext({viewport:{width:390,height:844}});
  await ownerContext.addCookies([{name:'ap_business',value:headers.cookie.split('=')[1],domain:'localhost',path:'/api',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const ownerPage=await ownerContext.newPage();
  await ownerPage.goto(origin);
  await ownerPage.getByTestId('company-setup').waitFor();
  await switchLanguage(ownerPage,'ar');
  const setup=ownerPage.getByTestId('company-setup');
  await expect(setup).toBeVisible();
  await expect(setup.locator('.setup-done')).toHaveCount(2);
  await ownerPage.screenshot({path:dir+'/staff-evidence/owner-setup-ar.png'});
  await setup.getByRole('button',{name:translate('ar','staffSetupStep')}).click();
  await expect(ownerPage.getByRole('button',{name:translate('ar','invite'),exact:true})).toBeVisible();
  await ownerContext.close();
  const page=await browser.newPage({viewport:{width:1024,height:900}});
  await page.goto(origin);
  await switchLanguage(page,'en');
  await expect(page.locator('.demo-login')).toHaveCount(0);
  await page.getByRole('button',{name:translate('en','acceptInvitation'),exact:true}).click();
  const dialog=page.getByRole('dialog').last();
  await dialog.locator('textarea').fill(token);
  await dialog.getByRole('button',{name:translate('en','verifyInvitation'),exact:true}).click();
  await dialog.locator('input[type=password]').fill(password);
  await dialog.getByRole('button',{name:translate('en','acceptInvitation'),exact:true}).click();
  await expect(dialog.getByRole('status').filter({hasText:translate('en','invitationReady')})).toBeVisible();
  await dialog.locator('.modal-heading .icon-button').click();
  await page.getByTestId('login-email').fill('counter@example.invalid');
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('product-search').fill('QA-001');
  if ((await page.request.get(origin+'/api/workspace/company-setup')).status() !== 403) throw new Error('Staff setup permission failed');
  await page.getByTestId('add-to-cart-QA-001').click();
  await page.getByTestId('sale-submit').click();
  const receipt=page.getByTestId('receipt');
  await expect(receipt).toBeVisible();
  const saleId=await receipt.getAttribute('data-sale-id');
  await mkdir(dir+'/staff-evidence',{recursive:true});
  for(const locale of ['ar','fr','en'] as const){
    await switchLanguage(page,locale);
    await expect(receipt).toContainText('QA Atelier');
    await expect(receipt).not.toContainText(translate(locale,'demoNotice'));
    await expect(receipt).toHaveAttribute('data-sale-id',saleId!);
    await expect(page.getByTestId('receipt-total')).toHaveAttribute('data-minor','4200');
    await page.screenshot({path:dir+'/staff-evidence/receipt-'+locale+'.png'});
  }
} finally { await browser.close(); }
