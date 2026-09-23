import { defineConfig, devices } from '@playwright/test';

// Runs against the Docker stack: docker compose up -d --build, then
//   E2E_ADMIN_PASSWORD=... npm run e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8765',
    headless: true,
    trace: 'retain-on-failure',
    // Optional: reuse an already-installed Chromium instead of downloading one.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
  ],
});
