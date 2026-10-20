import { defineConfig } from '@playwright/test';

// run.sh sets these to paths inside the timestamped run folder. When they are
// unset (`--list`, a direct run), everything falls back to test-history/manual/,
// which is git-ignored.
const MANUAL_DIR = 'test-history/manual';

export default defineConfig({
  testDir: 'tests',
  workers: 1,
  timeout: 90_000,
  globalTimeout: 30 * 60_000,
  retries: 0,
  outputDir: process.env.PW_OUTPUT ?? `${MANUAL_DIR}/test-output`,
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.PW_HTML ?? `${MANUAL_DIR}/html-report`, open: 'never' }],
    ['json', { outputFile: process.env.PW_JSON ?? `${MANUAL_DIR}/results.json` }],
  ],
  projects: [
    {
      name: 'fresh-start',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'scenarios',
      dependencies: ['fresh-start'],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
});
