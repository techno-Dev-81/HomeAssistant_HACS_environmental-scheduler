import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/login';

// Automation author scenario (tasks amendment 001.1, scenario 12), in the
// browser on Developer Tools > Actions (spec 002 R10a). Read only: no action
// is performed.

const TIMEOUT = 30_000;

// Field names and descriptions as written in services.yaml. The folded
// descriptions are compared with whitespace normalised.
const ACTIONS = [
  {
    action: 'environmental_scheduler.commit_block',
    name: 'Commit Block',
    fields: [
      {
        name: 'Schedule',
        description:
          "Which schedule to edit. 'house' edits the house schedule (room is ignored). " +
          "'room' edits the room's own stored blocks. On a room that follows the house " +
          'schedule, edits without schedule change the room\'s own blocks, not the house ' +
          'blocks; reading them back with get_blocks needs schedule: room.',
      },
      {
        name: 'Occupied Temperature',
        description:
          'Optional temperature used instead of temperature while the house occupancy ' +
          'entity is on (5 to 35, 0.5 steps). Omit or set to null for none.',
      },
    ],
  },
  {
    action: 'environmental_scheduler.update_room',
    name: 'Update Room',
    fields: [
      {
        name: 'Follow House Schedule',
        description:
          "true to make the room use the house schedule instead of its own blocks. " +
          "The room's own blocks are kept and can still be read and edited with " +
          'schedule: room on the block services.',
      },
    ],
  },
];

test('12. Automation author: when I open the integration\'s actions in Developer Tools, I should see the new options (house or room schedule, "house occupied" temperature, follow house schedule), each with a description', async ({ page }) => {
  await login(page);
  try {
    // On this HA version Developer Tools is reached from Settings > Tools.
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('link', { name: /^Tools/ }).click();
    await page.getByRole('tab', { name: 'Actions' }).click();

    for (const { action, name, fields } of ACTIONS) {
      // The action picker: search by the action id and choose the option by
      // its exact name, because the search also lists "Commit Block (Force)".
      const picker = page.locator('ha-service-picker');
      await picker.locator('ha-picker-field').click({ timeout: TIMEOUT });
      const popup = picker.locator('wa-popover');
      await popup.getByRole('textbox').fill(action, { timeout: TIMEOUT });
      await popup
        .locator('ha-combo-box-item')
        .filter({ has: page.getByText(name, { exact: true }) })
        .click({ timeout: TIMEOUT });
      await popup.waitFor({ state: 'hidden', timeout: TIMEOUT });

      const control = page.locator('ha-service-control');
      for (const field of fields) {
        const row = control.locator('ha-settings-row').filter({ has: page.getByText(field.name, { exact: true }) });
        await expect(row, `${action} field "${field.name}"`).toContainText(field.description, { timeout: TIMEOUT });
      }
    }
  } catch (err) {
    console.log(`page at failure:\n${await page.locator('home-assistant').ariaSnapshot().catch(() => 'none')}`);
    throw err;
  }
});
