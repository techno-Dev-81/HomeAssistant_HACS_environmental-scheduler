#!/bin/bash
# Runs the E2E suite against the HA test instance (R1). Started only by hand:
# no git hook, schedule or push trigger starts it (R3).
#
# Exit codes:
#   2  the env file is missing, a required variable is empty, or
#      E2E_CONFIRM_TEST_INSTANCE is not exactly "yes" (Playwright never starts).
#   Otherwise: Playwright's exit status if it is non-zero; else the exit status
#   of redact_results.py (0 clean, 1 a file was deleted, 2 usage or variable).
#   So the run exits 0 only when Playwright and redaction both succeeded.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file missing: $ENV_FILE" >&2
  exit 2
fi

# Load the env file so its values are exported to Playwright and redaction.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Print names only, never values (R2).
problems=()
for name in HA_URL HA_TOKEN HA_USERNAME HA_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    problems+=("$name")
  fi
done
if [[ "${E2E_CONFIRM_TEST_INSTANCE:-}" != "yes" ]]; then
  problems+=("E2E_CONFIRM_TEST_INSTANCE")
fi
if (( ${#problems[@]} > 0 )); then
  echo "ERROR: missing or wrong in $ENV_FILE: ${problems[*]}" >&2
  exit 2
fi

cd "$SCRIPT_DIR"

RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$SCRIPT_DIR/test-history/$RUN_ID"
mkdir -p "$RUN_DIR"

export PW_RUN_DIR="$RUN_DIR"
export PW_OUTPUT="$RUN_DIR/test-output"
export PW_HTML="$RUN_DIR/html-report"
export PW_JSON="$RUN_DIR/results.json"

echo "Running E2E suite -> $RUN_DIR"
set +e
npx playwright test 2>&1 | tee "$RUN_DIR/output.log"
pw_status=${PIPESTATUS[0]}
python3 -I redact_results.py "$RUN_DIR"
redact_status=$?
set -e

echo "Results saved to $RUN_DIR"

if (( pw_status != 0 )); then
  exit "$pw_status"
fi
exit "$redact_status"
