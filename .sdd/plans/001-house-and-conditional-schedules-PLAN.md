# Plan 001: House and conditional schedules

Status: APPROVED 2026-10-19
Implements: .sdd/specs/001-house-and-conditional-schedules.md (no amendments)
Open questions: 0

## 1. Architecture
The change follows the existing layers and adds no new component:
- **Models** (`models.py`): `Block` gains `occupied_temperature`; `Room` gains `follow_house_schedule`; `SystemConfig` gains `house_occupancy_entity`.
- **Store** (`storage.py`): holds one house weekly schedule beside the rooms. Block operations take a target that is either a room id or the house. Two new helpers sit at the centre of the feature:
  - `effective_days(room)`: the house schedule when the room follows it, else the room's own `weekly_schedule`.
  - `resolve_block(block)`: returns `(temperature, reason)`, using `occupied_temperature` and `schedule_occupied` when the block has one and the house is occupied, else `block.temperature` and `schedule`.
  `get_active_block`, `get_upcoming_blocks` and the scheduler all go through these helpers, so the rule lives in one place.
- **Scheduler** (`scheduler.py`): iterates `effective_days`, applies `resolve_block` at pre-heat, and treats both schedule reasons as hot water on.
- **Services** (`services.py`, `services.yaml`): optional `schedule: room | house` on block services, `occupied_temperature` on commit, `following_house` on reads, `schedule` key on `block_changed`, and the `update_room` omitted-field fix.
- **Options flow** (`options_flow.py`, `strings.json`, `translations/en.json`): one optional entity field on the existing Global settings step.
- **Cards** (`www/`): schedule editor (House entry, occupied field, read-only following view, status pill, badge), room config card (toggle), overview engine, default card and LCARS skin (reason label).

## 2. Data and interfaces
**Storage** (`.storage/environmental_scheduler`, same key and version):
```
{
  "config": { ...existing, "house_occupancy_entity": "binary_sensor.house_occupied" | null },
  "rooms": [ { ...existing, "follow_house_schedule": false,
               "weekly_schedule": { "monday": [ { ...existing, "occupied_temperature": 20.0 | null } ] } } ],
  "house_schedule": { "monday": [ { ...block } ], ..., "sunday": [] }
}
```
Every new key is read with a default when missing (`false`, `null`, empty days), so existing data loads unchanged (R17). No storage version bump.

**Validation:** `Block.validate` checks `occupied_temperature`, when not null, with the same range (5 to 35°C) and 0.5°C step as `temperature` (R5, PB2).

**Services:**
| Service | Change |
|---|---|
| `commit_block`, `commit_block_force` | `room` becomes optional; new optional `schedule` (`room`, `house`) and `occupied_temperature` (number or null). `schedule: house` ignores `room`; otherwise a missing `room` is a `ServiceValidationError` |
| `delete_block`, `toggle_block`, `copy_day` | `room` optional; new optional `schedule`, same rule. `copy_day` and trim carry `occupied_temperature` |
| `get_blocks` | new optional `schedule`. House: `{room: null, house: true, schedule: {...}}` or `{room: null, house: true, day, blocks}` (D3). Room without `schedule`: effective blocks plus `following_house`. Room with `schedule: room`: own stored blocks plus `following_house` (R11) |
| `get_upcoming_blocks` | uses `effective_days`; adds `following_house` to the response |
| `get_active_block`, `get_house_status` | unchanged shape; reason may be `schedule_occupied` |
| `update_room` | list fields lose `default=[]`; every field is written only when present in the call (R13); new optional `follow_house_schedule` (boolean) |

**Events:** `block_changed` gains `schedule` (`room` or `house`); `room` is null for house edits (R12). `pre_block_start` and `room_changed` payloads are unchanged apart from `block.occupied_temperature` (PB6).

**Occupancy:** `SchedulerStore.house_occupied()` returns true only when `house_occupancy_entity` is set and `hass.states.get(entity).state == "on"` (R6, Q1).

**Options flow:** Global settings gains `vol.Optional("house_occupancy_entity", description={"suggested_value": ...})` with an entity selector limited to `binary_sensor`, `input_boolean`, `switch`. A `suggested_value` (not a `default`) lets the user clear it. The label is added identically to `strings.json` and `translations/en.json` (R18).

**Cards:**
- Schedule editor: a "House" option first in the picker (an internal UI value, not a room id), calls made with `schedule: 'house'`. When `get_blocks` returns `following_house: true`, the week renders read-only with "Following house schedule". With House selected, the status line is computed in the card from the house blocks for the current day and time, and shows the active block or "No active block" (R14). The badge reads `house_mode` from `get_house_status` (D4). The status pill maps `schedule_occupied` to "schedule (occupied)" (D4). The block dialog gets an optional "If house occupied" temperature with the same 0.5°C stepper and a clear control.
- Room config card: a "Follow house schedule" toggle, shown for heating and hot water rooms, written into the existing draft (R3, R15).
- Overview engine and LCARS skin: `schedule_occupied` label "Schedule (occupied)", LCARS colour `#66ff99`. Default card: label "schedule (occupied)", colour `#4caf50` (R16). The existing full reload on `block_changed` is kept and checked to work with `room: null` (R12).

## 3. Decisions
| Decision | Options | Choice and reason |
|---|---|---|
| D1 Test strategy | manual checklist only; stdlib `unittest` with HA stubs plus manual checklist; HA test container driven by API; `pytest-homeassistant-custom-component` | stdlib `unittest` in `tests/` with minimal HA stubs, plus a manual checklist on the user's HA test container. Chosen by the user: it runs autonomously in this session (Python 3.11, no pip, no Docker); the test container is not running or reachable, and pytest-HA needs Python 3.13 and pip. Needs constitution amendment `.sdd/constitution.1-unit-test-command.md` |
| D2 House occupancy entity location (spec gap F5) | new field on Global settings; new menu step | Optional field on the existing Global settings step, stored as `SystemConfig.house_occupancy_entity`. Chosen by the user: one field, no new menu entry |
| D3 `get_blocks` house response (spec gap F7) | `room: null, house: true`; `room: null` only; rename weekly key | `{room: null, house: true, schedule: {...}}` and the single-day form with `day, blocks`. Chosen by the user: matches the event, explicit, keeps existing keys |
| D4 Editor status pill and badge (spec gap F2) | label plus badge from `get_house_status`; label plus hidden badge | Pill maps `schedule_occupied` to "schedule (occupied)"; with House selected the badge reads `house_mode` from `get_house_status`. Chosen by the user |
| D5 Where the house schedule is stored | top-level `house_schedule` key; inside `SystemConfig` | Top-level key beside `rooms`: a schedule is not config, and `SystemConfig` stays flat. Technical choice, no behaviour difference |
| D6 How block operations reach the house | parallel house methods; one method with a target | Store block methods take a target (`room_id` or none for house) and work on `_days_for(target)`. Avoids duplicating six code paths (constitution principle: simplicity). Technical choice |
| D7 Where the occupancy rule lives | inline in each caller; one `resolve_block` helper | One `resolve_block` helper used by `get_active_block` and `_apply_block`, so R7 and R9 cannot drift apart. Technical choice |

## 4. Test strategy
**Automated (stdlib `unittest`, `python3 -m unittest discover -s tests`, after each task):**
- `tests/ha_stubs.py` registers minimal fake `homeassistant.core`, `homeassistant.helpers.storage` and `homeassistant.helpers.event` modules in `sys.modules`, with a fake `hass` whose `states.get()`, `bus.async_fire` and `services.async_call` are controllable and recorded. It does not import the package (that would run `__init__.py`, which needs `voluptuous` and the HTTP component): it registers a synthetic package module for `environmental_scheduler` and loads `const`, `models`, `storage` and `scheduler` by file path so their relative imports resolve. No third-party packages.
- `tests/test_models.py`: `occupied_temperature` validation (range, 0.5 steps, null), `to_dict`/`from_dict` round trip with and without new keys, `follow_house_schedule` default.
- `tests/test_storage.py`: load of old-format data (R17); house schedule save and load (R1); house block commit, overlap and trim keep `occupied_temperature` (PB3); `effective_days` for following and non-following rooms (R4); resolution with occupancy on, off, unavailable, missing and unset (R6, R7, Q1); resolution order unchanged for vacation, away and persons away (PB1); following room with no active house block gives fallback (R4); `get_upcoming_blocks` for a following room (R11).
- `tests/test_scheduler.py`: hot water on for `schedule` and `schedule_occupied`, off otherwise (R10); pre-heat sets occupied temperature when occupied, base otherwise (R9); `pre_block_start` fires for house blocks of a following room with `room` set to the room id (PB6, R4); occupancy change mid-block updates the target on the next tick (R8).
- The reported test count must rise with each task that adds tests (V7).

**Manual checklist on the HA test container** (user deploys `beta`, restarts, then runs the listed calls in Developer Tools and dashboard steps; each work package lists its checks with expected results):
- Services and schemas (R2, R3, R11, R12, R13): exact service calls and expected responses and events.
- Options flow (R6, R18): set, change and clear the entity; picker domains.
- Cards (R14, R15, R16): editor House entry, read-only following view, occupied field, status pill and badge; room config toggle; overview label in default and LCARS skins.

## 5. Work packages
| WP | Scope | Outputs |
|---|---|---|
| WP1 | Test harness, models and store: new fields, house schedule storage, target-based block operations, `effective_days`, `house_occupied`, `resolve_block`, `get_active_block`, `get_upcoming_blocks`, trim carry-over. Covers R1, R4 (store), R5, R6 (state read), R7, R11 (store), R17; PB1 to PB5, PB7, PB8 | `models.py`, `storage.py`, `tests/ha_stubs.py`, `tests/test_models.py`, `tests/test_storage.py` |
| WP2 | Scheduler: effective blocks in `_process_room`, `resolve_block` at pre-heat, hot water reason check. Covers R4 (tick), R8, R9, R10; PB6, PB10, PB11 | `scheduler.py`, `tests/test_scheduler.py` |
| WP3 | Services and options flow: `schedule` parameter, `occupied_temperature`, `following_house`, house `get_blocks` shape, `block_changed` payload, `copy_day` carry-over, `update_room` fix and `follow_house_schedule`, options field, strings, `services.yaml`. Covers R2, R3 (service), R6 (options), R11, R12 (payload), R13, R18; PB4 (copy and toggle in the handlers; checklist includes a `copy_day` carry-over check), PB9 | `services.py`, `services.yaml`, `options_flow.py`, `strings.json`, `translations/en.json`, manual checklist |
| WP4 | Schedule editor and room config cards: House entry, occupied field, read-only following view, house status line, status pill label, badge from `get_house_status`, follow toggle. Covers R3 (UI), R14, R15; D4 | `www/environmental-scheduler-card.js`, `www/environmental-scheduler-room-config-card.js`, manual checklist |
| WP5 | Overview engine, default overview card, LCARS skin: `schedule_occupied` label and colour, full reload with `room: null`. Covers R12 (refresh), R16 | `www/engine/overview-engine.js`, `www/environmental-scheduler-overview-card.js`, `www/skins/lcars/overview-card.js`, manual checklist |

Requirement coverage: R1 WP1; R2 WP3; R3 WP3, WP4; R4 WP1, WP2; R5 WP1; R6 WP1, WP3; R7 WP1; R8 WP2; R9 WP2; R10 WP2; R11 WP1, WP3; R12 WP3, WP5; R13 WP3; R14 WP4; R15 WP4; R16 WP5; R17 WP1; R18 WP3.

## 6. Risks
- **Stubs drift from real HA.** Tests pass against fakes while real HA behaves differently (for example `hass.states.get` or `Store`). Mitigation: stubs cover only the calls the code makes, and every work package's manual checklist runs on the real test container.
- **Manual checks depend on the test container.** It is currently created but not running, with no reachable config path. Mitigation: WP1 and WP2 are fully covered by automated tests; WP3 to WP5 checks wait for the user to deploy and are recorded as pending, not passed, until run.
- **Downgrade loses new data.** An older integration version loads the new storage (extra keys are ignored) but drops `house_schedule`, `follow_house_schedule`, `occupied_temperature` and `house_occupancy_entity` on its next save. Mitigation: no downgrade path is built (not in the spec); a note for the release step under the release policy, outside this plan.
- **Making `room` optional on block schemas** moves the "room missing" error from voluptuous to the handler. Mitigation: the handler raises `ServiceValidationError` with a clear message; covered by the WP3 checklist.
- **Options flow default blocks clearing.** A `default=` on an entity selector cannot be cleared in the HA UI. Mitigation: use `description={"suggested_value": ...}` (section 2) and check clearing in the WP3 checklist.
- **`update_room` fix changes callers that relied on omitting a list to clear it.** No caller does this today (the overview card sends full lists, the room config card sends drafts). Mitigation: clearing stays possible by sending an empty list.

## 7. Open questions
None.
