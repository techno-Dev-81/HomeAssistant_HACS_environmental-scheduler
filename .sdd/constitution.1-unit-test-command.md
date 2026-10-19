# Constitution amendment 1: unit test command

Status: APPROVED 2026-10-19
Amends: .sdd/constitution.md (approved 2026-10-19)

## What changes
Section 2, Project facts:
| Item | Was | Now |
|---|---|---|
| Unit test command | none (no test suite; baseline recorded 2026-10-19) | `python3 -m unittest discover -s tests` |
| Test runner notes | N/A - no runner exists | Standard library `unittest` only, no third-party packages. `tests/ha_stubs.py` provides minimal fakes for the Home Assistant modules the code imports and loads the modules under test by file path (so `__init__.py` is not run). Covers models, storage and scheduler logic. Services, options flow and cards are checked by a manual checklist on the user's HA test container. |

Build command, verbose test command and E2E test command stay `none`.

## Why
Plan 001 decision D1: the user asked for autonomous testing. This session has Python 3.11 with no pip and no Docker, so `pytest-homeassistant-custom-component` cannot run here, and the HA test container is not running or reachable. A stdlib suite with stubs runs here with no installs and no secrets.

## Supersedes
The "Unit test command" and "Test runner notes" rows of constitution section 2.
