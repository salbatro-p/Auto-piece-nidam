import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
export const locales = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const password = () => {
  if (process.env.DEMO_MODE !== 'true' || !process.env.DEMO_PASSWORD)
    throw new Error('Browser acceptance requires isolated DEMO_MODE and local DEMO_PASSWORD');
  return process.env.DEMO_PASSWORD;
};
export function otp() {
  const secret = process.env.DEMO_TOTP_SECRET;
  if (!secret) throw new Error('Local demo authenticator secret is required');
  const bits = [...secret]
    .map((c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((v) => parseInt(v, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest(),
    offset = digest[19]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export async function login(page: Page, role = 'sales') {
  await page.goto('/');
  const privileged = ['owner', 'manager'].includes(role);
  await expect(page.getByTestId('login-email')).toBeVisible();
  const requiresOtp = privileged && (await page.getByTestId('login-totp').count()) > 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByTestId('login-email').fill(`${role}@demo.local`);
    await page.getByTestId('login-password').fill(password());
    if (requiresOtp) await page.getByTestId('login-totp').fill(otp());
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByTestId('login-submit').click();
    const response = await responsePromise;
    if (response.ok()) break;
    const code = (await response.json()).code;
    // Clear secrets before an assertion can create a failure screenshot/DOM artifact.
    await page.getByTestId('login-password').fill('');
    if (requiresOtp) await page.getByTestId('login-totp').fill('');
    if (requiresOtp && code === 'MFA_INVALID' && attempt === 0) {
      // Adjacent fast tests may consume the same one-time code. Keep replay protection enabled.
      await new Promise(resolve => setTimeout(resolve, 30000 - Date.now() % 30000 + 150));
      continue;
    }
    expect(response.status(), `Synthetic login failed: ${code}`).toBe(200);
  }
  await expect(page.getByTestId('logout')).toBeAttached();
}
export async function switchLanguage(page: Page, locale: Locale) {
  const started = performance.now();
  const dialog = page.locator('dialog[open]');
  const scope = (await dialog.count()) ? dialog.last() : page;
  await scope.getByTestId(`language-${locale}`).click();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect(scope.getByTestId(`language-${locale}`)).toHaveAttribute('aria-pressed', 'true');
  return performance.now() - started;
}
export async function navigate(page: Page, name: string) {
  const nav = page.getByTestId(`nav-${name}`);
  if (!(await nav.isVisible())) await page.locator('.mobile-menu').click();
  await nav.click();
}
export async function checkHeader(page: Page) {
  const view = page.viewportSize()!;
  for (const locale of locales) {
    const selector = page.getByTestId(`language-${locale}`);
    await expect(selector).toBeVisible();
    const rect = await selector.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(-1);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(view.width + 1);
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y).toBeLessThan(160);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
export async function capture(page: Page, name: string, testInfo?: TestInfo) {
  await mkdir('docs/evidence/screenshots', { recursive: true });
  const path = `docs/evidence/screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  if (testInfo) await testInfo.attach(name, { path, contentType: 'image/png' });
}
export async function jsonEvidence(name: string, value: unknown) {
  await mkdir('docs/evidence', { recursive: true });
  await writeFile(`docs/evidence/${name}.json`, JSON.stringify(value, null, 2));
}
export async function currentSession(page: Page) {
  const response = await page.request.get('/api/me');
  expect(response.ok()).toBe(true);
  return response.json();
}
