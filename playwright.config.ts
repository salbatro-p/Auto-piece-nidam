import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/evidence/browser-results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    actionTimeout:15000,
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    browserName: 'chromium',
    locale: 'fr-FR',
    timezoneId: 'Africa/Casablanca',
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
  },
});
