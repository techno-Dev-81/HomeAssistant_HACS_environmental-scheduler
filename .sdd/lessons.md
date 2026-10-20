# Lessons

Each lesson: "When X happens, always do Y, never do Z." Read this file at the start of every session.

| # | Lesson (When X, always Y, never Z) | Raised in (run, phase, unit) | Why raised | Class | Evidence |
|---|---|---|---|---|---|
| L1 | When writing a spec, always question testing at the start and record in the spec the new or updated tests it requires (unit and E2E, with what each covers); never leave testing to be decided in the plan or after implementation. | spec 001, implement, T3.8 T4.6 T5.3 | Spec 001 had no testing section; the plan chose a manual checklist, which left 23 checks for the user to run by hand and no automated end-to-end coverage. User decision 2026-10-20: build E2E testing first and question testing in every spec so it is built in from the start. | generic | Spec template has no testing section; plan D1; tasks T3.8, T4.6, T5.3 |

Generic lesson L1 goes to the "Generic proposals" table of the spec 001 post-run review (/sdd-review) as a proposed change to the SDD standard: sdd-spec asks a testing question and the spec template gains a required "Testing" section listing new or updated tests. Nothing outside this project changes until the user approves it there.
