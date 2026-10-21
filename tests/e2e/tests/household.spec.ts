import { Locator, Page } from '@playwright/test';
import { test, expect } from '../helpers/fixtures';
import { HaWs } from '../helpers/ha-ws';
import { login } from '../helpers/login';
import { blockWindow } from '../helpers/time-window';

// Household user scenarios (tasks amendment 001.1, scenarios 13 to 18), in the
// browser on the e2e-test dashboard (spec 002 R10a): the schedule editor card
// and the room config card. Setup (clearing the day used, seeding blocks,
// house occupancy) uses the WebSocket API before the page opens, and stored
// values are read back through the API after each browser action. Each test
// puts back any baseline state it changes, pass or fail (plan 002 section 2).

type Json = Record<string, any>;

const DOMAIN = 'environmental_scheduler';
const DASHBOARD = 'e2e-test';
const HEATING = 'e2e_heating';
const HEATING_NAME = 'e2e-heating';
const HOT_WATER = 'e2e_hot_water';
const HOT_WATER_NAME = 'e2e-hot-water';
const FOLLOWER = 'e2e_follower';
const FOLLOWER_NAME = 'e2e-follower';
const OCCUPANCY_ENTITY = 'input_boolean.e2e_house_occupied';
const TIMEOUT = 15_000;

// The weekday names HA uses (strftime('%A').lower()), indexed by Date.getDay().
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function today(): string {
  return WEEKDAYS[new Date().getDay()];
}

// Today's day name and a block window covering now, from the same clock reading.
function todayWindow(): { day: string; start: string; end: string } {
  const now = new Date();
  return { day: WEEKDAYS[now.getDay()], ...blockWindow(now) };
}

// The schedule a call acts on: the house, or a room's own stored blocks.
type Schedule = { schedule: 'house' } | { schedule: 'room'; room: string };

const HOUSE: Schedule = { schedule: 'house' };
function own(roomId: string): Schedule {
  return { schedule: 'room', room: roomId };
}

async function call(ha: HaWs, service: string, data: Json = {}): Promise<Json> {
  const result = await ha.callServiceWithResponse(DOMAIN, service, data);
  return result.response as Json;
}

async function dayBlocks(ha: HaWs, schedule: Schedule, day: string): Promise<Json[]> {
  const response = await call(ha, 'get_blocks', { ...schedule, day });
  return response.blocks as Json[];
}

async function clearDay(ha: HaWs, schedule: Schedule, day: string): Promise<void> {
  for (const block of await dayBlocks(ha, schedule, day)) {
    await call(ha, 'delete_block', { ...schedule, day, block_id: block.id });
  }
  expect(await dayBlocks(ha, schedule, day), `${JSON.stringify(schedule)} ${day} cleared`).toEqual([]);
}

async function commitBlock(ha: HaWs, data: Json): Promise<Json> {
  const response = await call(ha, 'commit_block', data);
  expect(response.status, 'commit_block status').toBe('ok');
  return response.block as Json;
}

async function room(ha: HaWs, roomId: string): Promise<Json> {
  const response = await call(ha, 'get_rooms');
  const found = (response.rooms as Json[]).find((r) => r.id === roomId);
  expect(found, `room ${roomId}`).toBeDefined();
  return found as Json;
}

function withoutFollow(r: Json): Json {
  const { follow_house_schedule: _follow, ...rest } = r;
  return rest;
}

async function stateOf(ha: HaWs, entityId: string): Promise<string | undefined> {
  const states = await ha.getStates();
  return (states.find((s) => s.entity_id === entityId) as Json | undefined)?.state;
}

async function setOccupied(ha: HaWs, on: boolean): Promise<void> {
  await ha.command('call_service', {
    domain: 'input_boolean',
    service: on ? 'turn_on' : 'turn_off',
    target: { entity_id: OCCUPANCY_ENTITY },
  });
  await expect
    .poll(async () => stateOf(ha, OCCUPANCY_ENTITY), { message: `${OCCUPANCY_ENTITY} state`, timeout: TIMEOUT })
    .toBe(on ? 'on' : 'off');
}

// Logs in and opens the e2e-test dashboard.
async function openDashboard(page: Page): Promise<void> {
  await login(page);
  await page.goto(new URL(`/${DASHBOARD}/0`, process.env.HA_URL).toString());
}

// The schedule editor card. Every query is scoped to it, because the overview
// cards on the same dashboard show similar labels.
function editor(page: Page): Locator {
  return page.locator('environmental-scheduler-card');
}

// In the schedule editor: pick an entry (House or a room name) in its picker.
async function pick(page: Page, label: string): Promise<void> {
  await editor(page).getByRole('combobox').selectOption({ label }, { timeout: TIMEOUT });
}

// The open block dialog of the schedule editor.
function blockDialog(page: Page): Locator {
  return editor(page).locator('.dlg');
}

// The Temperature and "If house occupied" fields sit inside labels that also
// hold the stepper buttons, so they are matched by the start of their name.
function temperatureField(page: Page): Locator {
  return blockDialog(page).getByRole('spinbutton', { name: /^Temperature/ });
}

function occupiedField(page: Page): Locator {
  return blockDialog(page).getByRole('spinbutton', { name: /^If house occupied/ });
}

// In the schedule editor: click an empty spot on a day's track, which opens
// the Add Block dialog, then set the times and temperature. The card
// re-renders every 30 s from its saved state, so the fields are filled and
// saved with no other step in between.
async function openAddBlock(page: Page, day: string): Promise<void> {
  await editor(page).locator(`.day-track[data-day="${day}"]`).click({ position: { x: 5, y: 5 }, timeout: TIMEOUT });
  await expect(blockDialog(page).getByText(/^Add Block/), 'Add Block dialog').toBeVisible({ timeout: TIMEOUT });
}

// In the schedule editor: click a block bar, which opens the Edit Block dialog.
async function openEditBlock(page: Page, blockId: string): Promise<void> {
  await editor(page).locator(`.block[data-block-id="${blockId}"]`).click({ timeout: TIMEOUT });
  await expect(blockDialog(page).getByText(/^Edit Block/), 'Edit Block dialog').toBeVisible({ timeout: TIMEOUT });
}

async function saveBlock(page: Page): Promise<void> {
  await blockDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(blockDialog(page), 'block dialog closed after Save').toHaveCount(0, { timeout: TIMEOUT });
}

// Polls a day's blocks until exactly one block is stored, and returns it.
async function onlyBlock(ha: HaWs, schedule: Schedule, day: string, message: string): Promise<Json> {
  await expect
    .poll(async () => (await dayBlocks(ha, schedule, day)).length, { message, timeout: TIMEOUT })
    .toBe(1);
  return (await dayBlocks(ha, schedule, day))[0];
}

async function failureSnapshot(page: Page): Promise<void> {
  console.log(`page at failure:\n${await page.locator('home-assistant').ariaSnapshot().catch(() => 'none')}`);
}

test('13. Household user: when I pick House in the schedule editor card, I should see I can add and edit house blocks', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const day = today();
    await clearDay(ha, HOUSE, day);

    await openDashboard(page);
    await pick(page, 'House');

    // Add a house block.
    await openAddBlock(page, day);
    await blockDialog(page).getByLabel('Start time').fill('07:00');
    await blockDialog(page).getByLabel('End time').fill('08:00');
    await temperatureField(page).fill('19');
    await saveBlock(page);

    const added = await onlyBlock(ha, HOUSE, day, 'house block added');
    expect(added, 'added house block').toMatchObject({ start_time: '07:00', end_time: '08:00', temperature: 19 });

    // Edit it.
    await openEditBlock(page, String(added.id));
    await temperatureField(page).fill('20.5');
    await saveBlock(page);

    await expect
      .poll(async () => (await dayBlocks(ha, HOUSE, day)).map((b) => [b.id, b.temperature]), {
        message: 'house block edited',
        timeout: TIMEOUT,
      })
      .toEqual([[added.id, 20.5]]);
  } catch (err) {
    await failureSnapshot(page);
    throw err;
  } finally {
    ha.close();
  }
});

test('14. Household user: when I set a "house occupied" temperature on a block, reopen the block, then clear it, I should see it saves, shows again on reopen, and clears', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const day = today();
    await clearDay(ha, own(HEATING), day);

    await openDashboard(page);
    await pick(page, HEATING_NAME);

    // Set: a new block with a "house occupied" temperature.
    await openAddBlock(page, day);
    await blockDialog(page).getByLabel('Start time').fill('07:00');
    await blockDialog(page).getByLabel('End time').fill('08:00');
    await temperatureField(page).fill('18');
    await occupiedField(page).fill('21');
    await saveBlock(page);

    const saved = await onlyBlock(ha, own(HEATING), day, 'block saved');
    expect(saved, 'saved block').toMatchObject({ temperature: 18, occupied_temperature: 21 });

    // Reopen: the field shows the saved value.
    await openEditBlock(page, String(saved.id));
    await expect(occupiedField(page), '"If house occupied" on reopen').toHaveValue('21');

    // Clear.
    await blockDialog(page).getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(occupiedField(page), '"If house occupied" after Clear').toHaveValue('');
    await saveBlock(page);

    await expect
      .poll(async () => (await dayBlocks(ha, own(HEATING), day)).map((b) => [b.id, b.occupied_temperature]), {
        message: '"house occupied" temperature cleared',
        timeout: TIMEOUT,
      })
      .toEqual([[saved.id, null]]);
  } catch (err) {
    await failureSnapshot(page);
    throw err;
  } finally {
    ha.close();
  }
});

test('15. Household user: when I open a room that follows the house schedule, I should see the house blocks, read-only, with "Following house schedule"', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const day = today();
    await clearDay(ha, HOUSE, day);
    await clearDay(ha, own(FOLLOWER), day);
    const houseBlock = await commitBlock(ha, {
      ...HOUSE,
      day,
      start_time: '07:00',
      end_time: '08:00',
      temperature: 21,
    });

    await openDashboard(page);
    await pick(page, FOLLOWER_NAME);

    await expect(editor(page).getByText('Following house schedule', { exact: true }), 'following line').toBeVisible({
      timeout: TIMEOUT,
    });
    const track = editor(page).locator(`.day-track[data-day="${day}"]`);
    const bar = track.locator('.block');
    await expect(bar, `blocks shown on ${day}`).toHaveCount(1, { timeout: TIMEOUT });
    await expect(bar, 'the house block is shown').toHaveAttribute('data-block-id', String(houseBlock.id));

    // Read-only: neither the block nor the track opens a dialog.
    await bar.click();
    await expect(editor(page).locator('.dlg'), 'no dialog after clicking the block').toHaveCount(0);
    await track.click({ position: { x: 5, y: 5 } });
    await expect(editor(page).locator('.dlg'), 'no dialog after clicking the day').toHaveCount(0);

    expect((await dayBlocks(ha, HOUSE, day)).map((b) => b.id), 'house blocks unchanged').toEqual([houseBlock.id]);
  } catch (err) {
    await failureSnapshot(page);
    throw err;
  } finally {
    ha.close();
  }
});

test('16. Household user: when I look at the status while the house is occupied, I should see "schedule (occupied)"', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, own(HEATING), day);
    await commitBlock(ha, {
      room: HEATING,
      day,
      start_time: start,
      end_time: end,
      temperature: 18,
      occupied_temperature: 22,
    });
    await setOccupied(ha, true);

    await openDashboard(page);
    await pick(page, HEATING_NAME);

    const status = editor(page).locator('.status-bar').first();
    await expect(status.locator('.s-reason'), 'status reason').toHaveText('schedule (occupied)', { timeout: TIMEOUT });
    await expect(status.locator('.s-temp'), 'status temperature').toHaveText('22°C');
  } catch (err) {
    await failureSnapshot(page);
    throw err;
  } finally {
    try {
      await setOccupied(ha, false);
    } finally {
      ha.close();
    }
  }
});

test('17. Household user: when I pick House in the schedule editor, I should see the status line shows the house\'s current block, or "No active block", and a badge shows the house mode', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, HOUSE, day);
    const houseMode = String((await call(ha, 'get_house_status')).house_mode);
    console.log(`house mode: ${houseMode}`);

    await openDashboard(page);
    await pick(page, 'House');

    const status = editor(page).locator('.status-bar').first();
    const badge = editor(page).locator('.mode-badge');

    // No house block now.
    await expect(status.locator('.s-reason'), 'status without a house block').toHaveText('No active block', {
      timeout: TIMEOUT,
    });
    await expect(status.locator('.s-temp'), 'no temperature without a house block').toHaveCount(0);
    expect((await badge.innerText()).trim().toLowerCase(), 'badge shows the house mode').toBe(houseMode);

    // A house block covering now.
    await commitBlock(ha, { ...HOUSE, day, start_time: start, end_time: end, temperature: 21.5 });
    await page.reload();
    await pick(page, 'House');

    await expect(status.locator('.s-temp'), 'status temperature of the house block').toHaveText('21.5°C', {
      timeout: TIMEOUT,
    });
    await expect(status.locator('.s-reason'), 'status times of the house block').toHaveText(`${start}–${end}`);
    expect((await badge.innerText()).trim().toLowerCase(), 'badge shows the house mode').toBe(houseMode);
  } catch (err) {
    await failureSnapshot(page);
    throw err;
  } finally {
    ha.close();
  }
});

test('18. Household user: when I switch on "follow house schedule" for a heating room and for hot water in the room config card, and save, I should see the switch saved, and the room\'s other settings unchanged', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const rooms = [
      { id: HEATING, name: HEATING_NAME },
      { id: HOT_WATER, name: HOT_WATER_NAME },
    ];
    const before = new Map<string, Json>();
    for (const r of rooms) {
      const stored = await room(ha, r.id);
      expect(stored.follow_house_schedule, `${r.id} baseline follow`).toBe(false);
      before.set(r.id, stored);
    }

    await openDashboard(page);
    const card = page.locator('environmental-scheduler-room-config-card');

    for (const r of rooms) {
      await card.locator('.room-item').filter({ hasText: r.name }).click({ timeout: TIMEOUT });
      await expect(card.locator('.detail-title'), 'room opened').toHaveText(r.name, { timeout: TIMEOUT });
      const follow = card.getByRole('checkbox', { name: 'Follow house schedule' });
      await expect(follow, `${r.id} follow switch before`).not.toBeChecked();
      await follow.check();
      await card.getByRole('button', { name: 'Save', exact: true }).click();

      await expect
        .poll(async () => (await room(ha, r.id)).follow_house_schedule, {
          message: `${r.id} follow saved`,
          timeout: TIMEOUT,
        })
        .toBe(true);
      expect(withoutFollow(await room(ha, r.id)), `${r.id} other settings`).toEqual(withoutFollow(before.get(r.id)!));
    }
  } catch (err) {
    await failureSnapshot(page);
    throw err;
  } finally {
    try {
      try {
        await call(ha, 'update_room', { room: HEATING, follow_house_schedule: false });
      } finally {
        await call(ha, 'update_room', { room: HOT_WATER, follow_house_schedule: false });
      }
    } finally {
      ha.close();
    }
  }
});
