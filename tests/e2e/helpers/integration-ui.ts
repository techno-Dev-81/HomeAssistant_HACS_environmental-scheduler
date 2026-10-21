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

// In the options flow menu: Add a room, fill Room name, Submit. The flow
// returns to its menu.
export async function addRoomInOptionsFlow(page: Page, roomName: string): Promise<void> {
  const flow = page.locator('dialog-data-entry-flow');
  await flow.getByText('Add a room', { exact: true }).click();
  await flow.getByRole('textbox', { name: 'Room name' }).fill(roomName, { timeout: TIMEOUT });
  await flow.getByRole('button', { name: 'Submit' }).click();
  await flow.getByText('Add a room', { exact: true }).waitFor({ timeout: TIMEOUT });
}

// An entity to pick: its id is typed in the search and the option is chosen
// by its displayed name (the friendly name), because the search is fuzzy and
// also lists similar entities and a "Create a new ... helper" option.
export interface PickedEntity {
  label: string;
  entityId: string;
  friendlyName: string;
}

// In an open options flow form: open the entity picker whose label starts
// with `label`, search by the entity id and pick the single option shown
// with the entity's friendly name.
// The picker is scoped by its HA element tag and label text; a multiple
// picker adds an empty field after each pick, so the last field is used.
// The search popup opens inside the picker; it is scoped by its element tag
// because its dialog role holds a nested dialog and its name differs between
// a single picker (the label) and a multiple one ("Select option").
async function pickEntity(page: Page, { label, entityId, friendlyName }: PickedEntity): Promise<void> {
  const flow = page.locator('dialog-data-entry-flow');
  const picker = flow.locator('ha-selector-entity').filter({ hasText: label });
  await picker.locator('ha-picker-field').last().click();
  const popup = picker.locator('wa-popover');
  await popup.getByRole('textbox').fill(entityId, { timeout: TIMEOUT });
  // Options are scoped by element tag: their text is slotted, so it is not
  // inside the listitem role in the DOM.
  const option = popup.locator('ha-combo-box-item').filter({ has: page.getByText(friendlyName, { exact: true }) });
  await option.first().waitFor({ timeout: TIMEOUT });
  const count = await option.count();
  if (count !== 1) {
    throw new Error(`entity picker "${label}": ${count} options named "${friendlyName}" for ${entityId}, expected 1`);
  }
  await option.click();
  await popup.waitFor({ state: 'hidden', timeout: TIMEOUT });
}

// In the options flow menu: Edit a room, pick the room, Submit, set each
// entity field given (by label start), Submit. The flow returns to its menu.
export async function setRoomEntitiesInOptionsFlow(
  page: Page,
  roomName: string,
  entities: PickedEntity[],
): Promise<void> {
  const flow = page.locator('dialog-data-entry-flow');
  await flow.getByText('Edit a room', { exact: true }).click();
  await flow.getByRole('radio', { name: roomName, exact: true }).click({ timeout: TIMEOUT });
  await flow.getByRole('button', { name: 'Submit' }).click();
  await flow.getByText(`Edit Room \u2014 ${roomName}`, { exact: true }).waitFor({ timeout: TIMEOUT });
  for (const entity of entities) {
    await pickEntity(page, entity);
  }
  await flow.getByRole('button', { name: 'Submit' }).click();
  await flow.getByText('Edit a room', { exact: true }).waitFor({ timeout: TIMEOUT });
}

// In the options flow menu: Global settings, pick the house occupancy entity,
// Submit. The other fields keep the values the form shows. The flow returns
// to its menu.
export async function setHouseOccupancyInOptionsFlow(page: Page, entityId: string, friendlyName: string): Promise<void> {
  const flow = page.locator('dialog-data-entry-flow');
  await flow.getByText('Global settings', { exact: true }).click();
  await pickEntity(page, { label: 'House occupancy entity', entityId, friendlyName });
  await flow.getByRole('button', { name: 'Submit' }).click();
  await flow.getByText('Global settings', { exact: true }).waitFor({ timeout: TIMEOUT });
}
