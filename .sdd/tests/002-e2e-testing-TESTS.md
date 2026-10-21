# Tests for spec 002: E2E testing

Spec: .sdd/specs/002-e2e-testing.md with amendments 002.1 and 002.2 (live: 22 scenarios)
Run of record: 2026-10-21, branch beta, deployed code f0ea788
- Unit: `python3 -m unittest discover -s tests`, 65 passed, exit 0; 74 passed after the redaction test was added (test runner, 2026-10-21)
- E2E: `bash tests/e2e/run.sh`, folder `tests/e2e/test-history/20261021-194152`, 27 passed (5 setup, 22 scenarios), runner exit 0, redaction exit 0

Result values: PASS (proven by this run), CHECKED (shown by inspecting the repo on 2026-10-21, no automated test), ONE-OFF (proven once during implementation with a temporary check that was removed; see the task evidence), N/A.

| Requirement | Test | How it is run | Result |
|---|---|---|---|
| R1 single runner | `tests/e2e/run.sh` | every E2E run | PASS |
| R2 env file and confirmation checks | checks in `tests/e2e/run.sh` | no automated test: the runner reads only `tests/e2e/.env`, which tests may not touch (accepted gap in status) | ONE-OFF (tasks 002 T2.6) |
| R3 never starts on its own | none | inspection: no git hooks, no CI workflows | CHECKED |
| R4 removal deletes stored data | `tests/test_storage.py` (removal); `tests/e2e/tests/fresh-start.setup.ts` "configure from zero" (only the 12 seeded rooms after re-add) | unit; E2E | PASS |
| R4a user deploys before a run | none | user precondition | N/A |
| R5 fresh addition in the browser | `fresh-start.setup.ts` "fresh addition" | E2E | PASS |
| R6 configure from zero in the browser | `fresh-start.setup.ts` "delete seeded rooms", "configure from zero" | E2E | PASS |
| R6a simulated devices | `fresh-start.setup.ts` "simulated devices" | E2E | PASS |
| R6b prerequisites list | `tests/e2e/prerequisites.md`, `prerequisites.json` (empty) | inspection | CHECKED |
| R7 `e2e-test` dashboard with the four cards | `fresh-start.setup.ts` "card resources and dashboard" | E2E | PASS |
| R7a add missing resources; stop on a duplicate | `fresh-start.setup.ts` "card resources and dashboard" | E2E covers the add path; the duplicate stop is not exercised (no duplicate on the instance) | PASS (add path); ONE-OFF not done for the duplicate stop |
| R8 one test per scenario (22) | `automation.spec.ts` (1 to 9, 11), `installer.spec.ts` (10), `developer-tools.spec.ts` (12), `household.spec.ts` (13 to 21), `thermostat.spec.ts` (22) | E2E | PASS, 22 of 22 |
| R9 timestamped results folder | `run.sh`, Playwright config | every E2E run; folder holds `output.log`, `results.json`, `html-report/`, `durations.json`, `benchmarks.proposed.json` | PASS |
| R10 a failure does not stop the run; plain pass or fail lines; non-zero exit | `run.sh`, `reporters/summary-reporter.ts` | shown by earlier runs with failures (20261021-150200, 180023: remaining scenarios ran, exit 1); lines shown every run | PASS (lines and exit 0); ONE-OFF for the failure case |
| R10a user actions in the browser | the browser specs listed under R8 | E2E; reviewed per task | PASS |
| R10b 90 s per test, 30 min per run | `tests/e2e/playwright.config.ts` (`timeout`, `globalTimeout`, `retries: 0`) | inspection | CHECKED |
| R10c durations, benchmarks, slower line | `reporters/summary-reporter.ts`, `tests/e2e/benchmarks.json` | E2E: this run wrote `durations.json` and `benchmarks.proposed.json` and printed SLOWER THAN BENCHMARK for scenario 22 (12.3 s against 6.2 s) | PASS |
| R10d token and password redacted, leftovers deleted | `tests/e2e/redact_results.py`; `tests/test_redact_results.py` (9 tests: text, JSON and URL forms, zip member, nested zip, HTML embedded data, clean run, missing or empty variable exits 2, leftover secret deleted with exit 1, unreadable zip deleted) | every E2E run; unit (added in the test phase, user decision 2026-10-21) | PASS |
| R11 `.gitignore` coverage | `.gitignore` | inspection: `git check-ignore` matches the env file, `node_modules` and every `test-history` folder | CHECKED |
| R12 constitution amendment for the E2E command | `.sdd/constitution.3-e2e-test-command.md` | inspection | CHECKED |
| R13 new test file without changing the runner | `run.sh` history | inspection: six spec files added; `run.sh` changed only for the time zone (plan amendment 002.2) | CHECKED |
| R14 own `package.json`, Playwright 1.60 pinned, Chromium | `tests/e2e/package.json` (`@playwright/test` 1.60.0), Playwright config | inspection; every E2E run uses it | CHECKED |

## Notes
- Scenario 22 waits for the scheduler's once-a-minute check, so its time varies by up to a minute between runs. Its SLOWER THAN BENCHMARK line in this run is expected variance, not a slowdown.
- Two product fixes found by these tests are recorded in task evidence: the room config card edit panel (c0ef18b, tasks 002 T4.4) and the scheduler and services using HA's local time (f0ea788, tasks 002.1 T4.6).
- Redaction gap found while writing its test (not fixed, no current writer produces it): a password written with an escaped slash `\/` in JSON is neither redacted nor flagged by the second scan. Playwright, the summary reporter and HA's JSON do not escape `/`. Also not covered: form-encoded spaces or `!'()*`, and double-escaped JSON. Logged as GitHub issue #31.
