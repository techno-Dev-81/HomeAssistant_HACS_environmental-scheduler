# Post-run review: spec 002, E2E testing

Date: 2026-10-21
Spec / plan / tasks: .sdd/specs/002-e2e-testing.md (amendments 002.1, 002.2, 002.3); .sdd/plans/002-e2e-testing-PLAN.md (amendments 002.1, 002.2); .sdd/tasks/002-e2e-testing-TASKS.md (amendment 002.1); tests map .sdd/tests/002-e2e-testing-TESTS.md

## Outcome
- **Built:** a Playwright E2E suite under `tests/e2e/` with its own runner, results folders, plain-words summary, benchmarks and secret redaction. It covers 5 fresh-start setup steps and all 22 end-user scenarios, replacing spec 001's manual checklists (tasks 001.1 T3.8, T4.6, T5.3 done). Integration removal now deletes stored data (R4).
- **Results, test phase run of record:**
  - Unit `python3 -m unittest discover -s tests`: 74 passed, exit 0. That is 62 at the start of the run, 64 after WP1, 65 after the local time fix and 74 after the redaction test.
  - E2E `bash tests/e2e/run.sh`, run 20261021-194152: "27 passed (2.3m)", runner exit 0, redaction exit 0. Scenario 22 printed SLOWER THAN BENCHMARK (12.3 s against 6.2 s), which is expected variance from the once-a-minute tick.
- **Deviations from the spec, each recorded by amendment:**
  - 002.1: browser login with a password.
  - 002.2: TRV-like thermostat; scenario 23 dropped, so 22 scenarios.
  - Plan 002.2: tests use HA's time zone.
  - 002.3: two product fixes found by the suite, recorded as R15 and R16.
    - The room config card's edit panel threw on opening a room (c0ef18b, issue #37).
    - The scheduler applied blocks late by the UTC offset, an hour during BST, on every installation (f0ea788, issue #38).
- **User decisions recorded in task evidence:**
  - LCARS colour is checked on the accent bar.
  - One action per new option in Developer Tools.
  - All 22 benchmarks committed.
- **Outstanding work** is tracked as GitHub issues #30 to #36 and #39 (record-keeping notes). That covers accepted gaps, the spec 001 editor decisions, the onboarding doc conflicts and the minor test findings.

## Lessons
| # | Lesson (When X, always Y, never Z) | Raised in (run, phase, unit) | Why raised | Class | Evidence |
|---|---|---|---|---|---|
| L1 | When a fix must reach a deployed test instance before a test can run, always commit and push it first and then give the deploy commands; never ask the user to deploy code that is not yet pushed, and never ask for a per-push yes once the user has said pushes are fine | spec 002, implement, sdd-implement T4.4 | User correction, strongly worded: "you can ... commit and push and should have already done it" | generic | Session 2026-10-21 14:38; config publish.approval is still per-command (G7, G8) |
| L2 | When a test is claimed to prove a fix, always check it fails without the fix; never count a test that passed before the change as proof of it | spec 002, test, sdd-validator on spec amendment 002.3 | I told the user the E2E scenarios would prove the services time change; they had passed before it because the container clock matched HA | generic | Validator 002.3 pass 1 F1 BLOCKING; correction note in tasks 002.1 T4.6 evidence; issue #33 |
| L3 | When a task changes product code outside its spec's inventory (a bug found while writing tests), always write the spec amendment before the task is marked done; never leave the change only in task evidence | spec 002, implement, sdd-implement T4.4 and T4.6 | Two product fixes sat only in evidence until the test-phase validator flagged that the spec no longer matched the code | generic | Test-phase validator F1; spec amendment 002.3 |
| L4 | When the test-command helper reads the constitution, always apply its amendments; never report a command from the base table that an amendment replaced | spec 002, test, sdd-test detect.py | detect.py returned unit "none (no test suite)" while amendment 1 sets the unit command | generic | detect.py reads only `.sdd/constitution.md` (line 25) |
| L5 | When the test phase writes the requirement-to-test map, always start from a template; never leave the format to each run | spec 002, test, sdd-test | The skill names `.sdd/tests/NNN-slug-TESTS.md` but ships no template, unlike the other phases | generic | `/claude/skills/sdd-test/` has no templates folder |
| L6 | When a tasks amendment replaces rows, always make the base file show they are superseded; never leave old statuses that read as open work | spec 002, test, sdd-validator | Base rows T3.1 (doing), T3.5, T4.2, T4.6, T4.8 (todo) and "23 scenarios" stayed after tasks 002.1 took them over | generic | Test-phase validator F3 |
| L7 | When two agents may run E2E against the same instance, always wait for one run to finish before starting another; never run them at the same time | spec 002, implement, sdd-implement T4.2 | Each run deletes and rebuilds the instance's data, so concurrent runs would corrupt each other; held the implementer fix until the test runner finished | generic | Session 2026-10-21, T4.2 fix round 1 |
| L8 | When an agent reports a count, always have it quote the log line it took it from; never accept a paraphrased count | spec 002, implement, sdd-test-runner T4.3 | The runner reported 10 seeded rooms deleted; the log said 12 | generic | Run 20261021-132654 output.log "12 rooms deleted" |
| L9 | When anything outstanding is found during a run (gap, open decision, unfixed finding, bug fixed mid-run), always log it as a GitHub issue and link it from the SDD files; never leave it only in `.sdd` files | spec 002, test, user | User asked whether the redaction gap had been logged; it had not, nor had seven other items | generic | Issues #31 to #38; already filed as SDD issue #69 |
| L10 | When the E2E suite needs a simulated device, always simulate what production uses (here a TRV-like thermostat that holds its own target); never add a test-only device production does not have | spec 002, implement, T3.1 | User: "not convinced on why it needs it when it wouldn't in PROD" | project | Spec amendment 002.2; issue #29 |
| L11 | When an HA browser step fails, always read the failure's error-context snapshot first; HA's UI drifts between versions (options flow Done then a Success step with Finish; Developer tools under Settings, Tools; unnamed icon buttons), so scope locators by element tag and verify against the live UI | spec 002, implement, T4.2, T4.3 | Three failures in two tasks were all HA UI changes, each found from the snapshot | project | Runs 20261021-095733, 125809; tasks 002 T4.2, T4.3 evidence |
| L12 | When comparing times between the test machine and HA, always take the time zone from HA itself; never assume the test container shares the host's zone | spec 002, implement, T4.1 | The session container is UTC while HA is Europe/London; scenarios 6 and 11 failed until run.sh exported HA's zone | project | Plan amendment 002.2; runs 084308, 084424 |
| L13 | When a unit test loads a script from outside `tests/` in-process, always set `sys.dont_write_bytecode` first, as `tests/ha_stubs.py` does; never leave a `__pycache__` in a path `.gitignore` does not cover | spec 002, test, redaction test | The first version left `tests/e2e/__pycache__` untracked | project | Reviewer F1 on tests/test_redact_results.py |
| L14 | When an agent is cut off mid-task (session limit), always resume from its partial files and re-mark every task it touched as doing; never restart from scratch or leave one task "doing" and its sibling "todo" | spec 002, implement, sdd-implement T4.2, T4.3 | A rate limit stopped the implementer with partial installer and Developer Tools files; only T4.2 was marked doing | generic | Session fd96b395 end; summary 2026-10-21 11:54 |

Class is `project` (stays here) or `generic` (a workflow improvement).

## Generic proposals (approved by the user 2026-10-21: all)
| # | Proposed change to the SDD workflow | Affects (skill, agent, command or rule) | Reason | Approved | SDD issue |
|---|---|---|---|---|---|
| P1 | When a task needs a deploy before E2E, the step commits and pushes first, then asks the user to deploy. If `publish.approval` is per-command, ask once at the start of the phase whether to set it to standing for the working branch, instead of asking per push | sdd-implement, G7 | L1 | 2026-10-21 | #70 filed |
| P2 | A test only counts as proof of a fix or requirement if it fails without the change. The reviewer and validator check this for every "proven by" claim, and an unproven change becomes an accepted gap | sdd-reviewer, sdd-validator, sdd-test, rule V7 | L2 | 2026-10-21 | #71 filed |
| P3 | When a task changes product code outside the spec's entry point inventory, the task cannot be marked done until a spec amendment records the change | sdd-implement, rule V4 | L3 | 2026-10-21 | #72 filed |
| P4 | detect.py applies constitution amendments in order when reading the project facts table | sdd-test detect.py | L4 | 2026-10-21 | #73 filed |
| P5 | Ship a `templates/tests.md` for the requirement-to-test map (requirement, test, how run, result, with result values such as PASS, CHECKED, ONE-OFF, N/A) | sdd-test | L5 | 2026-10-21 | #74 filed |
| P6 | A tasks amendment's approval adds a one-line "superseded by amendment N" marker to each replaced base row, or the status helper reads live rows from amendments, so base files never show stale open work | sdd-tasks, status.py, rule V4 | L6 | 2026-10-21 | #75 filed |
| P7 | E2E runs against one instance are serialised: the orchestrating skill never starts a second E2E run while one is in progress | sdd-implement, sdd-test, sdd-test-runner | L7 | 2026-10-21 | #76 filed |
| P8 | The test runner quotes the log line behind every count it reports | sdd-test-runner, rule V8 | L8 | 2026-10-21 | #77 filed |
| P9 | On resume after an agent was cut off, sdd-implement compares the dirty tree with the tasks marked doing, and marks every task whose files are touched as doing before continuing | sdd-implement | L14 | 2026-10-21 | #78 filed |

L9 is already filed as SDD issue #69 and is not repeated here. Nothing else is written outside this project until the user approves.
