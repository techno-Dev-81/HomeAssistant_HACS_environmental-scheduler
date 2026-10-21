import { test, expect } from '../helpers/fixtures';
import { HaWs } from '../helpers/ha-ws';
import { login } from '../helpers/login';
import {
  clearHouseOccupancyInOptionsFlow,
  finishOptionsFlow,
  openDevicesAndServices,
  openIntegrationOptions,
  setHouseOccupancyInOptionsFlow,
} from '../helpers/integration-ui';

// Installer scenario (tasks amendment 001.1, scenario 10), in the browser
// options flow (spec 002 R10a). The house occupancy entity is put back to the
// baseline value at the end, pass or fail (plan 002 section 2).

type Json = Record<string, any>;

const DOMAIN = 'environmental_scheduler';
const INTEGRATION_NAME = 'Environmental Scheduler';
const OCCUPANCY_ENTITY = 'input_boolean.e2e_house_occupied';
const HOT_WATER_ENTITY = 'input_boolean.e2e_hot_water';

// On/off entities present on the test instance (the e2e input booleans), and
// entities the picker must not offer (tasks amendment 002.1 T4.2); the
// thermostat mode select only if it was created.
const OFFERED = [OCCUPANCY_ENTITY, HOT_WATER_ENTITY];
const NOT_OFFERED = ['input_number.e2e_target_temp', 'climate.e2e_thermostat'];
const NOT_OFFERED_IF_PRESENT = ['input_select.e2e_thermostat_mode'];

// Other on/off types the picker must offer when the instance has an entity of
// that type (plan 002 section 4).
const OTHER_ON_OFF_DOMAINS = ['switch', 'binary_sensor'];

function friendlyName(states: Json[], entityId: string): string {
  const state = states.find((s) => s.entity_id === entityId);
  return String(state?.attributes?.friendly_name ?? entityId);
}

// No API returns the house occupancy entity, so it is read from the global
// settings form of an options flow opened over REST (the value the form
// shows), and that flow is aborted without saving.
async function storedOccupancyEntity(ha: HaWs): Promise<unknown> {
  const [entry] = await ha.listConfigEntries(DOMAIN);
  const menu: Json = await ha.startOptionsFlow(String(entry.entry_id));
  try {
    const form: Json = await ha.optionsFlowStep(menu.flow_id, { next_step_id: 'global_settings' });
    const field = (form.data_schema as Json[]).find((f) => f.name === 'house_occupancy_entity');
    return field?.description?.suggested_value;
  } finally {
    await ha.abortOptionsFlow(menu.flow_id);
  }
}

// Puts the baseline occupancy entity back through an options flow over REST:
// the global settings form is submitted with the values it shows for the
// other fields, then the flow is aborted from its menu.
async function restoreOccupancyEntity(ha: HaWs): Promise<void> {
  const [entry] = await ha.listConfigEntries(DOMAIN);
  const menu: Json = await ha.startOptionsFlow(String(entry.entry_id));
  try {
    const form: Json = await ha.optionsFlowStep(menu.flow_id, { next_step_id: 'global_settings' });
    const input: Json = {};
    for (const field of form.data_schema as Json[]) {
      if (field.required) {
        if (!('default' in field)) {
          throw new Error(`global settings: no value shown for required field "${field.name}"`);
        }
        input[field.name] = field.default;
      }
    }
    input.house_occupancy_entity = OCCUPANCY_ENTITY;
    await ha.optionsFlowStep(menu.flow_id, input);
  } finally {
    await ha.abortOptionsFlow(menu.flow_id);
  }
}

test('10. Installer: when I choose, change and then clear the house occupancy entity in the integration settings, I should see each change saved; only on/off entities offered (binary sensors, input booleans, switches)', async ({ page }) => {
  const ha = await HaWs.connect();
  try {
    const states = await ha.getStates();
    const ids = new Set(states.map((s) => String(s.entity_id)));
    const notOffered = [...NOT_OFFERED, ...NOT_OFFERED_IF_PRESENT.filter((id) => ids.has(id))];
    // One entity of each other on/off type present, the first by id.
    const otherOffered: string[] = [];
    for (const domain of OTHER_ON_OFF_DOMAINS) {
      const [first] = [...ids].filter((id) => id.startsWith(`${domain}.`)).sort();
      if (first) {
        otherOffered.push(first);
      } else {
        console.log(`no ${domain} entity on the instance, skipped`);
      }
    }
    console.log(`other on/off entities checked: ${JSON.stringify(otherOffered)}`);
    const names = new Map<string, string>();
    for (const entityId of [...OFFERED, ...otherOffered, ...notOffered]) {
      names.set(entityId, friendlyName(states, entityId));
    }

    await login(page);

    // Choose: the picker's options for "e2e_", and for the id of each other
    // on/off entity, are read before the pick.
    await openDevicesAndServices(page);
    await openIntegrationOptions(page, INTEGRATION_NAME);
    const offered = await setHouseOccupancyInOptionsFlow(page, OCCUPANCY_ENTITY, names.get(OCCUPANCY_ENTITY)!, [
      { search: 'e2e_', shown: OFFERED.map((id) => names.get(id)!) },
      ...otherOffered.map((id) => ({ search: id, shown: [names.get(id)!], words: true })),
    ]);
    await finishOptionsFlow(page);
    console.log(`picker options for "e2e_" and ${JSON.stringify(otherOffered)}: ${JSON.stringify(offered)}`);
    for (const entityId of notOffered) {
      const name = names.get(entityId)!;
      expect(
        offered.filter((text) => text.split('\n').some((line) => line.trim() === name || line.trim() === entityId)),
        `${entityId} not offered`,
      ).toEqual([]);
    }
    expect(await storedOccupancyEntity(ha), 'stored after choose').toBe(OCCUPANCY_ENTITY);

    // Change.
    await openDevicesAndServices(page);
    await openIntegrationOptions(page, INTEGRATION_NAME);
    await setHouseOccupancyInOptionsFlow(page, HOT_WATER_ENTITY, names.get(HOT_WATER_ENTITY)!);
    await finishOptionsFlow(page);
    expect(await storedOccupancyEntity(ha), 'stored after change').toBe(HOT_WATER_ENTITY);

    // Clear.
    await openDevicesAndServices(page);
    await openIntegrationOptions(page, INTEGRATION_NAME);
    await clearHouseOccupancyInOptionsFlow(page);
    await finishOptionsFlow(page);
    expect(await storedOccupancyEntity(ha), 'stored after clear').toBeFalsy();
  } catch (err) {
    console.log(`options flow at failure:\n${await page.locator('dialog-data-entry-flow').ariaSnapshot().catch(() => 'none')}`);
    throw err;
  } finally {
    try {
      await restoreOccupancyEntity(ha);
      expect(await storedOccupancyEntity(ha), 'stored after restore').toBe(OCCUPANCY_ENTITY);
    } finally {
      ha.close();
    }
  }
});
