# Constitution amendment 2: no unrequested additions

Status: APPROVED 2026-10-20
Amends: .sdd/constitution.md (approved 2026-10-19), after amendment 1

## What changes
Section 3, Principles, adds:
- Nothing is added that was not explicitly requested. This applies to every development skill and agent (spec, plan, tasks, implementer, reviewer and any other), and covers features, UI elements, fields, settings, defaults, validations, behaviour and documentation. An element that a spec, plan or task does not name is not built; if it seems needed, the agent stops and asks the user first.

Section 6, Out of scope, removes:
- "Door/window sensor configuration in the UI: not implemented; not added unless explicitly requested."

## Why
User decision 2026-10-20. The door/window line was a one-off guard written after door/window configuration was added without being asked (commit 5a6e13f). The SDD process now governs the project, and the user wants the general rule instead: no element is added unless asked, for door/window sensors and everything else.

## Supersedes
The first bullet of constitution section 6. The second bullet (per-room away/fallback overrides) is unchanged.
