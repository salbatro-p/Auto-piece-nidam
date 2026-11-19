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
    const searchRect=await page.locator('.workspace-search-launch').boundingBox();
    expect(searchRect).not.toBeNull();
    // A useful action must span the cockpit, not collapse to a 70px text column.
    expect(searchRect!.width).toBeGreaterThan(200);
    const amount=page.locator('.metric-grid .metric').last().locator('strong bdi');
    await expect(amount).toBeVisible();
    expect(await amount.evaluate(node=>getComputedStyle(node).overflowWrap)).toBe('normal');
    await expect(page.locator('.workspace-shortcuts .workspace-shortcut').first()).toBeVisible();
    await checkHeader(page);
    await capture(page, 'premium-owner-phone-' + locale, testInfo);
  }
  await page.setViewportSize({width:320,height:720});
  await switchLanguage(page,'ar');
  await checkHeader(page);
  const narrowSearch=await page.locator('.workspace-search-launch').boundingBox();
  expect(narrowSearch).not.toBeNull();
  expect(narrowSearch!.width).toBeGreaterThan(180);
  await capture(page,'premium-owner-narrow-ar',testInfo);
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

test('Compact language control preserves accessibility, keyboard, RTL and usable header at 320 390 and 1280', async ({ page }, testInfo) => {
  await login(page, 'owner');
  for(const width of [320,390,1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 720 });
    for(const locale of locales) {
      await switchLanguage(page, locale);
      await checkHeader(page);
      const picker=page.locator('.topbar').getByTestId('language-picker');
      const toggle=page.locator('.topbar').getByTestId('language-toggle');
      const rect=await toggle.boundingBox();
      expect(rect!.width).toBeLessThanOrEqual(110);
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(picker).toHaveAttribute('open','');
      for(const option of locales) await expect(picker.getByTestId(`language-${option}`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picker).not.toHaveAttribute('open','');
      await expect(toggle).toBeFocused();
      if(width === 320) await capture(page, `compact-header-320-${locale}`, testInfo);
    }
  }
});
