# Tasks 001: House and conditional schedules

Status: APPROVED 2026-10-19
Implements: .sdd/plans/001-house-and-conditional-schedules-PLAN.md
Rules: one commit per task on the working branch; a failing test is fixed and retried up to 3 times, then stop and report.

Checks used below (all run in this session; none writes project files except Python bytecode caches `__pycache__`, which the SDD guard ignores):
- **UT**: `python3 -m unittest discover -s tests` (constitution amendment 1). Every task that adds tests must raise the reported test count (V7).
- **PYSYN FILE**: `python3 -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" FILE` exits 0.
- **JSSYN FILE**: `node --experimental-default-type=module --check FILE` exits 0. Confirmed working on all `www/` files with Node v20.20.2 on 2026-10-19.
- **MANUAL**: checklist items run by the user on the HA test container after deploying `beta`; recorded as pending in Evidence until the user reports results. A MANUAL task is `done` only when the user reports every item passed.

Paths are relative to `custom_components/environmental_scheduler/` unless they start with `tests/`.

## WP1: Test harness, models and store
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T1.1 | Add `tests/ha_stubs.py`: fake `homeassistant.core`, `homeassistant.helpers.storage` (in-memory `Store` with `async_load`/`async_save`), `homeassistant.helpers.event` (`async_track_time_interval` recorder); fake `hass` with controllable `states.get`, recorded `bus.async_fire` and `services.async_call`; synthetic `environmental_scheduler` package loading `const`, `models`, `storage`, `scheduler` by file path. Add `tests/test_harness.py` (part of plan D1) with a smoke test that the four modules load and a `SchedulerStore` loads and saves empty data | UT passes with at least 1 test; `__init__.py` is not executed (smoke test asserts `voluptuous` is not imported) | none | todo | |
| T1.2 | `Block.occupied_temperature` (default `None`): `new()` parameter, `validate()` checks range 5 to 35 and 0.5 steps when not null, `to_dict`/`from_dict` with default when missing | UT in `tests/test_models.py`: valid, out-of-range, non-0.5, null, round trip, old dict without the key; count rises | T1.1 | todo | |
| T1.3 | `Room.follow_house_schedule` (default `False`) and `SystemConfig.house_occupancy_entity` (default `None`) in dataclass, `to_dict`, `from_dict` | UT in `tests/test_models.py`: defaults, round trip, old dicts without the keys load, `occupancy_entity` survives the round trip unchanged (PB8); count rises | T1.1 | todo | |
| T1.4 | Store holds `house_schedule` (all seven days, empty by default); `async_load` reads it with default when missing; `async_save` writes it | UT in `tests/test_storage.py`: save then load keeps house blocks; old-format data (no `house_schedule`) loads with empty house days and unchanged rooms; count rises | T1.1 | todo | |
| T1.5 | Store block operations take a target (room id, or `None` for house) via `_days_for(target)`: `get_blocks`, `check_overlaps`, `commit_block`, `delete_block`; `_apply_trim` carries `occupied_temperature`. Public accessors `get_day(target, day)` and `set_day(target, day, blocks)` for one target day, used later by `toggle_block` and `copy_day`. Room behaviour unchanged | UT in `tests/test_storage.py`: house commit, overlap report, forced trim and delete on house; invalid house block and invalid `occupied_temperature` rejected (PB2); trimmed room and house blocks keep `occupied_temperature`; `get_day`/`set_day` on room and house; existing room path tests pass; count rises | T1.2, T1.4 | todo | |
| T1.6 | Store helpers `effective_days(room)`, `house_occupied()` (true only when entity set and state `on`), `resolve_block(block)` returning `(temperature, reason)` | UT in `tests/test_storage.py`: following and non-following `effective_days`; `house_occupied` for `on`, `off`, `unavailable`, `unknown`, missing entity, unset; `resolve_block` with and without `occupied_temperature` when occupied and not; count rises | T1.3, T1.5 | todo | |
| T1.7 | `get_active_block` uses `effective_days` and `resolve_block` at the schedule step only | UT in `tests/test_storage.py`: vacation, away and persons away unchanged (PB1); `schedule` vs `schedule_occupied` with target values; following room uses house block; following room with no active house block returns room fallback; return keys unchanged (PB5); count rises | T1.6 | todo | |
| T1.8 | `get_upcoming_blocks` uses `effective_days` | UT in `tests/test_storage.py`: following room returns house blocks; non-following unchanged; count rises | T1.6 | todo | |

## WP2: Scheduler
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T2.1 | `_control_hot_water`: on for `schedule` and `schedule_occupied`, off otherwise | UT in `tests/test_scheduler.py`: recorded `services.async_call` is `turn_on` for both schedule reasons and `turn_off` for `away`, `fallback`, `vacation`, `persons_away`; count rises | T1.7 | todo | |
| T2.2 | `_process_room` iterates `effective_days(room)` for today | UT in `tests/test_scheduler.py`: following room fires `pre_block_start` for a house block with `room` = the room id and `block.occupied_temperature` present; non-following unchanged; count rises | T1.6 | todo | |
| T2.3 | `_apply_block` sets the temperature from `resolve_block` at pre-heat | UT in `tests/test_scheduler.py`: occupied at pre-heat sets `occupied_temperature`; not occupied or no occupied value sets base; `_apply_current_state` still runs after it in the same tick (PB11); count rises | T2.2 | todo | |
| T2.4 | Test only: occupancy change during an active block | UT in `tests/test_scheduler.py`: with `node_red_mode` false, tick with occupancy off sets base, flip state to `on`, next tick sets occupied temperature (R8); count rises | T2.3 | todo | |

## WP3: Services and options flow
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T3.1 | Schemas: `room` optional and `schedule` (`room`, `house`) optional on `commit_block`, `commit_block_force`, `delete_block`, `toggle_block`, `copy_day`, `get_blocks`; `occupied_temperature` (number or null, 5 to 35) on the commit schema | PYSYN `services.py`; UT passes | T1.5 | todo | |
| T3.2 | Handlers `commit_block`, `commit_block_force`, `delete_block`, `toggle_block`: shared target helper routes `schedule: house` to the house (ignoring `room`) and raises `ServiceValidationError` when `room` is missing otherwise; `occupied_temperature` passed into the block; `toggle_block` uses the store `get_day` accessor; `block_changed` carries `schedule` and `room` (null for house) | PYSYN `services.py`; UT passes | T3.1 | todo | |
| T3.3 | `copy_day` handler: same target helper; copied blocks keep `occupied_temperature`; writes via store `set_day`; `block_changed` per target day with `schedule` and `room` | PYSYN `services.py`; UT passes | T3.2 | todo | |
| T3.4 | `get_blocks` handler: same target rule; house returns `{room: null, house: true, schedule}` or `{room: null, house: true, day, blocks}`; room without `schedule` returns effective blocks and `following_house`; room with `schedule: room` returns own blocks and `following_house`. `get_upcoming_blocks` adds `following_house` | PYSYN `services.py`; UT passes | T1.8, T3.2 | todo | |
| T3.5 | `update_room`: remove `default=[]` from list fields; write every field only when present; add optional `follow_house_schedule` (boolean) | PYSYN `services.py`; UT passes | T1.3 | todo | |
| T3.6 | Options flow Global settings: optional `house_occupancy_entity` with entity selector (`binary_sensor`, `input_boolean`, `switch`) using `suggested_value`; empty input stores `None`; label added identically to `strings.json` and `translations/en.json` | PYSYN `options_flow.py`; `python3 -c` check that both JSON files parse, are identical, and contain `options.step.global_settings.data.house_occupancy_entity` | T1.3 | todo | |
| T3.7 | `services.yaml`: add full entries (existing and new fields) for `commit_block`, `commit_block_force`, `delete_block`, `toggle_block`, `copy_day` and `update_room` (user decision 2026-10-19, tasks validation F1); `get_blocks` gains `schedule` and its `room` becomes `required: false`; `occupied_temperature` on both commit services; `follow_house_schedule` on `update_room`; note that on a following room, edits without `schedule` change its own blocks and reading them back needs `schedule: room` | stdlib `python3 -c` text scan splitting `services.yaml` on top-level keys finds `schedule:` in each of the six block service entries, `occupied_temperature:` in both commit entries and `follow_house_schedule:` in `update_room` | T3.1 to T3.5 | todo | |
| T3.8 | MANUAL checklist WP3 on the test container: (a) `commit_block` with `schedule: house` creates a house block, event `block_changed` has `room: null, schedule: house`; (b) `commit_block_force`, `delete_block`, `toggle_block` with `schedule: house` work on house blocks (PB3, PB4); (c) a room edit's `block_changed` carries the room id and `schedule: room`; (d) `room` omitted without `schedule` gives a clear error; (e) `get_blocks schedule: house` returns `room: null, house: true`; (f) following room: `get_blocks` returns house blocks with `following_house: true`, with `schedule: room` its own blocks; `get_upcoming_blocks` returns `following_house`; (g) `schedule: room` edits on a following room change its own blocks; (h) a room named "House" (id `house`) is unaffected by house calls; (i) `copy_day` on a block with `occupied_temperature` keeps it on target days; (j) `update_room` with only `follow_house_schedule` leaves lists unchanged; (k) options flow: set, change and clear the occupancy entity; picker offers only the three domains; (l) `get_active_block` returns `schedule_occupied` with occupancy entity on; (m) Developer Tools shows the new `services.yaml` fields | user reports all items passed | T1.7, T3.1 to T3.7 | todo | |

## WP4: Schedule editor and room config cards
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T4.1 | Schedule editor: "House" first in the picker (internal UI value that cannot clash with room id `house`); with House selected, all block calls (including `copy_day`) send `schedule: 'house'` | JSSYN `www/environmental-scheduler-card.js` | T3.3, T3.4 | todo | |
| T4.2 | Schedule editor, House selected: status line shows the house's active block now or "No active block", computed in the card from house blocks; badge reads `house_mode` from `get_house_status` | JSSYN `www/environmental-scheduler-card.js` | T4.1 | todo | |
| T4.3 | Block dialog: optional "If house occupied" temperature with 0.5 stepper and clear; sent as `occupied_temperature` (null when cleared); shown when editing an existing block | JSSYN `www/environmental-scheduler-card.js` | T4.1, T3.2 | todo | |
| T4.4 | Following room view: when `following_house` is true, render week read-only (no add, edit or copy handlers) with "Following house schedule"; status pill maps `schedule_occupied` to "schedule (occupied)" | JSSYN `www/environmental-scheduler-card.js` | T4.1 | todo | |
| T4.5 | Room config card: "Follow house schedule" toggle for heating and hot water rooms, written to the draft and saved via `update_room` | JSSYN `www/environmental-scheduler-room-config-card.js` | T3.5 | todo | |
| T4.6 | MANUAL checklist WP4: (a) House entry edits house blocks; (b) a room named "House" still appears and edits its own blocks; (c) occupied field saves, shows on reopen, clears; (d) following room shows house blocks read-only with "Following house schedule"; (e) status pill shows "schedule (occupied)" when occupied; (f) House selected: status line and badge as specified; (g) toggle on heating and hot water rooms, save keeps other room fields | user reports all items passed | T1.7, T4.1 to T4.5 | todo | |

## WP5: Overview engine, default card, LCARS skin
| ID | Task | Done when | Depends | Status | Evidence |
|---|---|---|---|---|---|
| T5.1 | Overview engine `REASON_LABELS` adds `schedule_occupied: 'Schedule (occupied)'`; default overview card `REASON_LABELS` adds `'schedule (occupied)'` and `reasonColor` maps it to `#4caf50` | JSSYN on `www/engine/overview-engine.js` and `www/environmental-scheduler-overview-card.js`; Evidence records the file and line of each `block_changed` subscription and shows its handler ignores the payload (full reload with `room: null`) | T3.2 | todo | |
| T5.2 | LCARS skin `REASON_COLORS` adds `schedule_occupied: '#66ff99'` and shows the engine label | JSSYN `www/skins/lcars/overview-card.js` | T5.1 | todo | |
| T5.3 | MANUAL checklist WP5: (a) default overview shows "schedule (occupied)" in green for an occupied block; (b) LCARS shows "Schedule (occupied)" in `#66ff99`; (c) a house block edit refreshes both overviews | user reports all items passed | T1.7, T5.1, T5.2 | todo | |

Status values: todo, doing, done, blocked.

## Coverage check
| Requirement | Tasks |
|---|---|
| R1 | T1.4 |
| R2 | T1.5, T3.1, T3.2, T3.3, T3.4, T3.8 |
| R3 | T1.3, T3.5, T4.5, T4.6 |
| R4 | T1.6, T1.7, T2.2 |
| R5 | T1.2, T2.2, T3.1, T3.2, T3.8, T4.3 |
| R6 | T1.3, T1.6, T3.6, T3.8 |
| R7 | T1.6, T1.7 |
| R8 | T2.4 |
| R9 | T2.3 |
| R10 | T2.1 |
| R11 | T1.8, T3.4, T3.8 |
| R12 | T3.2, T3.3, T3.8, T5.1, T5.3 |
| R13 | T3.5, T3.8 |
| R14 | T4.1, T4.2, T4.3, T4.4, T4.6 |
| R15 | T4.5, T4.6 |
| R16 | T5.1, T5.2, T5.3 |
| R17 | T1.2, T1.3, T1.4, T1.6 |
| R18 | T3.6, T3.7 |
| PB1, PB5 | T1.7 |
| PB2 | T1.2, T1.5 |
| PB3 | T1.5, T3.8 |
| PB4 | T1.5, T3.2, T3.3, T3.8 |
| PB6 | T2.2 |
| PB7 | T1.4 |
| PB8 | T1.3 |
| PB9 | T3.2, T3.4 |
| PB10 | T2.1 |
| PB11 | T2.3 |
| Plan D1 (harness) | T1.1 |
| Plan D2 | T3.6 |
| Plan D3 | T3.4 |
| Plan D4 | T4.2, T4.4 |
