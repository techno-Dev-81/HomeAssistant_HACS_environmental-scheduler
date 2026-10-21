import { Page } from '@playwright/test';

// Reads an env value when called. On a missing value it names the variable only.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

// Logs in through the HA login page with HA_USERNAME and HA_PASSWORD,
// then waits for the frontend to load.
export async function login(page: Page): Promise<void> {
  const url = requireEnv('HA_URL');
  const username = requireEnv('HA_USERNAME');
  const password = requireEnv('HA_PASSWORD');

  await page.goto(url);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.waitForURL((u) => !u.pathname.startsWith('/auth/authorize'));
  await page.locator('home-assistant').waitFor();
}
