import { test, expect } from '../helpers/fixtures';
import { HaWs } from '../helpers/ha-ws';
import { login } from '../helpers/login';
import { addIntegration, openDevicesAndServices, removeIntegration } from '../helpers/integration-ui';

// Fresh start: serial setup tests, run in file order (R6a, R7, R7a).
test.describe.configure({ mode: 'serial' });

type Json = Record<string, any>;

const INPUT_BOOLEANS = ['e2e_house_occupied', 'e2e_hot_water'];
const TARGET_NUMBER = 'e2e_target_temp';
const THERMOSTAT_NAME = 'e2e_thermostat';

const EXPECTED_ENTITIES = [
  'input_boolean.e2e_house_occupied',
  'input_boolean.e2e_hot_water',
  'input_number.e2e_target_temp',
  'climate.e2e_thermostat',
];

const OLD_ENTITIES = ['input_boolean.e2e_heater', 'input_number.e2e_room_temp', 'sensor.e2e_room_temperature'];

function isE2e(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('e2e_');
}

function menuOptions(step: Json): string[] {
  const m = step.menu_options;
  return Array.isArray(m) ? m : Object.keys(m ?? {});
}

function describeStep(step: Json): string {
  const fields = (step.data_schema ?? []).map((f: Json) => `${f.name}${f.required ? '*' : ''}`);
  return `step "${step.step_id}" type "${step.type}" fields [${fields.join(', ')}] menu [${menuOptions(step).join(', ')}] errors ${JSON.stringify(step.errors ?? {})}`;
}

// Builds user input for a form step from its data_schema: known fields get the
// given value and optional fields not given stay unset. Every required field
// must be given by the test (no flow default is used); otherwise the flow does
// not match this HA version and the setup stops naming the step and field.
function formInput(handler: string, step: Json, values: Json): Json {
  const schema: Json[] = step.data_schema ?? [];
  const input: Json = {};
  for (const field of schema) {
    if (field.name in values) {
      input[field.name] = values[field.name];
    } else if (field.required) {
      throw new Error(`${handler} flow: no value for required field "${field.name}" in ${describeStep(step)}`);
    }
  }
  for (const key of Object.keys(values)) {
    if (!schema.some((f) => f.name === key)) {
      throw new Error(`${handler} flow: field "${key}" not offered in ${describeStep(step)}`);
    }
  }
  return input;
}

async function deleteLeftovers(ha: HaWs): Promise<void> {
  const registry: Json[] = await ha.command('config/entity_registry/list');
  for (const entry of (await ha.listConfigEntries('template')) as Json[]) {
    const entities = registry.filter((e) => e.config_entry_id === entry.entry_id);
    const hasE2eEntity = entities.some((e) => isE2e(String(e.entity_id).split('.')[1]));
    if (isE2e(entry.title) || hasE2eEntity) {
      await ha.deleteConfigEntry(entry.entry_id);
    }
  }

  for (const domain of ['input_boolean', 'input_number', 'input_select'] as const) {
    for (const helper of await ha.listHelpers(domain)) {
      if (isE2e(helper.id)) {
        await ha.deleteHelper(domain, helper.id as string);
      }
    }
  }
}

async function createThermostat(ha: HaWs): Promise<void> {
  let step: Json = await ha.startConfigFlow('template');
  console.log(`template flow: ${describeStep(step)}`);
  if (step.type !== 'menu' || !menuOptions(step).includes('climate')) {
    throw new Error(`template flow: expected a menu offering "climate", got ${describeStep(step)}`);
  }
  step = await ha.configFlowStep(step.flow_id, { next_step_id: 'climate' });
  console.log(`template flow: ${describeStep(step)}`);
  if (step.type !== 'form') {
    throw new Error(`template flow: expected the climate form, got ${describeStep(step)}`);
  }
  // No hvac_mode template: the climate holds its own mode, so set_hvac_mode
  // has nothing to do. The target is read from and written to the input_number.
  step = await ha.configFlowStep(
    step.flow_id,
    formInput('template', step, {
      name: THERMOSTAT_NAME,
      hvac_modes: "{{ ['heat', 'auto', 'off'] }}",
      set_hvac_mode: [],
      target_temperature: "{{ states('input_number.e2e_target_temp') | float }}",
      set_temperature: [
        {
          action: 'input_number.set_value',
          target: { entity_id: 'input_number.e2e_target_temp' },
          data: { value: '{{ temperature }}' },
        },
      ],
    }),
  );
  console.log(`template flow: ${describeStep(step)}`);
  if (step.type !== 'create_entry') {
    throw new Error(`template flow: expected create_entry, got ${describeStep(step)}`);
  }
}

async function entityState(ha: HaWs, entityId: string): Promise<Json | undefined> {
  const states = await ha.getStates();
  return states.find((s) => s.entity_id === entityId) as Json | undefined;
}

async function stateOf(ha: HaWs, entityId: string): Promise<string | undefined> {
  return (await entityState(ha, entityId))?.state;
}

test('simulated devices', async () => {
  const ha = await HaWs.connect();
  try {
    await deleteLeftovers(ha);

    for (const name of INPUT_BOOLEANS) {
      await ha.createHelper('input_boolean', { name });
    }
    await ha.createHelper('input_number', { name: TARGET_NUMBER, min: 5, max: 35, step: 0.5 });

    await createThermostat(ha);

    await expect
      .poll(async () => stateOf(ha, 'climate.e2e_thermostat'), { timeout: 15_000 })
      .not.toBeUndefined();
    console.log(`climate.e2e_thermostat before set_hvac_mode: ${await stateOf(ha, 'climate.e2e_thermostat')}`);

    await ha.command('call_service', {
      domain: 'climate',
      service: 'set_hvac_mode',
      service_data: { hvac_mode: 'heat' },
      target: { entity_id: 'climate.e2e_thermostat' },
    });

    for (const entityId of EXPECTED_ENTITIES) {
      await expect
        .poll(async () => stateOf(ha, entityId), { message: `${entityId} exists`, timeout: 15_000 })
        .not.toBeUndefined();
    }
    await expect
      .poll(async () => stateOf(ha, 'climate.e2e_thermostat'), { timeout: 15_000 })
      .toBe('heat');
    console.log(`climate.e2e_thermostat after set_hvac_mode: ${await stateOf(ha, 'climate.e2e_thermostat')}`);

    // No duplicate (`_2` and so on) of a created id, and no device from
    // before amendment 002.2, is left.
    const ids = (await ha.getStates()).map((st) => String(st.entity_id));
    const duplicates = ids.filter((id) => EXPECTED_ENTITIES.some((e) => new RegExp(`^${e.replace('.', '\\.')}_\\d+$`).test(id)));
    expect(duplicates, 'duplicate e2e entity ids').toEqual([]);
    const old = ids.filter((id) => OLD_ENTITIES.includes(id));
    expect(old, 'old e2e entity ids').toEqual([]);

    const climate = await entityState(ha, 'climate.e2e_thermostat');
    expect(climate?.attributes?.hvac_modes).toEqual(expect.arrayContaining(['heat', 'auto', 'off']));

    await ha.command('call_service', {
      domain: 'climate',
      service: 'set_temperature',
      service_data: { temperature: 21 },
      target: { entity_id: 'climate.e2e_thermostat' },
    });
    await expect
      .poll(async () => (await entityState(ha, 'climate.e2e_thermostat'))?.attributes?.temperature, {
        message: 'climate.e2e_thermostat target follows set_temperature',
        timeout: 15_000,
      })
      .toBe(21);
  } finally {
    ha.close();
  }
});

// R7a: the four card files the integration serves, and the path tail that
// identifies each file under any other prefix.
const CARD_RESOURCES = [
  { url: '/environmental_scheduler/static/environmental-scheduler-card.js', tail: 'environmental-scheduler-card.js' },
  { url: '/environmental_scheduler/static/environmental-scheduler-room-config-card.js', tail: 'environmental-scheduler-room-config-card.js' },
  { url: '/environmental_scheduler/static/environmental-scheduler-overview-card.js', tail: 'environmental-scheduler-overview-card.js' },
  { url: '/environmental_scheduler/static/skins/lcars/overview-card.js', tail: 'skins/lcars/overview-card.js' },
];

// The url_path and title can be extended per test suite (for example
// "E2E Test - <suite>") if more test dashboards are needed later.
const DASHBOARD = 'e2e-test';
const DASHBOARD_TITLE = 'E2E Test';

const CARD_TYPES = [
  'environmental-scheduler-card',
  'environmental-scheduler-room-config-card',
  'environmental-scheduler-overview-card',
  'environmental-scheduler-overview-card-lcars',
];

// A resource URL without its query (so `?v=` is ignored), as a path.
function resourcePath(url: string): string {
  return new URL(url, 'http://resource.invalid').pathname;
}

test('card resources and dashboard', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const resources = (await ha.listResources()) as Json[];
    console.log(`lovelace resources: ${resources.length} listed`);

    // Stop before adding anything if a card file is registered under another prefix.
    const duplicates: string[] = [];
    for (const { url, tail } of CARD_RESOURCES) {
      for (const r of resources) {
        const path = resourcePath(String(r.url));
        if (path !== url && path.endsWith(tail)) {
          duplicates.push(String(r.url));
        }
      }
    }
    if (duplicates.length > 0) {
      throw new Error(`card resource registered under another address: ${duplicates.join(', ')}`);
    }

    // Add each missing card resource. No resource is removed.
    for (const { url } of CARD_RESOURCES) {
      if (resources.some((r) => resourcePath(String(r.url)) === url)) {
        console.log(`resource present: ${url}`);
      } else {
        await ha.createResource(url, 'module');
        console.log(`resource created: ${url}`);
      }
    }

    // The e2e-test dashboard: create it if missing, then replace its config.
    // No other dashboard is read or written.
    const dashboards = await ha.listDashboards();
    if (dashboards.some((d) => d.url_path === DASHBOARD)) {
      console.log(`dashboard present: ${DASHBOARD}`);
    } else {
      await ha.createDashboard({ url_path: DASHBOARD, title: DASHBOARD_TITLE });
      console.log(`dashboard created: ${DASHBOARD}`);
    }
    await ha.saveLovelaceConfig(DASHBOARD, {
      views: [{ cards: CARD_TYPES.map((type) => ({ type: `custom:${type}` })) }],
    });
  } finally {
    ha.close();
  }

  // In the browser, the dashboard renders the four card elements.
  await login(page);
  await page.goto(new URL(`/${DASHBOARD}/0`, process.env.HA_URL).toString());
  for (const type of CARD_TYPES) {
    await expect(page.locator(type), `${type} on ${DASHBOARD}`).toHaveCount(1, { timeout: 15_000 });
  }
});

const DOMAIN = 'environmental_scheduler';
const INTEGRATION_NAME = 'Environmental Scheduler';

// const.py DEFAULT_ROOMS: the rooms seeded on an empty store (PB3).
const SEEDED_ROOM_IDS = [
  'hallway',
  'living_room',
  'office',
  'toilet',
  'landing',
  'guest_bedroom',
  'spare_bedroom',
  'bathroom',
  'dressing_room',
  'bedroom',
  'en_suite',
  'open_plan',
];

async function roomIds(ha: HaWs): Promise<string[]> {
  const result = await ha.callServiceWithResponse(DOMAIN, 'get_rooms');
  return (result.response.rooms as Json[]).map((r) => String(r.id));
}

// R5: remove the integration if present and add it again, in the browser.
test('fresh addition', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    await login(page);
    await openDevicesAndServices(page);

    if ((await ha.listConfigEntries(DOMAIN)).length > 0) {
      console.log(`rooms before removal: ${(await roomIds(ha)).join(', ')}`);
      const removeStart = Date.now();
      await removeIntegration(page, INTEGRATION_NAME);
      await expect
        .poll(async () => (await ha.listConfigEntries(DOMAIN)).length, {
          message: `${DOMAIN} config entry removed`,
          timeout: 30_000,
        })
        .toBe(0);
      console.log(`integration removed in ${Date.now() - removeStart} ms`);
      await openDevicesAndServices(page);
    } else {
      console.log('integration not present, nothing to remove');
    }

    const addStart = Date.now();
    await addIntegration(page, INTEGRATION_NAME);
    await expect
      .poll(async () => (await ha.listConfigEntries(DOMAIN)).map((e) => e.state), {
        message: `${DOMAIN} config entry added and loaded`,
        timeout: 30_000,
      })
      .toEqual(['loaded']);
    console.log(`integration added in ${Date.now() - addStart} ms`);

    // R4, PB3: no room from a previous run remains and the defaults are seeded.
    let ids: string[] = [];
    await expect
      .poll(
        async () => {
          ids = await roomIds(ha);
          return ids;
        },
        { message: 'seeded rooms present', timeout: 15_000 },
      )
      .toEqual(expect.arrayContaining(SEEDED_ROOM_IDS));
    console.log(`rooms after addition: ${ids.join(', ')}`);
    expect(ids.filter(isE2e), 'e2e_ rooms after addition').toEqual([]);
  } finally {
    ha.close();
  }
});
