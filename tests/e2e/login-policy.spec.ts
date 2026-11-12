import { test, expect } from '@playwright/test';
import { login, password, switchLanguage, locales } from './helpers';

test('Local preview uses password login and unlock in AR, FR and EN; standard mode keeps MFA visible', async ({ page }) => {
  await page.goto('/');
  const config = await (await page.request.get('/api/config')).json();
  await expect(page.getByTestId('login-email')).toBeVisible();
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(page.getByTestId('login-totp')).toHaveCount(config.passwordOnlyLogin ? 0 : 1);
  }
  await login(page, 'owner');
  await expect(page.getByTestId('nav-dashboard')).toBeAttached();
  if (config.passwordOnlyLogin) {
    await page.locator('.lock-button').click();
    const lock = page.getByRole('dialog');
    await expect(lock).toBeVisible();
    await expect(lock.getByTestId('login-totp')).toHaveCount(0);
    await lock.getByTestId('login-password').fill(password());
    const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await lock.getByTestId('login-submit').click();
    const status = (await response).status();
    if (status !== 200) await lock.getByTestId('login-password').fill('');
    expect(status).toBe(200);
    await expect(lock).toHaveCount(0);
  }
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login-email')).toBeVisible();
  expect((await page.request.get('/api/me')).status()).toBe(401);
});
