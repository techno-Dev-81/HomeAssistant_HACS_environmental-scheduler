# Lessons

Each lesson: "When X happens, always do Y, never do Z." Read this file at the start of every session.

- When the E2E suite needs a simulated device, always simulate what production uses (here a TRV-like thermostat that holds its own target); never add a test-only device production does not have. (Spec 002 review L10, 2026-10-21)
- When an HA browser step fails, always read the failure's error-context snapshot first. HA's UI drifts between versions (options flow Done then a Success step with Finish; Developer tools under Settings, Tools; unnamed icon buttons), so scope locators by element tag and verify against the live UI. (Spec 002 review L11)
- When comparing times between the test machine and HA, always take the time zone from HA itself; never assume the test container shares the host's zone. (Spec 002 review L12)
- When a unit test loads a script from outside `tests/` in-process, always set `sys.dont_write_bytecode` first, as `tests/ha_stubs.py` does; never leave a `__pycache__` in a path `.gitignore` does not cover. (Spec 002 review L13)
