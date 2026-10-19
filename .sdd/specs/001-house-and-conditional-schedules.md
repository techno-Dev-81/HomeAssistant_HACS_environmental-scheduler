# 001: House and conditional schedules

Status: APPROVED 2026-10-19
Derives from: constitution (approved 2026-10-19); user brief 2026-10-19
Open questions: 0

## 1. Brief
**Problem:** Each room has its own weekly schedule of fixed-temperature blocks. A house where most rooms share one routine has to enter it room by room, and a block cannot change its temperature based on whether anyone is home.
**Who:** The household member configuring heating from the Home Assistant dashboard.
**Why now:** The user wants a whole-house weekly schedule that rooms can follow, and blocks that set an alternative temperature when the house is occupied (for example at 17:00 set 18°C, or 20°C if the house is occupied).

## 2. Pre-spec gate
1. **Entry point:** Schedule editor card (`environmental-scheduler-card`) through the existing block services; room config card (`environmental-scheduler-room-config-card`) through `update_room`; options flow (house occupancy entity); scheduler minute tick (`scheduler.py`); direct HA service calls from Node-RED or automations.
2. **Existing behaviour audit:** `storage.get_active_block` resolves vacation, away, persons away, schedule, fallback, and returns `{active_block, target_temperature, reason}`. `Block.validate` enforces start before end, 30 minute minimum, 5 to 35°C, 0.5°C steps. `commit_block` reports overlaps; `commit_block_force` trims or deletes existing blocks so the new block wins. `toggle_block` and `copy_day` edit a room's days. `scheduler._process_room` fires `environmental_scheduler.pre_block_start` with `block.to_dict()` and, when `node_red_mode` is false, sets the room's entities (`_apply_block` at pre-heat with `block.temperature`, then `_apply_current_state` from `get_active_block`). `Room.occupancy_entity` is stored but unused in resolution. Further side effects: `commit_block`, `commit_block_force`, `delete_block`, `toggle_block` and `copy_day` fire `environmental_scheduler.block_changed` with a `room` key, and `update_room` fires `room_changed`; the overview cards and overview engine subscribe to both to refresh. `_apply_trim` and `copy_day` rebuild blocks from id/start/end/temperature/enabled only. `scheduler._control_hot_water` turns hot water on only when `reason == "schedule"`. `get_upcoming_blocks` reads the room's own day blocks; `get_house_status` calls `get_active_block` per room. The overview engine, default overview card and LCARS skin map `reason` to labels and colours. `SCHEMA_UPDATE_ROOM` defaults omitted list fields (`climate_entities`, `temperature_sensors`, `door_entities`, `window_entities`, `persons`) to `[]` and the handler assigns them, while the room config card sends only changed fields; so a partial save today clears the omitted lists (fixed by R13). Room ids are slugs of the room name (`add_room`), so a room named "House" gets id `house`.
3. **User-facing notifications:** No user-facing notifications (out of scope). Existing HA events are touched: `pre_block_start`, `block_changed`, `room_changed` (section 5).
4. **Access/feature gating:** No access gate beyond Home Assistant's own. The new behaviour is opt-in per room (follow house), per block (occupied temperature) and per installation (house occupancy entity), with no new global gate (section 6).
5. **Navigation and layout changes:** Schedule editor card room picker gains a "House" entry; block editor gains an optional "If house occupied" temperature field; room config card gains a "Follow house schedule" toggle; schedule editor shows a following room's schedule read-only with "Following house schedule"; options flow gains a house occupancy entity; overview cards gain the "Schedule (occupied)" label.

## 3. Entry point inventory
| Name | Location | Extends existing? |
|---|---|---|
| Schedule editor card | `www/environmental-scheduler-card.js` | yes |
| Room config card | `www/environmental-scheduler-room-config-card.js` | yes |
| Options flow, house occupancy entity | `options_flow.py`, `strings.json`, `translations/en.json` | yes |
| `commit_block`, `commit_block_force`, `delete_block`, `toggle_block`, `copy_day`, `get_blocks` | `services.py`, `services.yaml` | yes (gain `schedule: room \| house`) |
| `get_upcoming_blocks` | `services.py`, `storage.py` | yes (effective schedule of a following room) |
| `get_active_block` | `services.py`, `storage.py` | yes (house schedule, occupancy, new reason) |
| `get_house_status` | `services.py` | yes (via `get_active_block`) |
| `update_room` | `services.py` | yes (follow-house setting, omitted-field fix) |
| Scheduler minute tick | `scheduler.py` | yes |
| Overview engine, default overview card, LCARS overview skin | `www/engine/overview-engine.js`, `www/environmental-scheduler-overview-card.js`, `www/skins/lcars/overview-card.js` | yes (new reason label, house-edit refresh) |

## 4. Preserved behaviours
- PB1. Resolution order vacation, away, persons away, schedule, fallback is unchanged; the house schedule and occupied temperature only affect the schedule step.
- PB2. Block validation rules (start before end, at least 30 minutes, 5 to 35°C, 0.5°C steps) apply unchanged, also to house blocks and to the occupied temperature.
- PB3. Overlap handling: `commit_block` reports overlaps and `commit_block_force` makes the new block win, unchanged, also for the house schedule. A trimmed block keeps its occupied temperature.
- PB4. `toggle_block` and `copy_day` behave unchanged; a toggled or copied block keeps its occupied temperature.
- PB5. `get_active_block` keeps the return shape `{active_block, target_temperature, reason}`; existing reason values keep their meaning.
- PB6. `pre_block_start` keeps its name and existing payload fields and fires for each room's effective schedule.
- PB7. Existing stored room schedules load unchanged; every existing room keeps its own schedule until "follow house" is set.
- PB8. `Room.occupancy_entity` is left as stored today and is not used by this feature.
- PB9. Service calls without `schedule` behave exactly as today (room schedule), except that `get_blocks` and `get_upcoming_blocks` for a following room return the house blocks (R11).
- PB10. Hot water control stays on/off only: the integration decides when the hub may turn hot water on or off; the temperature is left to the hub.
- PB11. In the same tick as pre-heat, `_apply_current_state` sets entities from current resolution right after `_apply_block`; this existing behaviour is unchanged, so R9 governs only the `_apply_block` setpoint.

## 5. Notification matrix
| Trigger | Channel | Recipient | Message |
|---|---|---|---|
| Block start (pre-heat time) | HA event `environmental_scheduler.pre_block_start` (existing) | Node-RED / automations | Existing payload; `block` includes the occupied temperature; `room` is the room id also when following the house schedule |
| Room block edited | HA event `environmental_scheduler.block_changed` (existing) | overview cards, Node-RED | Existing payload plus `schedule: "room"` |
| House block edited | HA event `environmental_scheduler.block_changed` (existing) | overview cards, Node-RED | `room: null`, `schedule: "house"`, other fields as today |
| Room updated (including follow house) | HA event `environmental_scheduler.room_changed` (existing) | overview cards, Node-RED | Existing payload, unchanged |

## 6. Access/gating matrix
| Element | Requires | Ungated user sees | Variable | Safe default |
|---|---|---|---|---|
| Follow house schedule | room setting on | room uses its own schedule | room `follow_house_schedule` | false |
| Occupied temperature | value set on a block | block uses its base temperature | block occupied temperature | none (not set) |
| House occupancy | entity chosen in options flow | occupied temperature never applies | system config house occupancy entity | none (not set) |

## 7. Navigation changes
- Schedule editor card: "House" entry at the top of the room picker, opening the same weekly day/block editor for the house schedule.
- Block editor: optional "If house occupied" temperature field.
- Room config card: "Follow house schedule" toggle (heating and hot water rooms).
- Schedule editor, room following the house: house blocks shown read-only with the line "Following house schedule".
- Options flow: house occupancy entity selector.
- Overview engine and LCARS skin: label "Schedule (occupied)"; default overview card: label "schedule (occupied)"; both use the existing schedule colour (`#4caf50` default, `#66ff99` LCARS).

## 8. Requirements
R1. The integration stores one house weekly schedule (Monday to Sunday, multiple blocks per day) in its HA storage, and it survives a restart.
R2. `commit_block`, `commit_block_force`, `delete_block`, `toggle_block`, `copy_day` and `get_blocks` accept an optional `schedule` parameter with values `room` and `house`; when omitted, edits act on the room schedule and `get_blocks` follows R11. With `house`, `room` is not required, any `room` given is ignored, and the call acts on the house schedule, with the same validation and overlap rules (PB2, PB3, PB4). A room named "House" is unaffected. With `room`, a following room's own stored blocks can still be edited.
R3. A room has a `follow_house_schedule` setting, all week, default false, set through `update_room` and the room config card. It applies to heating and hot water rooms.
R4. When a room follows the house schedule, the schedule step of resolution, the scheduler tick and pre-heat use the house blocks for that room; with no active house block the room's fallback applies. The room's own blocks stay in storage unchanged and are used again when the setting is turned off.
R5. A block (room or house) may carry an optional `occupied_temperature` (number or null), validated like a block temperature (5 to 35°C, 0.5°C steps). It is stored, returned by the block services, included in `block.to_dict()` and so in the `pre_block_start` payload, also for hot water rooms.
R6. The options flow offers one house occupancy entity, limited to the `binary_sensor`, `input_boolean` and `switch` domains. House occupancy is true only when that entity's state is `on`; any other state, or a missing entity, is not occupied. The state is read on each `get_active_block` call (so at least once per room per tick) and at pre-heat; no state listener is added.
R7. At the schedule step, if the active block has an occupied temperature and house occupancy is true, `get_active_block` returns the occupied temperature as `target_temperature` and `reason: "schedule_occupied"`; otherwise the block's base temperature and `reason: "schedule"`.
R8. When `node_red_mode` is false, a change in house occupancy during an active block updates the room's entities to the new target on the next scheduler tick.
R9. At pre-heat, when `node_red_mode` is false, `_apply_block` sets the occupied temperature if the block has one and house occupancy is true at that time, otherwise the base temperature.
R10. Hot water control treats `schedule` and `schedule_occupied` as on, and every other reason as off.
R11. For a following room, `get_blocks` without `schedule` and `get_upcoming_blocks` return the house blocks and include `following_house: true`; `get_blocks` with an explicit `schedule: room` returns the room's own stored blocks with `following_house: true`. For other rooms both return the room's blocks and `following_house: false`.
R12. `block_changed` for a house edit carries `room: null` and `schedule: "house"`; for a room edit it carries the room id and `schedule: "room"`. The overview cards' and engine's existing full refresh on `block_changed` keeps working when `room` is null.
R13. `update_room` leaves any omitted field, including `follow_house_schedule` and the list fields, unchanged in storage. Only fields present in the call are written.
R14. The schedule editor card offers a "House" entry for editing the house schedule and an optional "If house occupied" field in the block editor, and shows a following room's schedule read-only with "Following house schedule". With "House" selected, its status line shows the house schedule's active block now, or "No active block", without temperature resolution.
R15. The room config card offers a "Follow house schedule" toggle.
R16. The overview engine, default overview card and LCARS skin show `schedule_occupied` with the labels and colours in section 7 (skin parity rule).
R17. Existing stored data loads with no loss: rooms default to their own schedule, blocks without an occupied temperature behave as today, and an installation with no house occupancy entity never applies the occupied temperature. New stored fields are added with defaults when missing; there is no storage version bump.
R18. New options flow strings are added identically to `strings.json` and `translations/en.json`; `services.yaml` documents the `schedule` parameter and `occupied_temperature`, including that on a following room, edits without `schedule` change the room's own stored blocks and reading them back needs `schedule: room`.

## 9. Out of scope
- User-facing notifications.
- New HA event types (for example an event when occupancy changes a target).
- New access rules or a global on/off switch for house schedules.
- Per-room occupancy, `Room.occupancy_entity`, or conditions other than house occupancy.
- Following the house schedule on some days only.
- Integration-driven hot water temperature control (temperatures are stored and shown only).
- A new colour for `schedule_occupied`.
- Door/window sensor configuration and per-room away/fallback overrides in the options flow (constitution section 6).
- A separate house-schedule card.

## 10. Interview answers
- Q1 (scope and edge cases): Accepted: occupancy entity unavailable, unknown, missing or deleted means not occupied (base temperature); block without occupied temperature gives base and `schedule`; following room with no active house block gives room fallback; hot water following a house block with occupied temperature is on, temperatures stored only; `schedule: house` with `room` ignores `room`; `schedule: room` edits on a following room are allowed and change its stored blocks, the card stays read-only.
- Q2 (existing behaviour touched): Full list confirmed: `update_room` omitted-field fix (R13); hot water on-check widened (R10); `block_changed` gains `schedule`, `room` may be null (R12); trim and copy carry `occupied_temperature` (PB3, PB4); `get_blocks` and `get_upcoming_blocks` gain `following_house` (R11); overview cards and engine gain the reason label and house-edit refresh (R12, R16); storage gains new fields with defaults when missing, no version bump (R17).
- Q3 (integrations): Accepted: field name `occupied_temperature` (number or null) on blocks, services and `pre_block_start`; with `node_red_mode: true` the integration only fires events and Node-RED reads `occupied_temperature` and the occupancy entity or calls `get_active_block`; options flow picker limited to `binary_sensor`, `input_boolean`, `switch`; `services.yaml` documents the `schedule` parameter and `occupied_temperature`; hot water hub gets on/off only.
- Q4 (performance): Accepted: in-memory state reads of the occupancy entity only (frequency as in R6), no listener; reaction time up to 1 minute; house edits fire the same `block_changed` events as room edits (one per call, or one per target day for `copy_day`), each causing one reload per overview card; one house schedule in the existing save path.
- Q5 (compliance): Accepted: only an entity id is stored, locally; new options flow strings in both `strings.json` and `translations/en.json`, identical; new service fields in `services.yaml`; no `hacs.json` change; version bump and tag follow the release policy, not this spec; no new dependencies.

## 11. Open questions
None.

Accepted gaps, settled in the plan (approved 2026-10-19): F2 schedule editor status pill label for `schedule_occupied` and house-mode badge with "House" selected; F5 options flow step and `SystemConfig` field name for the house occupancy entity; F7 `get_blocks` response shape for `schedule: house`.

Settled 2026-10-19: O11 with "House" selected, the editor status line shows the house schedule's active block now, or "No active block", without temperature resolution; O1 house occupancy entity in options flow; O2 follow all week; O3 new reason `schedule_occupied`; O4 hot water treated like any room, on/off control only; O5 `schedule` parameter; O6 effective blocks with `following_house`; O7 `room: null, schedule: "house"`; O8 fix omitted-field wipe; O9 occupied temperature at pre-heat; O10 reuse schedule colour.
