# Tasks 002: E2E testing

Status: APPROVED 2026-10-20
Implements: .sdd/plans/002-e2e-testing-PLAN.md (spec .sdd/specs/002-e2e-testing.md with amendment 002.1)
Rules: one commit per task on the working branch; a failing test is fixed and retried up to 3 times, then stop and report.

Checks used below:
- **UT**: `python3 -m unittest discover -s tests` (constitution amendment 1). A task that adds tests must raise the reported count (V7).
- **PYSYN FILE**: `python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" FILE` exits 0.
- **BASHN FILE**: `bash -n FILE` exits 0.
- **PWLIST**: in `tests/e2e/`, `npx playwright test --list --pass-with-no-tests` exits 0.
  - It loads the config and every test file, and the helpers those files import.
  - It strips types but does not type-check.
  - It does not contact HA.
  - Helpers read env values only when called, never when they load, so PWLIST runs without `.env`.
- **SCRATCH**: a check the implementer runs in the session scratchpad. It is not committed, and its output is recorded in Evidence.
- **E2E**: `bash tests/e2e/run.sh`. It runs only after the user has asked (SDD rule T2; standing permission from U3), and needs U1 and U2 done.
- **USER**: a step only the user can do. It stays `blocked` until the user reports it done.

Paths under `custom_components/` are given relative to `custom_components/environmental_scheduler/`. Helpers and fixtures live in `tests/e2e/helpers/` (plan section 1).

## User steps
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| U1 | USER: after WP1 is committed and pushed (the push needs your per-command yes), pull `beta` on the test container and restart HA | user reports deployed and restarted | T1.3 | blocked | |
| U2 | USER: create `tests/e2e/.env` with `HA_URL`, `HA_TOKEN`, `HA_USERNAME`, `HA_PASSWORD` (an HA admin user) and `E2E_CONFIRM_TEST_INSTANCE=yes`; remove the old `/environmental-scheduler/0` dashboard | user reports done | T2.6 | blocked | |
| U3 | USER: give standing permission for Claude to run E2E during this implement phase, knowing that each run deletes all integration data and the `e2e_` helpers on the test instance | user says yes | none | blocked | |

## WP1: Removal deletes data
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T1.1 | `tests/ha_stubs.py`: stub `Store` keeps its data on the fake `hass`, keyed by storage `key`, so every `Store` built for the same `hass` shares it. `Store.data` becomes a property over that entry, so existing tests that read or set `store._store.data` keep working. Add `async_remove()`, which deletes that key's data and counts the call | UT: the same 62 tests pass, count unchanged; PYSYN `tests/ha_stubs.py` | none | done | UT 62 run OK (62 before, unchanged); PYSYN exit 0; build none; reviewer CONFORMS, 0 BLOCKING |
| T1.2 | `storage.py`: `SchedulerStore.async_remove()` calls `self._store.async_remove()`. Tests in `tests/test_storage.py`: (a) after `async_remove()`, a new `SchedulerStore` on the same `hass` loads no rooms; (b) after `async_save()` without removal (the unload path), a new `SchedulerStore` on the same `hass` loads the saved rooms. Seeding of defaults after removal (PB3) is covered by T3.3, not by a unit test | UT passes and the count is higher than 62. SCRATCH: test (a) fails when `async_remove()` is made a no-op, and test (b) fails when the stub's `async_save` stops persisting | T1.1 | done | UT 64 run OK (62 before); SCRATCH: (a) fails with async_remove no-op, (b) fails with stub save not persisting, files restored; build none; reviewer CONFORMS, 0 BLOCKING |
| T1.3 | `__init__.py`: `async def async_remove_entry(hass, entry)` builds `SchedulerStore(hass)` and awaits `async_remove()` | PYSYN `__init__.py`; UT passes, count unchanged from T1.2; the diff of `__init__.py` shows only the added function (PB2: unload unchanged) | T1.2 | done | PYSYN exit 0; UT 64 run OK (unchanged); diff shows only the added async_remove_entry (PB2); build none; reviewer CONFORMS, 0 BLOCKING |

## WP2: E2E foundation
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T2.1 | `tests/e2e/package.json`: `@playwright/test` pinned to 1.60.0; `ws` and `@types/ws` pinned to the exact versions resolved at install. `npm install` writes `package-lock.json`. `.gitignore` adds `tests/e2e/.env`, `tests/e2e/node_modules/` and `tests/e2e/test-history/` | `npm ci` in `tests/e2e/` exits 0; `git check-ignore` reports `tests/e2e/.env`, `tests/e2e/node_modules/x` and `tests/e2e/test-history/x` ignored; `npx playwright --version` prints 1.60.0; UT count unchanged | none | done | npm ci exit 0; check-ignore: all 3 ignored; playwright Version 1.60.0; ws 8.22.0, @types/ws 8.18.2 exact; UT 64 run OK (unchanged); reviewer CONFORMS, 0 BLOCKING |
| T2.2 | `tests/e2e/playwright.config.ts`:<br>- `testDir` `tests`;<br>- projects `fresh-start` (`*.setup.ts`), then `scenarios`, which depends on it;<br>- 1 worker, test timeout 90 s, `globalTimeout` 30 min, retries 0;<br>- Chromium headless, trace and screenshot on failure only;<br>- `outputDir` from env `PW_OUTPUT` (inside the run folder);<br>- reporters: list; html to `PW_HTML` with `open: 'never'`; json to `PW_JSON`;<br>- when these env values are unset (PWLIST, a direct run), all three fall back to `test-history/manual/`, which is git-ignored.<br>`tests/e2e/helpers/fixtures.ts` exports `test` and `expect` | PWLIST, after which `git status` shows no untracked files under `tests/e2e/`; reviewer confirms that a new `*.spec.ts` under `tests/e2e/tests/` is picked up without changing the runner (R13) | T2.1 | done | PWLIST exit 0 (0 tests); git status: only the 2 new files under tests/e2e; R13 probe listed setup and spec in the right projects, removed; UT 64 OK; reviewer CONFORMS, 0 BLOCKING |
| T2.3 | Helpers in `tests/e2e/helpers/`:<br>- `ha-ws.ts`: connect with `HA_TOKEN`; call an action with response; subscribe to events; config and options flow commands; helper create, list and delete; Lovelace dashboards, config and resources.<br>- `login.ts`: the HA login page with `HA_USERNAME` and `HA_PASSWORD`.<br>- `time-window.ts`: a block window inside today that contains now. After 23:30 it uses 23:29 to 23:59. It throws "too close to midnight" at 23:59, and also after 23:57 when called for the thermostat scenarios.<br>No helper logs a secret value | PWLIST. SCRATCH: a throwaway spec that imports every helper passes PWLIST, and `time-window.ts` called at 10:00, 23:45, 23:58 (normal and thermostat) and 23:59 returns or throws as specified. Reviewer confirms no secret is logged | T2.2 | done | PWLIST exit 0; SCRATCH: import spec listed with env unset; time-window 10:00 09:45-10:45, 23:45 23:29-23:59, 23:58 normal 23:29-23:59 / thermostat throws, 23:59 throws; scratch removed; UT 64 OK; reviewer CONFORMS, 0 BLOCKING. Timezone of runner and HA confirmed same by user 2026-10-20 |
| T2.4 | `tests/e2e/reporters/summary-reporter.ts`, added to the config's reporters:<br>- prints one line per scenario with its plain-words title: `PASS`, `FAIL`, `NOT RUN` (skipped) or `SLOWER THAN BENCHMARK` (more than 50% over its benchmark);<br>- writes `durations.json` (per scenario number and total) and `benchmarks.proposed.json` to the run folder given by env `PW_RUN_DIR` (fallback `test-history/manual/`).<br>`tests/e2e/benchmarks.json` is committed as `{}`, keyed by scenario number | PWLIST with the reporter configured. SCRATCH: the reporter fed a fake run with a benchmark of 10 s and a 16 s result prints `SLOWER THAN BENCHMARK`, and a skipped test prints `NOT RUN` | T2.2 | done | PWLIST exit 0 with reporter; SCRATCH: benchmark 10 s + 16 s pass printed SLOWER THAN BENCHMARK, skipped printed NOT RUN, setup silent, durations.json and benchmarks.proposed.json written via PW_RUN_DIR; scratch removed; UT 64 OK; reviewer CONFORMS, 0 BLOCKING |
| T2.5 | `tests/e2e/redact_results.py` (Python stdlib):<br>- reads `HA_TOKEN` and `HA_PASSWORD` from the environment and exits 2 if either is empty;<br>- in the given run folder, replaces each secret, plus its JSON-escaped and URL-encoded forms, with `[redacted]` in every file, every zip archive member, and the HTML report's embedded base64 data;<br>- re-scans for all those forms;<br>- deletes any file still holding one, prints its path and exits 1; otherwise exits 0 | PYSYN. SCRATCH, on a synthetic folder with fake secrets in a text file, a zip and an HTML file with an embedded base64 zip:<br>- all are redacted, exit 0;<br>- a fake secret stored base64-encoded inside a plain text file (a form the redaction does not cover) gives exit 1, with that file deleted;<br>- an empty `HA_PASSWORD` gives exit 2.<br>UT count unchanged (the file is not discovered) | none | done | PYSYN OK; SCRATCH (fake secrets): text, zip, nested zip, HTML embedded data redacted, exit 0; empty HA_PASSWORD exit 2; user-accepted deviation 2026-10-20: the base64 miss case replaced by fault injection (redaction disabled in a scratch copy), exit 1 with files deleted; fix round 1: truncated zip and truncated embedded payload deleted, exit 1, other files still processed; UT 64 OK; reviewer CONFORMS, 0 BLOCKING. Pending user decision: keep or remove the usage/missing-folder exit 2 |
| T2.6 | `tests/e2e/run.sh`:<br>- loads `tests/e2e/.env` with `set -a` so values are exported;<br>- checks that `HA_URL`, `HA_TOKEN`, `HA_USERNAME` and `HA_PASSWORD` are set and `E2E_CONFIRM_TEST_INSTANCE` is `yes`, printing missing names only and exiting 2 before Playwright;<br>- creates `test-history/YYYYMMDD-HHMMSS/`;<br>- exports `PW_RUN_DIR` as that folder, `PW_OUTPUT` as its `test-output/`, `PW_HTML` as its `html-report/` and `PW_JSON` as its `results.json`, then runs `npx playwright test` with `output.log` via `tee`;<br>- runs `redact_results.py` on the folder;<br>- exits non-zero if Playwright or redaction failed.<br>No hook, schedule or other trigger starts it (R3) | BASHN. Only if `test ! -e tests/e2e/.env` holds (the file is never opened; if it exists, this check is skipped and recorded): `bash tests/e2e/run.sh` prints that the env file is missing and exits 2 without starting Playwright. Reviewer confirms no hook or schedule was added (R3) | T2.4, T2.5 | done | BASHN exit 0; with no tests/e2e/.env (checked with test ! -e, never opened): printed env file missing, exit 2, no run folder, Playwright not started; no git hooks, no CI, no package scripts (R3); UT 64 OK; reviewer CONFORMS, 0 BLOCKING |
| T2.7 | `tests/e2e/prerequisites.md`: the standing prerequisite that `HA_USERNAME` is an HA administrator, and no entities. `tests/e2e/prerequisites.json` committed as `{}` | both files exist with that content | none | todo | |

## WP3: Fresh start
All in `tests/e2e/tests/fresh-start.setup.ts`, as serial setup tests, each within 90 s.
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T3.1 | Setup test "simulated devices":<br>- delete any leftover `e2e_` helpers and their config entries;<br>- create `input_boolean.e2e_house_occupied`, `input_boolean.e2e_hot_water`, `input_boolean.e2e_heater`, `input_number.e2e_room_temp`, the template sensor `sensor.e2e_room_temperature` (device class temperature) and the generic thermostat `climate.e2e_thermostat`;<br>- set the thermostat to `heat` | PWLIST; E2E: this setup test passes, the entities exist with those ids, and `climate.e2e_thermostat` is in `heat` | T2.3, T2.6, U1, U2, U3 | todo | |
| T3.2 | Setup test "card resources and dashboard":<br>- list resources;<br>- add each of the four `/environmental_scheduler/static/...` URLs when that exact URL (ignoring `?v=`) is missing;<br>- stop, naming the resource, if one with the same path tail sits under another prefix;<br>- never remove a resource;<br>- create or replace the dashboard `e2e-test` with the four cards, and touch no other dashboard | PWLIST; E2E: this setup test passes and `e2e-test` shows the four cards; reviewer confirms the duplicate-stop path (R7a) and that only `e2e-test` is written (PB5) | T3.1 | todo | |
| T3.3 | Setup test "fresh addition":<br>- in the browser, log in, remove the integration if present, and add it through Add integration;<br>- check that no `e2e_` room remains and that the 12 seeded rooms are present (R5, PB3) | PWLIST; E2E: this setup test passes | T3.2, T1.3 | todo | |
| T3.4 | Setup test "delete seeded rooms": in the browser options flow, delete every seeded room | PWLIST; E2E: this setup test passes and the integration has no rooms | T3.3 | todo | |
| T3.5 | Setup test "configure from zero":<br>- in the browser options flow, add `e2e-heating` (climate, sensor), `e2e-hot-water` (hot water) and `e2e-follower`;<br>- set the house occupancy entity in global settings;<br>- through `update_room`, set follow on `e2e_follower` (D6).<br>This leaves the baseline state of plan section 2 | PWLIST; E2E: this setup test passes and `get_rooms` returns exactly the three rooms with the expected entities and follow flags, the occupancy entity is `input_boolean.e2e_house_occupied`, and that helper is `off`. A second E2E run straight afterwards passes T3.3's check that no `e2e_` room remains, which proves that removal deleted the first run's rooms (R4) | T3.4 | todo | |

## WP4: Scenarios
Each test is titled "N. User: when I ..., I should see ...", from the scenario tables (tasks amendment 001.1 for 1 to 21, spec 002 R8 for 22 and 23). Each test clears the day it uses and restores any baseline state it changes, pass or fail.
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T4.1 | `automation.spec.ts`, through the API: scenarios 1 to 9 and 11, with `block_changed` events collected through `subscribe_events` | PWLIST lists 10 tests in `automation.spec.ts`; E2E: all 10 pass | T3.5 | todo | |
| T4.2 | `installer.spec.ts`, in the browser: scenario 10.<br>- Choose `input_boolean.e2e_house_occupied`, then change to `input_boolean.e2e_hot_water`, then clear it, checking after each save that the stored value matches.<br>- The picker offers the on/off types present, and does not offer `sensor.e2e_room_temperature`, `input_number.e2e_room_temp` or `climate.e2e_thermostat`.<br>- Set it back to `input_boolean.e2e_house_occupied` at the end | PWLIST lists 1 test in `installer.spec.ts`; E2E: it passes | T3.5 | todo | |
| T4.3 | `developer-tools.spec.ts`, in the browser: scenario 12 | PWLIST lists 1 test in `developer-tools.spec.ts`; E2E: it passes | T3.5 | todo | |
| T4.4 | `household.spec.ts`, in the browser on `e2e-test`: scenarios 13 to 18 (schedule editor and room config card) | PWLIST lists 6 tests in `household.spec.ts`; E2E: all 6 pass | T3.5 | todo | |
| T4.5 | `household.spec.ts`, in the browser on `e2e-test`: scenarios 19 to 21 (overview cards) | PWLIST lists 9 tests in `household.spec.ts`; E2E: the 3 new tests pass | T4.4 | todo | |
| T4.6 | `thermostat.spec.ts`, through the API on `e2e_heating`:<br>- scenario 22: a block covering now, and the target is set within 75 s;<br>- scenario 23: its own block, the room temperature at least 2 °C below the target, and the heater turns on | PWLIST lists 2 tests in `thermostat.spec.ts`; E2E: both pass | T3.5 | todo | |
| T4.8 | Full run:<br>- one E2E run with every setup test and all 23 scenarios;<br>- the user approves benchmark values from `benchmarks.proposed.json`, which are committed to `benchmarks.json`;<br>- tasks amendment 001.1 T3.8, T4.6 and T5.3 are marked done with this run as evidence | E2E: the summary shows 23 PASS, exit 0, redaction exit 0; the run folder holds `output.log`, `results.json`, `html-report/`, `durations.json` and `benchmarks.proposed.json` (R9, R10c); the user approves the benchmark values; the three 001.1 rows are updated | T4.1 to T4.6, T2.7 | todo | |

## WP5: Constitution
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T5.1 | Draft `.sdd/constitution.3-e2e-test-command.md`:<br>- E2E test command `bash tests/e2e/run.sh`;<br>- in the test runner notes, replace amendment 1's manual-checklist sentence, and name Node, Playwright 1.60.0, Chromium, `ws`, and Python stdlib for redaction | the user approves the amendment | T2.6 | todo | |

Status values: todo, doing, done, blocked. (T4.7 is not used, to avoid confusion with tasks amendment 001.1 T4.7.)

## Coverage check
| Requirement | Tasks |
|---|---|
| R1 single runner | T2.6 |
| R2 env checks (amendment 002.1) | T2.6 (the refusal without the confirmation line is an accepted gap) |
| R3 no automatic start | T2.6 |
| R4 removal deletes data | T1.2, T1.3, T3.5 (second-run check) |
| R4a user deploys | U1 |
| R5 fresh addition in the browser | T3.3 |
| R6 configure from zero | T3.4, T3.5 |
| R6a simulated devices | T3.1 |
| R6b prerequisites | T2.7 |
| R7 dashboard | T3.2 |
| R7a resources | T3.2 |
| R8 23 scenarios | T4.1 to T4.6, T4.8 |
| R9 results folder | T2.2, T2.6, T4.8 |
| R10 carry on, summary, exit code | T2.2, T2.4, T2.6 |
| R10a browser for user actions, API for engine | T4.1 to T4.6 |
| R10b timeouts | T2.2 |
| R10c benchmarks | T2.4, T4.8 |
| R10d redaction (amendment 002.1) | T2.2 (`outputDir` in the run folder), T2.5, T2.6 |
| R11 gitignore | T2.1 |
| R12 constitution amendment | T5.1 |
| R13 add a scenario file without changing the runner | T2.2 |
| R14 package file and pins | T2.1 |
| PB1 unit tests unchanged | T1.1, T2.1, T2.5 |
| PB2 unload keeps data | T1.2, T1.3 |
| PB3 seeding | T3.3 |
| PB4 behaviour unchanged | T4.1 to T4.6 |
| PB5 no other dashboard touched | T3.2 |
| Tasks amendment 001.1 (spec 001 scenarios 1 to 21) | T4.8 |
