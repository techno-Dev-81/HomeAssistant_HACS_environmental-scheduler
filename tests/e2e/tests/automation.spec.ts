import { test, expect } from '../helpers/fixtures';
import { HaWs, EventSubscription } from '../helpers/ha-ws';
import { blockWindow } from '../helpers/time-window';

// Automation author scenarios (tasks amendment 001.1, scenarios 1 to 9 and 11),
// through the WebSocket API (spec 002 R10a). Each test clears the day it uses
// first, and puts back any baseline state it changes (plan 002 section 2).

type Json = Record<string, any>;

const DOMAIN = 'environmental_scheduler';
const BLOCK_CHANGED = `${DOMAIN}.block_changed`;
const HEATING = 'e2e_heating';
const FOLLOWER = 'e2e_follower';
const OCCUPANCY_ENTITY = 'input_boolean.e2e_house_occupied';

// The weekday names HA uses (strftime('%A').lower()), indexed by Date.getDay().
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Today's day name and a block window covering now, from the same clock reading.
function todayWindow(): { day: string; start: string; end: string } {
  const now = new Date();
  return { day: WEEKDAYS[now.getDay()], ...blockWindow(now) };
}

// The schedule a call acts on: the house, or a room's own stored blocks.
type Schedule = { schedule: 'house' } | { schedule: 'room'; room: string };

const HOUSE: Schedule = { schedule: 'house' };
function own(room: string): Schedule {
  return { schedule: 'room', room };
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

async function commitBlock(ha: HaWs, service: string, data: Json): Promise<Json> {
  const response = await call(ha, service, data);
  expect(response.status, `${service} status`).toBe('ok');
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
    .poll(async () => stateOf(ha, OCCUPANCY_ENTITY), { message: `${OCCUPANCY_ENTITY} state`, timeout: 15_000 })
    .toBe(on ? 'on' : 'off');
}

// Waits for the block_changed event of the given action on the given block,
// and returns its data.
async function eventFor(events: EventSubscription, blockId: string, action: string): Promise<Json> {
  const find = () =>
    (events.events as Json[]).find((e) => e.data?.block?.id === blockId && e.data?.action === action);
  await expect
    .poll(() => find() !== undefined, { message: `block_changed "${action}" for ${blockId}`, timeout: 15_000 })
    .toBe(true);
  return (find() as Json).data as Json;
}

test('1. Automation author: when I add a block to the house schedule, I should see the block in the house schedule, and a change notification saying it was the house schedule (no room)', async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, HOUSE, day);
    const events = await ha.subscribeEvents(BLOCK_CHANGED);
    try {
      const block = await commitBlock(ha, 'commit_block', {
        ...HOUSE,
        day,
        start_time: start,
        end_time: end,
        temperature: 19,
      });

      expect((await dayBlocks(ha, HOUSE, day)).map((b) => b.id), 'house schedule blocks').toEqual([block.id]);

      const data = await eventFor(events, block.id, 'created');
      expect(data.schedule, 'event schedule').toBe('house');
      expect(data, 'event has a room key').toHaveProperty('room');
      expect(data.room, 'event room').toBeNull();
      expect(data.day, 'event day').toBe(day);
    } finally {
      await events.unsubscribe();
    }
  } finally {
    ha.close();
  }
});

test('2. Automation author: when I force-add, switch off, switch on and delete a house block, I should see each action applied to the house schedule', async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, HOUSE, day);

    const block = await commitBlock(ha, 'commit_block_force', {
      ...HOUSE,
      day,
      start_time: start,
      end_time: end,
      temperature: 19.5,
    });
    let blocks = await dayBlocks(ha, HOUSE, day);
    expect(blocks.map((b) => b.id), 'house blocks after force-add').toEqual([block.id]);
    expect(blocks[0].enabled, 'enabled after force-add').toBe(true);

    await call(ha, 'toggle_block', { ...HOUSE, day, block_id: block.id, enabled: false });
    blocks = await dayBlocks(ha, HOUSE, day);
    expect(blocks.map((b) => b.id), 'house blocks after switch off').toEqual([block.id]);
    expect(blocks[0].enabled, 'enabled after switch off').toBe(false);

    await call(ha, 'toggle_block', { ...HOUSE, day, block_id: block.id, enabled: true });
    blocks = await dayBlocks(ha, HOUSE, day);
    expect(blocks.map((b) => b.id), 'house blocks after switch on').toEqual([block.id]);
    expect(blocks[0].enabled, 'enabled after switch on').toBe(true);

    await call(ha, 'delete_block', { ...HOUSE, day, block_id: block.id });
    expect(await dayBlocks(ha, HOUSE, day), 'house blocks after delete').toEqual([]);
  } finally {
    ha.close();
  }
});

test("3. Automation author: when I change a block in a room's schedule, I should see a change notification naming the room and saying it was the room's schedule", async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, own(HEATING), day);
    const block = await commitBlock(ha, 'commit_block', {
      room: HEATING,
      day,
      start_time: start,
      end_time: end,
      temperature: 18,
    });

    const events = await ha.subscribeEvents(BLOCK_CHANGED);
    try {
      await commitBlock(ha, 'commit_block', {
        room: HEATING,
        day,
        block_id: block.id,
        start_time: start,
        end_time: end,
        temperature: 20,
      });

      const data = await eventFor(events, block.id, 'updated');
      expect(data.room, 'event room').toBe(HEATING);
      expect(data.schedule, 'event schedule').toBe('room');
      expect(data.day, 'event day').toBe(day);
      expect(data.block.temperature, 'event block temperature').toBe(20);
    } finally {
      await events.unsubscribe();
    }
  } finally {
    ha.close();
  }
});

test('4. Automation author: when I change a block without saying which room, or the house, I should see a clear error saying a room or the house schedule is needed', async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    let message = '';
    try {
      await ha.callServiceWithResponse(DOMAIN, 'commit_block', {
        day,
        start_time: start,
        end_time: end,
        temperature: 19,
      });
    } catch (err) {
      message = (err as Error).message;
    }
    console.log(`error without room or house: ${message}`);
    expect(message, 'an error is returned').not.toBe('');
    expect(message, 'error names the room').toMatch(/room/i);
    expect(message, 'error names the house schedule').toMatch(/house/i);
  } finally {
    ha.close();
  }
});

test('5. Automation author: when I ask for the house schedule, I should see the house blocks, marked as the house with no room', async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, HOUSE, day);
    const block = await commitBlock(ha, 'commit_block', {
      ...HOUSE,
      day,
      start_time: start,
      end_time: end,
      temperature: 20.5,
    });

    const response = await call(ha, 'get_blocks', { ...HOUSE });
    expect(response, 'response has a room key').toHaveProperty('room');
    expect(response.room, 'room').toBeNull();
    expect(response.house, 'house').toBe(true);
    expect((response.schedule[day] as Json[]).map((b) => b.id), `house blocks on ${day}`).toEqual([block.id]);
  } finally {
    ha.close();
  }
});

test("6. Automation author: when I ask for a room that follows the house schedule, then ask for that room's own schedule, then ask for its upcoming blocks, I should see first the house blocks, marked as following the house; then the room's own blocks; then upcoming blocks marked as following the house", async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, HOUSE, day);
    await clearDay(ha, own(FOLLOWER), day);
    const houseBlock = await commitBlock(ha, 'commit_block', {
      ...HOUSE,
      day,
      start_time: start,
      end_time: end,
      temperature: 21,
    });
    const ownBlock = await commitBlock(ha, 'commit_block', {
      ...own(FOLLOWER),
      day,
      start_time: start,
      end_time: end,
      temperature: 16,
    });

    const followed = await call(ha, 'get_blocks', { room: FOLLOWER, day });
    expect(followed.blocks.map((b: Json) => b.id), 'blocks of the following room').toEqual([houseBlock.id]);
    expect(followed.following_house, 'following_house').toBe(true);

    const ownSchedule = await call(ha, 'get_blocks', { ...own(FOLLOWER), day });
    expect(ownSchedule.blocks.map((b: Json) => b.id), "the room's own blocks").toEqual([ownBlock.id]);
    expect(ownSchedule.following_house, 'following_house with schedule room').toBe(true);

    const upcoming = await call(ha, 'get_upcoming_blocks', { room: FOLLOWER });
    expect(upcoming.following_house, 'upcoming following_house').toBe(true);
    expect(upcoming.upcoming.length, 'upcoming blocks').toBeGreaterThan(0);
    expect(upcoming.upcoming[0].block.id, 'first upcoming block').toBe(houseBlock.id);
    expect(
      (upcoming.upcoming as Json[]).map((u) => u.block.id),
      'upcoming does not hold the own block',
    ).not.toContain(ownBlock.id);
  } finally {
    ha.close();
  }
});

test("7. Automation author: when I change the own schedule of a room that follows the house, I should see the room's own blocks change, and the house schedule does not", async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, HOUSE, day);
    await clearDay(ha, own(FOLLOWER), day);
    await commitBlock(ha, 'commit_block', {
      ...HOUSE,
      day,
      start_time: start,
      end_time: end,
      temperature: 21,
    });
    const houseBefore = await dayBlocks(ha, HOUSE, day);

    const block = await commitBlock(ha, 'commit_block', {
      room: FOLLOWER,
      day,
      start_time: start,
      end_time: end,
      temperature: 17,
    });

    const ownAfter = await dayBlocks(ha, own(FOLLOWER), day);
    expect(ownAfter.map((b) => b.id), "the room's own blocks").toEqual([block.id]);
    expect(ownAfter[0].temperature, 'own block temperature').toBe(17);
    expect(await dayBlocks(ha, HOUSE, day), 'house schedule unchanged').toEqual(houseBefore);
  } finally {
    ha.close();
  }
});

test('8. Automation author: when I copy a day that has a block with a "house occupied" temperature, I should see the copied blocks keep the "house occupied" temperature', async () => {
  const ha = await HaWs.connect();
  try {
    const now = new Date();
    const sourceDay = WEEKDAYS[now.getDay()];
    const targetDay = WEEKDAYS[(now.getDay() + 1) % 7];
    await clearDay(ha, own(HEATING), sourceDay);
    await clearDay(ha, own(HEATING), targetDay);
    await commitBlock(ha, 'commit_block', {
      room: HEATING,
      day: sourceDay,
      start_time: '07:00',
      end_time: '08:00',
      temperature: 18,
      occupied_temperature: 21.5,
    });

    const response = await call(ha, 'copy_day', { room: HEATING, source_day: sourceDay, target_days: [targetDay] });
    expect(response.status, 'copy_day status').toBe('ok');

    const copied = await dayBlocks(ha, own(HEATING), targetDay);
    expect(copied.length, `blocks copied to ${targetDay}`).toBe(1);
    expect(copied[0], 'copied block').toMatchObject({
      start_time: '07:00',
      end_time: '08:00',
      temperature: 18,
      occupied_temperature: 21.5,
    });
  } finally {
    ha.close();
  }
});

test('9. Automation author: when I switch a room\'s "follow house schedule" on or off, sending nothing else, I should see the room\'s devices, sensors and people unchanged', async () => {
  const ha = await HaWs.connect();
  try {
    const before = await room(ha, HEATING);
    expect(before.follow_house_schedule, 'baseline follow').toBe(false);

    await call(ha, 'update_room', { room: HEATING, follow_house_schedule: true });
    const on = await room(ha, HEATING);
    expect(on.follow_house_schedule, 'follow after switching on').toBe(true);
    expect(withoutFollow(on), 'room after switching on').toEqual(withoutFollow(before));

    await call(ha, 'update_room', { room: HEATING, follow_house_schedule: false });
    const off = await room(ha, HEATING);
    expect(off.follow_house_schedule, 'follow after switching off').toBe(false);
    expect(withoutFollow(off), 'room after switching off').toEqual(withoutFollow(before));
  } finally {
    try {
      await call(ha, 'update_room', { room: HEATING, follow_house_schedule: false });
    } finally {
      ha.close();
    }
  }
});

test('11. Automation author: when I ask for the current block while the house is occupied and the block has a "house occupied" temperature, I should see the occupied temperature, with the reason "schedule (occupied)"', async () => {
  const ha = await HaWs.connect();
  try {
    const { day, start, end } = todayWindow();
    await clearDay(ha, own(HEATING), day);
    const block = await commitBlock(ha, 'commit_block', {
      room: HEATING,
      day,
      start_time: start,
      end_time: end,
      temperature: 18,
      occupied_temperature: 22,
    });

    await setOccupied(ha, true);

    const active = await call(ha, 'get_active_block', { room: HEATING });
    expect(active.active_block?.id, 'active block').toBe(block.id);
    expect(active.target_temperature, 'target temperature').toBe(22);
    expect(active.reason, 'reason').toBe('schedule_occupied');
  } finally {
    try {
      await setOccupied(ha, false);
    } finally {
      ha.close();
    }
  }
});
