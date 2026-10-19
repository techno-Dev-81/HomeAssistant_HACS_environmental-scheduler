# Onboarding migration list: Environmental Scheduler

Status: APPROVED 2026-10-19
Branch: beta
Archive folder: .sdd/onboarding/archive
Progress: 10
Build output allowed: none
Baseline: no build/test command (HACS integration, no build step; no manifest, runner script, CI or test files). Recorded as-is, user-confirmed 2026-10-19. Tests passed 0, failed 0, nothing run.

## Items
| # | Item | Scope (in-repo or outside) | Class (KEEP, MIGRATE, RETIRE, CONFLICT, REPORT) | Decision | Target in the standard | Original (keep, archive, archive whole, archive removed text) |
|---|---|---|---|---|---|---|
| 1 | CLAUDE.md: title "Environmental Scheduler, Claude Guidelines" | in-repo | MIGRATE | FACT, keep | none | keep |
| 2 | CLAUDE.md: "Core Rule" (only implement explicitly requested features, ask first) | in-repo | MIGRATE | PROCESS, remove (same rule stays in force via /workspace/CLAUDE.md section 1 and SDD rule S1) | none | archive removed text |
| 3 | CLAUDE.md: "Project", description line | in-repo | MIGRATE | FACT, keep | constitution 1. Purpose | keep |
| 4 | CLAUDE.md: "Project", repo URL | in-repo | MIGRATE | FACT, keep | Missing field M1 | keep |
| 5 | CLAUDE.md: "Project", active branch `beta` | in-repo | MIGRATE | FACT, keep | constitution 2. Working branch pattern (`beta`, one long-lived branch); status `branch` | keep |
| 6 | CLAUDE.md: "Project", main branch for PRs/releases `main` | in-repo | MIGRATE | FACT, keep | constitution 2. Default branch | keep |
| 7 | CLAUDE.md: "Project", version tag format and "tag after each logical batch" | in-repo | CONFLICT | FACT, keep (Q1: cadence is a project release rule) | Missing field M3 (format); constitution 5. Branch and release policy (cadence) | keep |
| 8 | CLAUDE.md: "Architecture" (integration, Node-RED, cards, options flow responsibilities) | in-repo | MIGRATE | FACT, keep | constitution 2. Language and stack; 4. Standards | keep |
| 9 | CLAUDE.md: "Key Decisions", node_red_mode false/true | in-repo | MIGRATE | FACT, keep | constitution 4. Standards | keep |
| 10 | CLAUDE.md: "Key Decisions", entity_type derived, not stored | in-repo | MIGRATE | FACT, keep (see conflict C10) | constitution 4. Standards | keep |
| 11 | CLAUDE.md: "Key Decisions", presence logic (ANY home heats, ALL away gives away temp) | in-repo | MIGRATE | FACT, keep | constitution 4. Standards | keep |
| 12 | CLAUDE.md: "Key Decisions", preheat_offset_minutes is Node-RED learned, not UI-configurable | in-repo | MIGRATE | FACT, keep (see conflict C8) | constitution 4. Standards | keep |
| 13 | CLAUDE.md: "Key Decisions", door/window sensor config not implemented, do not add unasked | in-repo | CONFLICT | FACT, keep (Q2) | constitution 6. Out of scope | keep |
| 14 | CLAUDE.md: "Key Decisions", per-room away/fallback overrides not in options flow, do not add unasked | in-repo | CONFLICT | FACT, keep (Q2; see C11) | constitution 6. Out of scope | keep |
| 15 | CLAUDE.md: "Stack" (dataclasses, HA Storage, voluptuous, vanilla JS no build step, flows, services/events) | in-repo | MIGRATE | FACT, keep | constitution 2. Language and stack; Build command `none`; Unit test command `none` | keep |
| 16 | CLAUDE.md: "File Layout" | in-repo | MIGRATE | FACT, keep in CLAUDE.md as reference (out of date, see C12; not fixed during onboarding) | none | keep |
| 17 | README.md: title and intro line | in-repo | MIGRATE | FACT, keep (mentions profiles, see C1) | constitution 1. Purpose (input, profile wording excluded) | keep |
| 18 | README.md: "Features" | in-repo | MIGRATE | FACT, keep. Only storage path and 0.5°C precision feed the constitution | constitution 4. Standards; Missing field M4 | keep |
| 19 | README.md: "Installation" (HACS / Manual) | in-repo | MIGRATE | FACT, keep (user doc) | none | keep |
| 20 | README.md: "Setup" | in-repo | MIGRATE | FACT, keep (out of date, C5, C7) | none | keep |
| 21 | README.md: "Quick Start" | in-repo | MIGRATE | FACT, keep (out of date, C1, C2, C4) | none | keep |
| 22 | README.md: "Services" | in-repo | MIGRATE | FACT, keep (out of date vs services.yaml, C1) | none | keep |
| 23 | README.md: "Rooms" (default 12) | in-repo | CONFLICT | keep; Q3 stays open (not constitution input) | none | keep |
| 24 | README.md: "Profiles" | in-repo | MIGRATE | FACT, keep (out of date, C1); not constitution input | none | keep |
| 25 | README.md: "Configuration", default temperatures | in-repo | MIGRATE | FACT, keep (C2, C3); not constitution input | none | keep |
| 26 | README.md: "Configuration", temperature constraints (5 to 35°C, 0.5°C, 2°C buffer) | in-repo | MIGRATE | FACT, keep | constitution 4. Standards | keep |
| 27 | README.md: "Configuration", block rules (30 min minimum, no overlaps, Mon to Sun) | in-repo | MIGRATE | FACT, keep | constitution 4. Standards | keep |
| 28 | README.md: "Integration with Node-RED" | in-repo | MIGRATE | FACT, keep (user doc) | none | keep |
| 29 | README.md: "Future Features (Roadmap)" | in-repo | CONFLICT | FACT, keep in README (Q4; C6, C13 stay open) | none | keep |
| 30 | README.md: "Troubleshooting" | in-repo | MIGRATE | FACT, keep | none | keep |
| 31 | README.md: "Support" | in-repo | MIGRATE | FACT, keep | Missing field M2 | keep |
| 32 | README.md: "License" (MIT) | in-repo | MIGRATE | FACT, keep | constitution 4. Standards | keep |
| 33 | README.md: "Contributing" (open an issue or PR) | in-repo | MIGRATE | FACT, keep (external contributor guidance, not an internal process) | none | keep |
| 34 | docs/card-architecture.md (whole file) | in-repo | CONFLICT | KEEP as reference/design doc; not a spec chain. Header "Planned" is out of date (C14, stays open) | none | keep |
| 35 | docs/card-architecture.md: parity rule, engine must not import skins | in-repo | CONFLICT | FACT, keep (Q5) | constitution 4. Standards | keep |
| 36 | docs/card-architecture.md: "Color rules", "confirm with the maintainer first" | in-repo | CONFLICT | keep in the doc as a project convention (Q5); not constitution input | none | keep |
| 37 | docs/card-architecture.md: "Adding a new skin", steps 4 and 5 (parity before merge, document here) | in-repo | CONFLICT | keep in the doc as a project convention (Q5) | none | keep |
| 38 | specification.md (whole file, single product spec, no amendments/designs/tracking) | in-repo | CONFLICT | KEEP as reference (Q6); not converted | none | keep |
| 39 | specification.md: "Status: LOCKED. No ambiguity. No fluff." | in-repo | CONFLICT | keep, part of the reference file #38 (Q6) | none | keep |
| 40 | .gitignore | in-repo | KEEP | keep | none | keep |
| 41 | hacs.json | in-repo | KEEP | keep (name "Environmental Scheduler", render_readme true) | none | keep |
| 42 | custom_components/environmental_scheduler/manifest.json | in-repo | KEEP | keep (domain environmental_scheduler, version 0.0.1, codeowner @techno-Dev-81, local_push, config_flow) | none | keep |
| 43 | custom_components/environmental_scheduler/__init__.py | in-repo | KEEP | keep | none | keep |
| 44 | custom_components/environmental_scheduler/config_flow.py | in-repo | KEEP | keep | none | keep |
| 45 | custom_components/environmental_scheduler/const.py | in-repo | KEEP | keep | none | keep |
| 46 | custom_components/environmental_scheduler/models.py | in-repo | KEEP | keep | none | keep |
| 47 | custom_components/environmental_scheduler/options_flow.py | in-repo | KEEP | keep | none | keep |
| 48 | custom_components/environmental_scheduler/scheduler.py | in-repo | KEEP | keep | none | keep |
| 49 | custom_components/environmental_scheduler/services.py | in-repo | KEEP | keep | none | keep |
| 50 | custom_components/environmental_scheduler/services.yaml | in-repo | KEEP | keep | none | keep |
| 51 | custom_components/environmental_scheduler/storage.py | in-repo | KEEP | keep | none | keep |
| 52 | custom_components/environmental_scheduler/strings.json | in-repo | KEEP | keep | none | keep |
| 53 | custom_components/environmental_scheduler/translations/en.json | in-repo | KEEP | keep | none | keep |
| 54 | custom_components/environmental_scheduler/www/engine/overview-engine.js | in-repo | KEEP | keep | none | keep |
| 55 | custom_components/environmental_scheduler/www/environmental-scheduler-card.js | in-repo | KEEP | keep | none | keep |
| 56 | custom_components/environmental_scheduler/www/environmental-scheduler-overview-card.js | in-repo | KEEP | keep | none | keep |
| 57 | custom_components/environmental_scheduler/www/environmental-scheduler-room-config-card.js | in-repo | KEEP | keep | none | keep |
| 58 | custom_components/environmental_scheduler/www/skins/lcars/lcars-tokens.js | in-repo | KEEP | keep | none | keep |
| 59 | custom_components/environmental_scheduler/www/skins/lcars/overview-card.js | in-repo | KEEP | keep (code TODOs at lines 6 and 668, not process material) | none | keep |
| 60 | Lessons (step 11) | in-repo | REPORT | skipped: nothing found (no lessons file or lessons-like material) | none | n/a |
| 61 | /workspace/CLAUDE.md | outside | REPORT | for the user to handle | none | untouched |
| 62 | Claude memory folder for this project | outside | REPORT | empty, nothing to use | none | untouched |

Prefer a configuration field as the target over prose.

## Missing fields
| # | Prose written because no configuration field fits | Where | Proposed field |
|---|---|---|---|
| M1 | Repository URL https://github.com/techno-Dev-81/environmental-scheduler | constitution 2. Project facts (extra row) | `repository.url` |
| M2 | Issue tracker URL (README "Support", manifest issue_tracker) | constitution 2. Project facts (extra row) | `repository.issues_url` |
| M3 | Version tag format `v0.0.x` patch, `v0.x.0` feature | constitution 5. Branch and release policy | `release.tag_format` |
| M4 | Data stored in HA storage `.storage/environmental_scheduler` | constitution 2. Project facts (extra row) | `data.storage_path` |

PROCESS rules to be removed (step 10): CLAUDE.md "Core Rule" (#2), saved as `.sdd/onboarding/archive/removed-CLAUDE.md.txt`. Nothing removed from README.md or docs.

## Spec chains
skipped: nothing found (no spec chain; specification.md kept as reference per Q6). Step 9 skipped.

## Open questions
Answered at approval 2026-10-19 (user accepted the recommendations): Q1 cadence kept as release rule; Q2 Out of scope; Q3 left open; Q4 roadmap stays in README; Q5 parity and import rules to constitution standards, colour-confirm and skin steps kept as doc conventions; Q6 specification.md kept as reference; Q7 GitHub defaults kept.

- Q1 (#7): Is "tag after each logical batch of changes" a project release rule (constitution 5) or a process rule to remove?
- Q2 (#13, #14): Are the "not implemented, do not add without being asked" bullets standing constitution constraints, or out-of-scope entries for future specs?
- Q3 (#23): Does the integration create 12 default rooms? The spec says rooms are created in the dashboard.
- Q4 (#29): Does the README roadmap stay in the README, or feed constitution 6. Out of scope?
- Q5 (#35 to #37): Do the card parity rule, engine/skin import rule and LCARS colour rules become constitution standards? Are "confirm colour with maintainer" and skin steps 4 and 5 project conventions or process to remove?
- Q6 (#38, #39): Keep specification.md as reference, or convert it to spec 001? It contradicts CLAUDE.md in places and calls itself LOCKED.
- Q7: GitHub publishing. `.sdd/config.json` defaults to `github.enabled: false` and `publish.approval: per-command`. Keep the defaults?
- Conflicts found between files (recorded only; onboarding does not fix stale facts):
  - C1: README profile model and `set_profile` vs spec (one weekly schedule per room, house modes) and services.yaml (no set_profile).
  - C2: Vacation temperature 5°C (README) vs 7°C (spec).
  - C3: README Night 16°C and Home 15°C vs spec (no Night; global fallback 15).
  - C4: README get_active_block return shape vs spec section 7.1.
  - C5: README block editing in options flow, multi-step config flow vs CLAUDE.md (dashboard cards, single-step flow).
  - C6: README roadmap lists a Lovelace card as future; cards exist.
  - C7: Door/window: CLAUDE.md not implemented vs README and spec describe it.
  - C8: preheat_offset: CLAUDE.md not UI-configurable vs spec (options flow, dashboard).
  - C9: Options flow vs dashboard responsibilities differ between CLAUDE.md and spec.
  - C10: entity_type derived (CLAUDE.md) vs stored and set in dashboard (spec).
  - C11: Per-room away/fallback temps: CLAUDE.md vs spec section 9.2.
  - C12: CLAUDE.md File Layout misses the room-config card, engine/ and skins/lcars/.
  - C13: Export/import current in spec, future in README.
  - C14: card-architecture.md says "Planned" but engine and LCARS skin exist; names both lcars-tokens.css and lcars-tokens.js.

## Secret-named items
None found.

## For the user to handle
| # | Item outside the project root | Why | Retired path it still mentions |
|---|---|---|---|
| 61 | /workspace/CLAUDE.md, section 0a "Why this matters here" | Names BudgetOne's `deploy-dev.sh` and `/mnt/user/techno-dev/BudgetOne/`; not a fact about this project | none |
| 61 | /workspace/CLAUDE.md, section 2 "Autonomous bug fixing" and "Build must pass" | May sit awkwardly with SDD approval stops; this project has no build/test command | none |
SDD never changes these (spec 002 amendment 002.1).

## Approved list for archive
skipped: nothing found (no file is moved; step 12 skipped, no MOVED.txt, so step 13b and its step 14 rerun are skipped).
The archive list file has this format: the first line is `Status: APPROVED YYYY-MM-DD`, then one project-relative path per line.
