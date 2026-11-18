import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import assert from 'node:assert/strict';

const [mode, baseURL, outputDir] = process.argv.slice(2);
const url = new URL(baseURL);
const expectedPort = { before: '4175', after: '4174' }[mode];
if (process.env.DEMO_MODE !== 'true' || url.origin !== 'http://127.0.0.1:'+expectedPort || !outputDir)
  throw new Error('Run only against separate loopback test previews (before 4175, after 4174).');
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error('The private demo environment is required');
await mkdir(outputDir,{recursive:true});
const sku = 'AP-FLT-001';
const browser = await chromium.launch();
const page = await browser.newPage({baseURL,viewport:{width:1280,height:800},locale:'en-US'});
const timings = [];
try {
  await page.goto('/');
  await page.getByTestId('login-email').fill('owner@demo.local');
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('nav-dashboard').waitFor();
  await page.getByTestId('language-en').click();
  await page.screenshot({path:resolve(outputDir,'tablet-overview.png')});
  for (let i=0;i<5;i++) {
    await page.getByTestId('nav-dashboard').click();
    const start=performance.now();
    if(mode==='before'){
      await page.getByTestId('nav-catalog').click();
      await page.getByTestId('product-search').fill(sku);
      await page.locator('.catalog-table tr').filter({has:page.getByText(sku,{exact:true})}).locator('.product-cell').click();
    } else {
      await page.getByTestId('workspace-search').click();
      await page.getByTestId('workspace-query').fill(sku);
      await page.getByRole('dialog').getByRole('button',{name:new RegExp(sku)}).click();
    }
    const part=page.getByRole('dialog').last();
    await part.getByText(sku,{exact:true}).waitFor();
    timings.push(Number((performance.now()-start).toFixed(1)));
    if(i===0)await page.screenshot({path:resolve(outputDir,'tablet-part.png')});
    await part.getByRole('button',{name:'Close',exact:true}).click();
  }
  await page.getByTestId('nav-pos').click();
  await page.getByTestId('product-search').fill(sku);
  await page.getByTestId('add-to-cart-'+sku).waitFor();
  await page.screenshot({path:resolve(outputDir,'tablet-pos.png')});
  const saleStarted=performance.now();
  await page.getByTestId('add-to-cart-'+sku).click();
  const confirm=page.getByTestId('sale-submit');
  const posted=page.waitForResponse(r=>r.url().endsWith('/api/sales')&&r.request().method()==='POST');
  await confirm.click();
  assert.equal((await posted).status(),200);
  await page.getByTestId('receipt').waitFor();
  const saleMs=Number((performance.now()-saleStarted).toFixed(1));
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByTestId('nav-dashboard').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(outputDir,'phone-overview.png')});
  const sorted=[...timings].sort((a,b)=>a-b);
  const report={mode,date:new Date().toISOString(),hardware:{cpu:cpus()[0]?.model,memoryBytes:totalmem()},
    transport:'Local Chromium on Windows, local PostgreSQL, 1280×800, no network throttling. Scripted interactions and response waits.',
    lookup:{samplesMs:timings,medianMs:sorted[2],actions:3},
    sale:{sampleMs:saleMs,actions:2,status:200}};
  await writeFile(resolve(outputDir,'timings.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
