# Constitution: Environmental Scheduler

Status: APPROVED 2026-10-19
Project-specific rules only. The SDD rules (git, publishing, questions, agents, loops, safety) come from the installed
SDD units and cannot be relaxed here; this file may add stricter rules.

## 1. Purpose
A Home Assistant custom integration, distributed through HACS, for per-room temperature scheduling.

## 2. Project facts
| Item | Value |
|---|---|
| Language and stack | Python Home Assistant custom integration (`custom_components/environmental_scheduler/`): dataclasses (`models.py`), HA Storage API (`storage.py`), voluptuous schemas (`services.py`), HA config flow and options flow. Lovelace cards are vanilla JS custom elements with no build step (`www/`). Services expose data to Node-RED; events notify Node-RED of changes |
| Default branch | `main` (used for PRs and releases) |
| Working branch pattern | `beta` (single long-lived working branch) |
| Build command | none (no build step) |
| Unit test command | none (no test suite; baseline recorded 2026-10-19) |
| Verbose test command | none |
| E2E test command | none |
| Test runner notes | N/A - no runner exists |
| Repository URL | https://github.com/techno-Dev-81/environmental-scheduler (proposed field `repository.url`) |
| Issue tracker | GitHub issues of the repository above (proposed field `repository.issues_url`) |
| Data storage | HA storage at `.storage/environmental_scheduler` (proposed field `data.storage_path`) |
| HA manifest | domain `environmental_scheduler`, version 0.0.1, iot_class `local_push`, config_flow true, no dependencies, codeowner @techno-Dev-81 |
| License | MIT (per README) |

## 3. Principles
- The integration owns schedule storage, active temperature resolution, house mode, person presence, entity control (HA mode) and event firing.
- Node-RED is optional. It owns predictive pre-heating, learned preheat offsets, cheap-rate logic and advanced thermostat control.
- All block and schedule editing happens in the dashboard cards, not the options flow.
- The options flow holds integration-level config only: persons, room entities, global temperatures, `node_red_mode`.

## 4. Standards
- `node_red_mode: false` (default): HA controls entities directly. `node_red_mode: true`: the integration fires events only and Node-RED owns entity control.
- Room `entity_type` is derived, not stored: `hot_water` if `hot_water_entity` is set, else `heating`.
- Presence: a room heats if ANY assigned person is home; it uses the away temperature when ALL are away.
- `preheat_offset_minutes` is a Node-RED learned value and is not user-configurable in the UI.
- Temperatures: range 5 to 35°C, 0.5°C precision (TRV hardware), 2°C heating/cooling buffer.
- Blocks: minimum duration 30 minutes, no overlaps on the same day, independent schedules Monday to Sunday.
- Cards: the engine must not import from `skins/`. Parity rule: every skin implements the full feature set of the engine it wraps (see `docs/card-architecture.md`).

## 5. Branch and release policy
- Version tag format: `v0.0.x` for a patch, `v0.x.0` for a feature (proposed field `release.tag_format`).
- Tag after each logical batch of changes.
- Otherwise SDD defaults.

## 6. Out of scope
- Door/window sensor configuration in the UI: not implemented; not added unless explicitly requested.
- Per-room away/fallback temperature overrides in the options flow: not implemented; not added unless explicitly requested.

## 7. Decisions log
- 2026-10-19: Onboarded to SDD (code-only). `specification.md` and `docs/card-architecture.md` kept as reference, not converted. Known contradictions between README, `specification.md`, CLAUDE.md and code are recorded as C1 to C14 in `.sdd/onboarding/MIGRATION.md` and are not resolved by onboarding.
