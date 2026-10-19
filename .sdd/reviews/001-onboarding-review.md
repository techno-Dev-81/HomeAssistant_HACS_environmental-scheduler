# Onboarding review: Environmental Scheduler

Date: 2026-10-19
Migration list: .sdd/onboarding/MIGRATION.md

## Outcome
Baseline before: no build/test command (HACS integration, no build step), nothing run, 0 passed, 0 failed.
After (step 13a, sdd-test-runner): no build/test command found by T1 order (constitution says none; no runner script, manifest or test files), nothing run, 0 passed, 0 failed. Matches the baseline.
Step 13b: skipped, no file moved (no MOVED.txt). Step 13c: guard.py state clean. Step 13d: status.py show valid. Step 13e: N/A - no spec converted.
Applied: constitution approved; `.sdd/status.md` and `.sdd/config.json` created; CLAUDE.md "Core Rule" removed (item #2), text in `.sdd/onboarding/archive/removed-CLAUDE.md.txt`. Steps 9, 11, 12 skipped: nothing found.

## Findings
| # | Finding | Kind (audit missed, misclassified, list changed by the user, surprise) | Raised in (onboarding, step) | Why | Class (project or generic) | Evidence |
|---|---|---|---|---|---|---|
| F1 | 22 of 24 in-repo inventory items came out CONFLICT only because patterns.md has no row for HA/HACS layouts (`custom_components/**`, `hacs.json`, `.gitignore`) | misclassified | onboarding, step 3 | Patterns cover only `src/**`, `scripts/**`, `tests/**`; the auditor reclassified all of them KEEP | generic | Migration list items #40 to #59 |
| F2 | The checked-out branch was `main`, while the project works on `beta`; the two had diverged (15 and 13 commits). Classify reported no other branches because `origin/beta` holds no `.sdd/` | surprise | onboarding, step 1 | Branch choice changes which code is onboarded; the user chose local `beta` from `origin/beta` | project | Step 1 rev-list count |
| F3 | README, specification.md, CLAUDE.md and code contradict each other in 14 places (profile model, vacation temperature, door/window, preheat_offset, entity_type and others) | surprise | onboarding, step 4 | Stale FACT content is out of onboarding's scope; recorded only | project | Migration list C1 to C14 |
| F4 | README says "MIT License, see LICENSE file", but no LICENSE file exists | audit missed | onboarding, step 8 | Found while drafting the constitution, not reported by the auditor | project | `ls LICENSE*` finds nothing |
| F5 | Four project facts (repo URL, issues URL, tag format, storage path) had no constitution or config field | surprise | onboarding, step 5 | Written as prose rows with proposed field names | generic | Migration list M1 to M4 |
| F6 | The user accepted all recommended answers Q1 to Q7 (specification.md kept as reference, so no spec chain converted) | list changed by the user | onboarding, step 6 | Answers recorded in the migration list Open questions | project | Migration list, Open questions |
| F7 | Two auditor runs said the patterns path or spec section list was not passed, although both were in their prompts | surprise | onboarding, step 4 | Agent report accuracy; no effect on findings | generic | Auditor reports, step 4 |
| F8 | /workspace/CLAUDE.md section 0a names another project's deploy script (BudgetOne `deploy-dev.sh`) | surprise | onboarding, step 4 | Outside item, for the user to handle; not changed | project | Migration list item #61 |

Project findings stay in the project. Generic ones are applied here first and then installed.

## Generic proposals (awaiting user approval)
| # | Proposed change to the SDD standard | Affects (skill, agent, command, rule or patterns row) | Reason |
|---|---|---|---|
| G1 | Add rows `custom_components/**` KEEP, `hacs.json` KEEP, `.gitignore` KEEP before the fallthrough | sdd-onboard patterns.md | F1: avoids 22 false CONFLICT items on any HA/HACS integration |
| G2 | Add optional rows or config fields for repository URL, issue tracker, release tag format and data storage path | sdd-constitution template, config.json template | F5 |
| G3 | In step 1, when the checked-out branch is the default branch, also list remote branches without `.sdd/` and their divergence from it | sdd-onboard step 1 | F2: the working branch had to be found from CLAUDE.md prose |

Nothing is written outside this project until the user approves.

## Log row
One row per onboarding in `docs/onboarding-log.md`: date, project, branch, items by class, surprises, proposals raised.
| 2026-10-19 | environmental-scheduler (HA HACS integration) | beta | KEEP 20, MIGRATE 28, CONFLICT 11, REPORT 3 | patterns had no HA/HACS rows; default branch checked out while working branch diverged; 14 stale-doc conflicts; missing LICENSE | G1, G2, G3 |
