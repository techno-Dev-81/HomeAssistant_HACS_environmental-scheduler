import { Page } from '@playwright/test';

// Browser steps on Settings > Devices & services, as an installer would.
// Selectors use roles and visible text, so an HA UI change is fixed here only.

const TIMEOUT = 30_000;

// HA dialogs are scoped by their element tag: the role tree places slotted
// content under the dialog role, but in the DOM it is not inside it, so
// getByRole('dialog') cannot be chained.

// From the HA frontend: sidebar Settings, then Devices & services.
export async function openDevicesAndServices(page: Page): Promise<void> {
  await page.getByRole('link', { name: /Settings/ }).click();
  await page.getByRole('link', { name: /Devices & services/ }).click();
  await page.getByRole('button', { name: 'Add integration' }).waitFor({ timeout: TIMEOUT });
}

// On Devices & services: open the integration, open its entry menu, Delete, confirm.
export async function removeIntegration(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(`^${name} `) }).click();
  await page.getByRole('heading', { name: 'Integration entries' }).waitFor({ timeout: TIMEOUT });
  await page.locator('ha-config-entry-row').getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.locator('dialog-box').getByRole('button', { name: 'Delete' }).click();
}

// On Devices & services: Add integration, search by name, pick it, submit the
// single-step config flow, finish.
export async function addIntegration(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Add integration' }).click();
  const picker = page.locator('dialog-add-integration');
  await picker.getByPlaceholder('Search for a brand name').fill(name);
  await picker.getByRole('button', { name, exact: true }).click();
  const flow = page.locator('dialog-data-entry-flow');
  await flow.getByRole('button', { name: 'Submit' }).click();
  await flow.getByRole('button', { name: 'Finish' }).click();
}

// On Devices & services: open the integration, then Configure on its entry,
// which opens the options flow menu.
export async function openIntegrationOptions(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(`^${name} `) }).click();
  await page.getByRole('heading', { name: 'Integration entries' }).waitFor({ timeout: TIMEOUT });
  await page.locator('ha-config-entry-row').getByRole('button', { name: 'Configure' }).click();
}

// In the options flow menu: Edit a room, pick the room, Submit, tick
// Delete this room, Submit. The flow returns to its menu.
export async function deleteRoomInOptionsFlow(page: Page, roomName: string): Promise<void> {
  const flow = page.locator('dialog-data-entry-flow');
  await flow.getByText('Edit a room', { exact: true }).click();
  await flow.getByRole('radio', { name: roomName, exact: true }).click({ timeout: TIMEOUT });
  await flow.getByRole('button', { name: 'Submit' }).click();
  // The switch has no accessible name and its visible thumb covers it; the
  // labelled wrapper carries the label and is what a user clicks.
  const deleteToggle = flow.getByLabel('Delete this room', { exact: true });
  await deleteToggle.click({ timeout: TIMEOUT });
  await deleteToggle.getByRole('switch', { checked: true }).waitFor({ timeout: TIMEOUT });
  await flow.getByRole('button', { name: 'Submit' }).click();
}

// In the options flow menu: Done, which closes the flow.
export async function finishOptionsFlow(page: Page): Promise<void> {
  const flow = page.locator('dialog-data-entry-flow');
  await flow.getByText('Done', { exact: true }).click();
  await flow.waitFor({ state: 'hidden', timeout: TIMEOUT });
}
