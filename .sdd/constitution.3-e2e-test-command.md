# Constitution amendment 3: E2E test command

Status: APPROVED 2026-10-21
Amends: .sdd/constitution.md (approved 2026-10-19), after amendments 1 and 2

## What changes
Section 2, Project facts:
| Item | Was | Now |
|---|---|---|
| E2E test command | none | `bash tests/e2e/run.sh`. The user has given a standing request (2026-10-21) for E2E runs whenever an SDD workflow step calls for them (implement, test, or a future autopilot), with no separate approval each time; this standing request is how SDD rule T2's "when the user asks" is met in this project. Precondition: `beta` is deployed to the HA test container and HA restarted. Each run deletes all integration data and the `e2e_` helpers on the test instance. |
| Test runner notes | Amendment 1 text, ending "Services, options flow and cards are checked by a manual checklist on the user's HA test container." | Amendment 1 text up to "Covers models, storage and scheduler logic.", then: "Services, options flow and cards are checked by the E2E suite in `tests/e2e/`. It uses Node, Playwright 1.60.0 with Chromium, and the `ws` package, all pinned in `tests/e2e/package.json`. A Python stdlib script (`tests/e2e/redact_results.py`) redacts secrets from the results. The HA address, admin token and admin login live in the git-ignored `tests/e2e/.env`, which only the runner reads." |

The build command, unit test command and verbose test command are unchanged.

## Why
Spec 002 R12 and plan 002 WP5: the E2E suite replaces the manual checklist (tasks amendment 001.1). User decisions 2026-10-20. Standing request for E2E runs within workflow steps: user, 2026-10-21 ("running e2e testing does not need my explicit approval if built into a workflow of steps").

## Supersedes
- The "E2E test command" row of constitution section 2.
- The last sentence of amendment 1's "Test runner notes".
