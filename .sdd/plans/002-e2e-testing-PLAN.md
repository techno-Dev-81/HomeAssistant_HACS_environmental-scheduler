# Plan 002: E2E testing

Status: APPROVED 2026-10-20
Implements: .sdd/specs/002-e2e-testing.md, with amendment 002.1
Open questions: 0

## 1. Architecture
Four parts, all under `tests/e2e/` except the Python change:

1. **Runner** `tests/e2e/run.sh` (bash, modelled on BudgetOne's `run-tests.sh`):
   - loads the env file and checks it;
   - creates the timestamped results folder;
   - runs Playwright;
   - redacts secrets from the results;
   - prints the per-scenario summary;
   - exits non-zero on any failure or redaction miss.
2. **Playwright suite** (TypeScript, `@playwright/test` 1.60.0, Chromium):
   - project `fresh-start` (setup) runs first and makes the test instance a fresh, configured install;
   - project `scenarios` depends on it and runs the 23 scenarios.
   - One worker, because every scenario shares the one HA instance and its house schedule.
3. **Helpers** (`tests/e2e/helpers/`):
   - an HA WebSocket client (token auth; call actions with response; subscribe to events; config and options flow, helper, Lovelace dashboard and resource commands);
   - a browser login helper (HA login page, username and password);
   - time-window helpers for blocks that cover "now";
   - a fixtures file that every spec imports.
4. **Integration change:**
   - `SchedulerStore.async_remove()` deletes the HA Store file;
   - `async_remove_entry` in `__init__.py` calls it, so removing the integration deletes its data (R4);
   - unload is unchanged (PB2).

Support scripts that run after Playwright (redaction) are in Python stdlib, because Node 20 cannot run TypeScript without a build step and has no zip support. Python 3.11 has `zipfile`, which is needed to redact inside trace archives.

## 2. Data and interfaces
**Env file `tests/e2e/.env`** (git-ignored, created by the user, never opened by Claude). It holds `HA_URL`, `HA_TOKEN`, `HA_USERNAME`, `HA_PASSWORD` and `E2E_CONFIRM_TEST_INSTANCE`.
- `run.sh` sources the file. If the file is missing, a variable is empty, or the confirmation is not `yes`, it prints the missing names only and exits 2 before Playwright starts (R2).
- Username and password come from plan decision D1.

**Results folder** `tests/e2e/test-history/<YYYYMMDD-HHMMSS>/` (git-ignored, R9) holds:
- `output.log`: console;
- `results.json`: Playwright JSON reporter;
- `html-report/`: with traces and screenshots on failure only;
- `durations.json`: per scenario and total;
- `benchmarks.proposed.json`.

**Benchmarks** `tests/e2e/benchmarks.json` (committed, starts `{}`) maps a scenario number ("1" to "23") to seconds, so rewording a title keeps its benchmark (R10c).
- A custom reporter `tests/e2e/reporters/summary-reporter.ts` prints one `PASS` / `FAIL` / `SLOWER THAN BENCHMARK` line per scenario, in plain words.
- It writes `durations.json` and `benchmarks.proposed.json`.

**Redaction** `tests/e2e/redact_results.py` runs after Playwright. It reads the token and password from the environment `run.sh` exported, and replaces them with `[redacted]` in every file under the run folder. Zip archives (traces) are rewritten member by member. The HTML report's `index.html` embeds its data as a base64 zip; that payload is decoded, redacted and re-encoded the same way. A second scan then checks for any remaining match: a file that still contains one is deleted, its path printed, and exit 1 (R10d). The name does not start with `test`, so the unit run does not pick it up (PB1).

**Prerequisites** (R6b):
- `tests/e2e/prerequisites.md`: the list. It starts with the one standing prerequisite, that `HA_USERNAME` is an HA administrator (needed to remove and add the integration, spec section 6), and no entities.
- `tests/e2e/prerequisites.json`: entity ids, committed (entity ids are not secret), starting `{}`.

**Simulated devices** (R6a), all created through the WebSocket API in `fresh-start`. Any left from an earlier run are deleted first:

| Device | Kind | Purpose |
|---|---|---|
| `input_boolean.e2e_house_occupied` | `input_boolean/create` | house occupancy |
| `input_boolean.e2e_hot_water` | `input_boolean/create` | hot water entity |
| `input_boolean.e2e_heater` | `input_boolean/create` | heater switch for the thermostat |
| `input_number.e2e_room_temp` | `input_number/create`, -10 to 40, step 0.5 | value the test sets |
| `sensor.e2e_room_temperature` | template helper (config flow `template`, sensor, device class temperature) from `input_number.e2e_room_temp` | temperature sensor |
| `climate.e2e_thermostat` | generic thermostat helper (config flow `generic_thermostat`), heater `input_boolean.e2e_heater`, sensor `sensor.e2e_room_temperature` | heating room's climate entity |

**Rooms** added by `fresh-start` through the options flow in the browser (room ids come from the name slug):
- `e2e-heating` (id `e2e_heating`): climate `climate.e2e_thermostat`, sensor `sensor.e2e_room_temperature`;
- `e2e-hot-water` (id `e2e_hot_water`): hot water `input_boolean.e2e_hot_water`;
- `e2e-follower` (id `e2e_follower`): no entities.

`fresh-start` also:
- sets the house occupancy entity to `input_boolean.e2e_house_occupied` in the browser options flow (global settings), as an installer would;
- sets "follow house schedule" on `e2e_follower` through the `update_room` action (D6), because the options flow has no follow field (issue #27);
- sets `climate.e2e_thermostat` to HVAC mode `heat` through `climate.set_hvac_mode`, because the integration only sets the target temperature and a new generic thermostat may start `off`. No persons, area, door or window sensors are set, so presence never applies (resolution skips presence for a room with no persons).

**Baseline state** after `fresh-start`, which every scenario relies on and restores if it changes it:
- `e2e_follower` follows the house; `e2e_heating` and `e2e_hot_water` do not;
- the occupancy entity is `input_boolean.e2e_house_occupied`, and the helper is `off`;
- `climate.e2e_thermostat` is in `heat` mode.

A scenario that changes any of these puts it back in its own cleanup step (Playwright `finally` or `afterEach`), whether it passed or failed.

**Dashboard** `e2e-test` (R7), created or replaced through `lovelace/dashboards/create|update` and `lovelace/config/save`. One view holds four cards:
- `custom:environmental-scheduler-card`;
- `custom:environmental-scheduler-room-config-card`;
- `custom:environmental-scheduler-overview-card`;
- `custom:environmental-scheduler-overview-card-lcars`.

**Card resources** (R7a): `lovelace/resources` is listed, and a `module` resource is created for each of these four URLs when that exact URL is missing:
- `/environmental_scheduler/static/environmental-scheduler-card.js`
- `/environmental_scheduler/static/environmental-scheduler-room-config-card.js`
- `/environmental_scheduler/static/environmental-scheduler-overview-card.js`
- `/environmental_scheduler/static/skins/lcars/overview-card.js`

Matching ignores any `?v=` query. A resource whose path ends with the same tail (`environmental-scheduler-card.js`, `environmental-scheduler-room-config-card.js`, `environmental-scheduler-overview-card.js`, `skins/lcars/overview-card.js`) under another prefix stops the run before any scenario, naming it. No resource is removed.

**Python** (R4):
- `SchedulerStore.async_remove()` calls `self._store.async_remove()`.
- `async def async_remove_entry(hass, entry)` builds a `SchedulerStore(hass)` and calls `async_remove()`.
- The stub `Store` in `tests/ha_stubs.py` keeps its data on the fake `hass`, keyed by storage `key`, so every `Store` built for the same `hass` shares it (as HA's file storage does). `Store.data` stays a working attribute (a property over that shared entry), so existing tests that read or set `store._store.data` keep working. Each test builds its own fake `hass`, so nothing leaks between tests. The stub gains `async_remove()`, which deletes that key's data and counts the call.

## 3. Decisions
| Decision | Options | Choice and reason |
|---|---|---|
| D1 Browser login | inject the token into the browser's HA login storage; HA login page with username and password | Login page, as a user would (user, 2026-10-20). The token is used only for engine tests and setup through the API. Consequence: the env file gains `HA_USERNAME` and `HA_PASSWORD`, `run.sh` requires them (R2), and the password is redacted with the token (R10d). |
| D2 Test language | TypeScript; JavaScript ES modules | TypeScript (user, 2026-10-20): Playwright runs it without a build step, it type-checks HA messages and helpers, and BudgetOne's fixture and helper patterns carry over. Post-run scripts use Python stdlib (section 1). |
| D3 WebSocket client | Node 20 global (none, needs a flag); `ws` package | `ws` with `@types/ws` (user, 2026-10-20), pinned in `tests/e2e/package.json` (R14). Node 20 has no stable global WebSocket. |
| D4 Workers | 1; several | 1: scenarios share one HA instance, its house schedule and occupancy helper. Parallel runs would interfere. |
| D5 Store deletion location | in `__init__.py` only; a store method called by `__init__.py` | Store method: the unit harness loads `storage.py` but never runs `__init__.py` (constitution amendment 1), so the deletion is unit-tested there. The hook is checked by the E2E fresh-start check. |
| D6 Setting follow in fresh-start | `update_room` action; room config card in the browser | `update_room` action (user, 2026-10-20): it is setup, and the card toggle is tested as scenario 18. The missing settings field is logged as issue #27. |
| D7 Post-run script language | Node with a zip package; Python stdlib | Python stdlib (`zipfile`, `base64`) (user, 2026-10-20): no extra package; Node 20 cannot run TypeScript without a build step. |

## 4. Test strategy
**Unit** (`python3 -m unittest discover -s tests`, constitution amendment 1), added to `tests/test_storage.py`:
- `async_remove()` deletes stored data;
- a store loaded after removal is empty, and setup would seed defaults (PB3);
- unload-style save keeps data (PB2).

The reported count must rise (V7). The existing 62 tests still pass (PB1).

**E2E**, run only when the user asks (T2), after the user deploys `beta` and restarts HA (R4a).
- `fresh-start.setup.ts`, split into serial setup tests so that each fits the 90-second limit (devices; resources and dashboard; remove and add; delete seeded rooms; add and configure rooms):
  - log in through the login page;
  - recreate the simulated devices;
  - check or add the card resources;
  - create the `e2e-test` dashboard;
  - in the browser, remove the integration if present, add it through Add integration, and check that no `e2e-` room from the previous run remains (the fresh-start check);
  - in the browser options flow, delete every seeded room and add and configure the three `e2e-` rooms;
  - set the occupancy entity, follow on `e2e_follower` and thermostat `heat` mode (section 2).
  - If any setup test fails, Playwright skips every scenario; the summary reporter prints each skipped scenario as `NOT RUN` and the run exits non-zero (R10).
- `automation.spec.ts`, through the API: scenarios 1 to 9 and 11. Events are collected through `subscribe_events` on `environmental_scheduler.block_changed`.
- `installer.spec.ts`, in the browser: scenario 10 (house occupancy entity in the options flow). The entity picker is checked to offer the on/off types present on the instance (input booleans from R6a, plus any switches or binary sensors already there) and not to offer `sensor.e2e_room_temperature`, `input_number.e2e_room_temp` or `climate.e2e_thermostat`. The scenario sets the entity back to `input_boolean.e2e_house_occupied` at the end.
- `developer-tools.spec.ts`, in the browser: scenario 12.
- `household.spec.ts`, in the browser on `e2e-test`: scenarios 13 to 21.
- `thermostat.spec.ts`, through the API, on room `e2e-heating`:
  - scenario 22: a block covering now, then wait up to 75 seconds for the minute tick to set `climate.e2e_thermostat`'s target;
  - scenario 23: creates its own block covering now and waits for the target as scenario 22 does, so it does not depend on 22; then sets `input_number.e2e_room_temp` at least 2 °C below the target (beyond the thermostat's cold tolerance) and expects `input_boolean.e2e_heater` on. This mostly checks the simulated chain (spec advisory).
  - Conditions: `node_red_mode` false (the default on a fresh add), room without persons.
- Each test title is the scenario in plain words, prefixed with its number, for example "22. Household user: when a block starts in a heating room, the thermostat target becomes the block temperature".
- Each scenario that uses blocks first clears the day it uses, in its room or in the house, and restores any baseline state it changes (section 2).
- Rooms per scenario: own-schedule scenarios use `e2e_heating`; follow scenarios (6, 7, 15) use `e2e_follower`; scenario 9 turns follow on and off on `e2e_heating` and ends with it off; scenario 18 turns follow on for `e2e_heating` and `e2e_hot_water` in the room config card and turns it off again at the end; occupancy scenarios (11, 16, 19, 20) turn `input_boolean.e2e_house_occupied` on and back off.
- Hot water switching is not checked: issue #28 (an `input_boolean` hot water entity is never switched).
- Runner behaviour (R9, R10, R10b, R10c, R10d) is checked on every run by the runner itself.
- The duplicate-resource stop (R7a) and adding a scenario file without changing the runner (R13) are checked once in the implement phase, by review of the code.
- The refusal without the confirmation line (R2) is an accepted gap.

## 5. Work packages
| WP | Scope | Outputs |
|---|---|---|
| WP1 | Removal deletes data: store method, `async_remove_entry`, stub, unit tests. Covers R4, PB2, PB3, PB1 | `storage.py`, `__init__.py`, `tests/ha_stubs.py`, `tests/test_storage.py` |
| WP2 | E2E foundation: `package.json` (pinned `@playwright/test` 1.60.0, `ws`, `@types/ws`), `package-lock.json`, `playwright.config.ts` (projects, 1 worker, 90 s test timeout, 30 min `globalTimeout`, retries 0, trace and screenshot on failure), `run.sh`, `redact_results.py`, summary and benchmark reporter, `benchmarks.json`, prerequisites list and file, `.gitignore`, WebSocket client, login helper, fixtures. Covers R1, R2, R3, R6b, R9, R10, R10b, R10c, R10d, R11, R13, R14 | `tests/e2e/*`, `.gitignore` |
| WP3 | Fresh start: simulated devices, card resources, `e2e-test` dashboard, browser remove and add, fresh-start check, browser options flow to delete seeded rooms and add the `e2e-` rooms, follow setting. Covers R5, R6, R6a, R7, R7a; PB3 (fresh-start sees the seeded rooms before deleting them), PB5 | `tests/e2e/tests/fresh-start.setup.ts`, `tests/e2e/helpers/*` |
| WP4 | Scenarios 1 to 23 in five spec files, titled in plain words. Covers R8, R10a; PB4 | `tests/e2e/tests/*.spec.ts` |
| WP5 | Constitution amendment 3: E2E test command `bash tests/e2e/run.sh`; test runner notes replace amendment 1's manual-checklist sentence and name Node, Playwright 1.60.0, Chromium, `ws`, and Python stdlib for redaction. Covers R12 | `.sdd/constitution.3-e2e-test-command.md` |

Requirement coverage: R1 WP2; R2 WP2; R3 WP2; R4 WP1, WP3; R4a N/A - a user precondition, nothing is built (the runner does not deploy); R5 WP3; R6 WP3; R6a WP3; R6b WP2; R7 WP3; R7a WP3; R8 WP4; R9 WP2; R10 WP2; R10a WP4; R10b WP2; R10c WP2; R10d WP2; R11 WP2; R12 WP5; R13 WP2; R14 WP2.

## 6. Risks
- **HA UI selectors change between HA versions.** Browser tests break on an HA upgrade with no integration bug. Mitigation: selectors use roles and visible text where possible, and live in the helpers, not the specs.
- **Helper config flows differ by HA version.** The template and generic thermostat helper flows, and their step fields, may vary. Mitigation: WP3 is built against the instance's actual flows, and a mismatch stops at `fresh-start` with a clear message.
- **The minute tick makes scenario 22 slow.** It can wait up to about 60 seconds, against a 90-second test timeout. Mitigation: the block covers now, so the next tick applies it through the current-state step; the wait is capped at 75 seconds.
- **Blocks near midnight.** A block must be at least 30 minutes and cannot cross midnight. Mitigation: the time-window helper picks a window inside today that contains now; between 23:30 and 00:00 it uses 23:29 to 23:59. Known gap: no block can contain 23:59 to 00:00, so every scenario that needs a current block (11, 16, 19, 20, 22, 23) fails with the message "too close to midnight" when started at 23:59, and 22 and 23 also when started after 23:57 (they need a minute tick inside the block).
- **First run deletes existing integration data on the test instance** (accepted, spec Q2). It also deletes the `e2e-` helpers each run; no other helper is touched.
- **Secrets in results.** Playwright traces record `fill` arguments (the password) and network data. Mitigation: `redact_results.py` covers every file and trace archive and fails the run on any miss (R10d). The WebSocket client runs in Node, not the browser, so the token is not in browser traces.
- **The deployed code is not `beta`.** If the removal cleanup is not deployed, the fresh-start check fails ("an `e2e-` room from the previous run remains"). That is the intended signal. The runner itself does not check the deployed version.
- **npm install needs the registry.** `npm view` reached the registry on 2026-10-20, and Chromium 1223 for Playwright 1.60.0 is already in the session cache.

## 7. Open questions
None
