import { test, expect } from '../helpers/fixtures';
import { HaWs } from '../helpers/ha-ws';
import { blockWindow } from '../helpers/time-window';

// Thermostat scenario (spec 002 R8 with amendment 002.2, scenario 22), through
// the WebSocket API (spec 002 R10a), on room e2e_heating. The integration runs
// with node_red_mode false (the default on a fresh add), so its minute tick
// sets the room's climate target. The test clears the day it uses first
// (plan 002 section 2). It changes no baseline state.

type Json = Record<string, any>;

const DOMAIN = 'environmental_scheduler';
const HEATING = 'e2e_heating';
const THERMOSTAT = 'climate.e2e_thermostat';

// The weekday names HA uses (strftime('%A').lower()), indexed by Date.getDay().
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function call(ha: HaWs, service: string, data: Json = {}): Promise<Json> {
  const result = await ha.callServiceWithResponse(DOMAIN, service, data);
  return result.response as Json;
}

async function clearDay(ha: HaWs, day: string): Promise<void> {
  const own = { schedule: 'room', room: HEATING };
  const blocks = async () => ((await call(ha, 'get_blocks', { ...own, day })).blocks as Json[]);
  for (const block of await blocks()) {
    await call(ha, 'delete_block', { ...own, day, block_id: block.id });
  }
  expect(await blocks(), `${HEATING} ${day} cleared`).toEqual([]);
}

async function thermostatTarget(ha: HaWs): Promise<unknown> {
  const states = await ha.getStates();
  return (states.find((s) => s.entity_id === THERMOSTAT) as Json | undefined)?.attributes?.temperature;
}

test("22. Household user: when a block starts in a heating room, I should see the room's thermostat target become the block temperature", async () => {
  const ha = await HaWs.connect();
  try {
    const now = new Date();
    const day = WEEKDAYS[now.getDay()];
    const { start, end } = blockWindow(now, { thermostat: true });
    await clearDay(ha, day);

    // The block temperature differs from the thermostat's current target and
    // from the target the room has with no block, so the change is real.
    const current = await thermostatTarget(ha);
    const withoutBlock = (await call(ha, 'get_active_block', { room: HEATING })).target_temperature;
    const temperature = [19, 20, 21].find((t) => t !== current && t !== withoutBlock) as number;
    console.log(`${THERMOSTAT} target before: ${current}; without a block: ${withoutBlock}; block: ${temperature}`);

    const response = await call(ha, 'commit_block', {
      room: HEATING,
      day,
      start_time: start,
      end_time: end,
      temperature,
    });
    expect(response.status, 'commit_block status').toBe('ok');

    await expect
      .poll(async () => thermostatTarget(ha), {
        message: `${THERMOSTAT} target becomes the block temperature`,
        timeout: 75_000,
        intervals: [2_000],
      })
      .toBe(temperature);
  } finally {
    ha.close();
  }
});
