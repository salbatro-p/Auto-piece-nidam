import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
await context.request.post('http://127.0.0.1:4173/api/auth/login', {
  data: { email: 'sales@demo.local', password: process.env.DEMO_PASSWORD },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:4173/');
await page.getByTestId('nav-catalog').waitFor({ state: 'attached' });
await page.locator('.mobile-menu').click();
await page.getByTestId('nav-catalog').click();
await page.getByTestId('language-fr').click();
await page.screenshot({ path: 'docs/evidence/ui-inspection.png', fullPage: true });
console.log(
  await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (r.right > innerWidth + 1 || r.left < -1) && !e.closest('table');
      })
      .map((e) => ({
        tag: e.tagName,
        class: e.className,
        right: e.getBoundingClientRect().right,
        width: e.getBoundingClientRect().width,
        left: e.getBoundingClientRect().left,
        text: e.textContent?.slice(0, 90),
      }))
      .slice(0, 15),
  })),
);
console.log(
  await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => ({
        tag: e.tagName,
        cls: e.className,
        scroll: e.scrollWidth,
        client: e.clientWidth,
        overflow: getComputedStyle(e).overflow,
        direction: getComputedStyle(e).direction,
      }))
      .slice(0, 15),
  ),
);
await browser.close();
