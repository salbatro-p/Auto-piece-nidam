import { test, expect } from '@playwright/test';
import { capture, checkHeader, login, navigate, switchLanguage, locales } from './helpers';

test('Premium automotive cockpit is usable, illustrated and responsive in AR FR EN', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'owner');
  await navigate(page, 'dashboard');
  for (const locale of locales) {
    await switchLanguage(page, locale);
    await expect(page.locator('.workspace-hero')).toBeVisible();
    await expect(page.locator('.workspace-hero-illustration')).toHaveAttribute('src', '/garage-dashboard.svg');
    await expect(page.locator('.workspace-search-launch')).toBeVisible();
    await expect(page.locator('.workspace-shortcuts .workspace-shortcut').first()).toBeVisible();
    await checkHeader(page);
    await capture(page, 'premium-owner-phone-' + locale, testInfo);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await switchLanguage(page, 'en');
  await expect(page.locator('.workspace-hero')).toBeVisible();
  await expect(page.locator('.workspace-shortcuts .workspace-shortcut')).toHaveCount(3);
  await checkHeader(page);
  await capture(page, 'premium-owner-tablet-en', testInfo);
  await page.getByTestId('workspace-search').click();
  await expect(page.getByTestId('workspace-query')).toBeFocused();
  await page.getByRole('dialog').last().getByTestId('workspace-query').fill('AP-FLT-001');
  await expect(page.getByRole('dialog').last().getByText('AP-FLT-001').first()).toBeVisible();
});
