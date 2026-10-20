# 002: E2E testing

Status: APPROVED 2026-10-20
Derives from: constitution (approved 2026-10-19) and amendments 1 and 2; plan and tasks amendments 001.1 (approved 2026-10-20); user brief 2026-10-20
Open questions: 0

## 1. Brief
**Problem:** The integration has unit tests only. Everything a person actually sees or does (dashboard cards, integration settings, Node-RED and automation actions) is checked by hand, if at all.
**Who:** The developer and anyone changing the integration. The tests are written from the point of view of three kinds of user: the household user on the dashboard cards, the installer in the integration settings, and the automation author using the integration's actions and events.
**Why now:** The actions, settings and cards of spec 001 (its 21 end-user scenarios, tasks amendment 001.1) can only be verified end to end; its storage and scheduler logic is already unit-tested. Later specs are expected to add their own scenarios to the same suite.

## 2. Pre-spec gate
1. **Entry point:** One runner script in the repo, under `tests/e2e/`. It is started by Claude only when the user asks for an E2E run (SDD rule T2), or by the user from a terminal. It never starts on its own: no git hooks, no schedules, no push trigger.
2. **Existing behaviour audit:**
   - Unit tests: `python3 -m unittest discover -s tests` (constitution amendment 1) finds `test*.py` files only; 62 tests.
   - Constitution E2E command: `none`.
   - `.gitignore` holds only `.claude/`.
   - Config flow: single step, one instance only (`single_instance_allowed`), no fields.
   - `async_setup` serves the card files at `/environmental_scheduler/static/`. It does not add dashboard resources and does not create a dashboard; that is a manual installer step.
   - `async_setup_entry`: when the store has no rooms, it seeds the default rooms (`DEFAULT_ROOMS`) and example blocks (`_seed_example_blocks`, living room and bedroom), then saves.
   - `async_unload_entry` stops the scheduler, saves the store and unregisters the services.
   - There is no `async_remove_entry`. Removing the integration leaves `.storage/environmental_scheduler` in place, so adding it again brings back the old rooms, schedules and settings.
   - The options flow is a menu: global settings (global temperatures, `node_red_mode`, house occupancy entity); manage persons (add, edit, delete); room settings (edit a room: name, area, climate entities, hot water entity from switch, water_heater or input_boolean, temperature sensors, door and window binary sensors, persons; delete a room); add room.
   - The HA test container at `192.168.168.11:8123` (internal only, not production) is reachable from this session (HTTP 200, 2026-10-20). Node, npm and Playwright's Chromium are installed in this session.
3. **User-facing notifications:** None. Results are written to a timestamped folder. User decision 2026-10-20: test UI and notifications are reviewed centrally for all projects once Playwright testing skills are added to SDD.
4. **Access/feature gating:** The runner uses the long-lived access token of an HA admin user, held with the HA address in a git-ignored env file. Claude never opens the file; only the runner reads it. The runner starts only when the file also holds `E2E_CONFIRM_TEST_INSTANCE=yes` (section 6). The target is a test instance with weekly backups.
5. **Navigation and layout changes:** The suite creates its own dashboard `e2e-test` with the four cards, replaced on every run and left in place afterwards. It adds any missing card resources. No other dashboard is touched; the user removes the existing `/environmental-scheduler/0` test dashboard by hand.

## 3. Entry point inventory
| Name | Location | Extends existing? |
|---|---|---|
| E2E runner script | `tests/e2e/` (name set in the plan) | no |
| Env file (git-ignored) | `tests/e2e/.env` | no |
| Integration removal cleanup (`async_remove_entry`) | `custom_components/environmental_scheduler/__init__.py` | yes |
| `.gitignore` entries for E2E | `.gitignore` | yes |
| E2E package file | `tests/e2e/package.json` | no |
| Benchmarks | `tests/e2e/benchmarks.json` (committed) | no |
| Prerequisites list and its entity config file | `tests/e2e/` (names set in the plan) | no |
| Timestamped results folders (git-ignored) | `tests/e2e/` (name set in the plan) | no |
| Constitution E2E command | `.sdd/constitution.md` via a constitution amendment | yes |

## 4. Preserved behaviours
- PB1. The unit test command and its 62 tests are unchanged and still pass; the unit run picks up no E2E file.
- PB2. Unloading the integration (restart, reload, disable) keeps its stored data. Only removal deletes it.
- PB3. Setting up the integration on an empty store still seeds the default rooms and example blocks.
- PB4. The config flow, options flow, services, events and cards behave as before; the suite only drives them.
- PB5. No dashboard other than `e2e-test` is created, changed or removed by the suite.

## 5. Notification matrix
| Trigger | Channel | Recipient | Message |
|---|---|---|---|
| N/A - no notifications (user decision 2026-10-20) | | | |

## 6. Access/gating matrix
| Element | Requires | Ungated user sees | Variable | Safe default |
|---|---|---|---|---|
| E2E run | Env file present with HA address, admin token and confirmation line | The runner stops before any test with a message naming what is missing; nothing on HA changes | `E2E_CONFIRM_TEST_INSTANCE` | absent: run refused |
| Removing and re-adding the integration, options flow | HA admin user | N/A - HA's own rule | none | N/A |

## 7. Navigation changes
- New dashboard `e2e-test` on the test instance, created by the suite, holding the schedule editor card, room config card, default overview card and LCARS overview card.
- Card resources added by the suite when missing (global to the test instance).
- Helpers created by the suite, visible in Settings > Helpers and the entity lists: `input_boolean.e2e_house_occupied`, `input_boolean.e2e_hot_water`, the simulated heater switch and temperature sensor, and the generic thermostat.
- No change to the integration's own UI.

## 8. Requirements
R1. A single runner script under `tests/e2e/` runs the whole suite.
R2. The runner reads the HA address, the admin token and `E2E_CONFIRM_TEST_INSTANCE` from the git-ignored `tests/e2e/.env`. If the file is missing, a value is missing, or the confirmation is not `yes`, it stops before any test, prints which item is missing (never a secret value), and exits non-zero.
R3. The runner never starts on its own: no git hook, schedule or push trigger.
R4. When the integration is removed, it deletes its stored data. This applies to every installation, not only the test instance (user decision 2026-10-20, gate 2). After removal, adding it again starts from an empty store (then seeded per PB3). Unloading keeps the data (PB2).
R4a. Before a run, the user deploys `beta` to the test instance and restarts HA (precondition, user decision 2026-10-20). The runner does not deploy.
R5. Each run starts as a fresh addition: it removes the integration if present, then adds it through the config flow, in the browser, as an installer would.
R6. Each run configures the integration from zero through the options flow, in the browser, as an installer would. It first deletes every seeded default room through the options flow, then adds its own rooms named with an `e2e-` prefix (user decision 2026-10-20).
R6a. Each run creates, or recreates if left from an earlier run, simulated devices from HA helpers: `input_boolean.e2e_house_occupied` (house occupancy), `input_boolean.e2e_hot_water` (hot water), and a generic thermostat wired to a simulated heater switch and a simulated temperature sensor whose value the test sets (a heating room). No physical device is used.
R6b. A prerequisites list in the repo names any entity the user provides once (for future real-device checks) and the config file where the user records its entity id. It starts empty; the 23 scenarios need none.
R7. Each run creates or replaces the dashboard `e2e-test` with the four cards, leaves it in place after the run, and touches no other dashboard.
R7a. Card resources: the suite adds a resource only when its exact `/environmental_scheduler/static/...` address is missing. If the same card file is registered under another address, the suite stops before any test and names the duplicate. It never removes a resource. Resources are global to the test instance (user decision Q2).
R8. The suite has at least one test for each of the 21 end-user scenarios in tasks amendment 001.1 (that table is included here by reference and is authoritative), and for these two new scenarios (user decision 2026-10-20):
- 22. Household user: when a block starts in a heating room, the room's thermostat target becomes the block temperature.
- 23. Household user: when the room temperature is below the target, the thermostat calls for heat (its heater switch turns on).
 Each test is named by its scenario in plain words, from the user's point of view.
R9. Each run writes its results to a git-ignored timestamped folder under `tests/e2e/`: the console output, a machine-readable result per test, and an HTML report with screenshots and traces for failures (user decision Q1).
R10. A failing test does not stop the run; the remaining scenarios still run, and HA is left as the run left it. The runner prints a pass or fail line per scenario in plain words and exits non-zero when any test fails (user decision Q1).
R10a. A user action (household user on the cards, installer in the settings, a person in Developer Tools) is tested in the browser as the user does it. Engine behaviour (what the integration does when an automation calls it, including scenarios 22 and 23) may be tested through HA's WebSocket API. Setup steps (creating the R6a helpers, the card resources and the `e2e-test` dashboard) use the WebSocket API (user decision Q3).
R10b. Safeguards: each test times out after 90 seconds; the whole run stops after 30 minutes (user decision Q4).
R10c. Benchmarks: every run records each scenario's duration and the total in its results folder. The committed `tests/e2e/benchmarks.json` holds benchmark times; it starts empty. Each run writes a proposed `benchmarks.json` with its own times to its results folder, for the user to approve as new values. A scenario more than 50% slower than its benchmark is reported as "slower than benchmark", a warning, not a failure. Benchmarks change only when the user approves new values (user decision Q4).
R10d. Results never hold the admin token: before the run finishes, the runner replaces its value with `[redacted]` in every results file, including the contents of trace archives, then checks none still contains it; a file that does is deleted and the run is marked failed (user decision Q5).
R11. `.gitignore` covers the env file, Node modules and every results folder the suite writes.
R12. A constitution amendment sets the E2E test command to the runner, and in the test runner notes replaces amendment 1's manual-checklist sentence and names the E2E toolchain (Node, Playwright, Chromium).
R13. A new scenario test file can be added under `tests/e2e/` without changing the runner.
R14. The suite has its own `package.json` under `tests/e2e/`, with Playwright pinned to the version installed in the session (1.60) and Chromium as the browser (user decision Q3).

## 9. Out of scope
- Notifications of any kind, and any test UI beyond Playwright's own report (reviewed centrally later).
- Running on any HA instance other than a test instance.
- Running automatically (hooks, schedules, CI).
- Cleaning up after a run; the next run starts fresh.
- Backing up or restoring the test instance (weekly backups exist).
- Deploying `beta` or restarting HA from the runner (future SDD auto-deploy, generic proposal G5).
- Removing the default rooms from the product (a future spec).
- Simulated cooling (AC) devices, until the integration supports AC (user note 2026-10-20).
- An automated check that the runner refuses to start without the confirmation line (accepted gap until the SDD E2E agent handles it, generic proposal G5).

## 10. Interview answers
- Q1 (scope and edge cases): a failing test does not stop the run; results keep the log, a per-test result file and the HTML report with screenshots and traces; one plain-words line per scenario (R9, R10).
- Q2 (existing behaviour touched): card resources matched by exact address; a duplicate under another address stops the run; resources are never removed (R7a). The first run after R4 ships discards any existing integration data on the test instance: accepted by the user (test instance, weekly backups).
- Q3 (integrations): user actions are tested in the browser as the user does them; engine behaviour may use the WebSocket API for speed; setup uses the WebSocket API (R10a). Playwright with Chromium, own `package.json` under `tests/e2e/`, Playwright pinned to the version installed in the session (1.60).
- Q4 (performance): benchmarks set from the first run and adjusted over time with user approval; first-run safeguards of 90 seconds per test and 30 minutes per run (R10b, R10c). Generic proposal G6 for the SDD testing agents.
- Q5 (compliance): the token is redacted from all results (R10d). The test instance address may stay in the spec: the instance is internal only and not production, and its password can be changed on request (user decision 2026-10-20).

## 11. Open questions
None

## 12. Testing
Added at the user's request (2026-10-20: every spec defines its new or updated tests).
- **Unit:** a test that removing the integration deletes its stored data, and that unloading keeps it (R4, PB2). The existing 62 tests still pass (PB1).
- **E2E:** the 23 end-user scenarios (R8); a fresh run in which no `e2e-` room from the previous run remains after the re-add (R4, R5).
- **E2E, checked on every run by the runner itself:** results folder contents (R9), per-scenario lines and exit code (R10), timeouts (R10b), benchmark warning and proposed file (R10c), token check (R10d).
- **Checked once, by test or review in the implement phase:** duplicate resource stop (R7a), adding a scenario file without changing the runner (R13).
- **Not tested (accepted gap):** the runner refusing without the confirmation line (R2).
