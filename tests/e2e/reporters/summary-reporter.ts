import * as fs from 'fs';
import * as path from 'path';
import type { Reporter, TestCase, TestResult, FullConfig, FullResult, Suite } from '@playwright/test/reporter';

// One plain-words line per scenario (R10) and the benchmark files (R10c).
// Only tests in the `scenarios` project are scenarios; their number is the
// leading number of the title ("22. Household user: ...").

const E2E_DIR = path.resolve(__dirname, '..');
const BENCHMARKS_FILE = path.join(E2E_DIR, 'benchmarks.json');
const MANUAL_DIR = path.join(E2E_DIR, 'test-history', 'manual');
const SCENARIO_PROJECT = 'scenarios';
const SLOWER_FACTOR = 1.5;

function scenarioNumber(title: string): string | undefined {
  return title.match(/^(\d+)\./)?.[1];
}

class SummaryReporter implements Reporter {
  private suite: Suite | undefined;

  onBegin(_config: FullConfig, suite: Suite) {
    this.suite = suite;
  }

  onTestEnd(_test: TestCase, _result: TestResult) {}

  onEnd(result: FullResult) {
    const benchmarks: Record<string, number> = JSON.parse(fs.readFileSync(BENCHMARKS_FILE, 'utf8'));
    const durations: Record<string, number> = {};
    const lines: string[] = [];

    const scenarios = (this.suite?.allTests() ?? []).filter(
      (test) => test.parent.project()?.name === SCENARIO_PROJECT,
    );

    for (const test of scenarios) {
      const outcome = test.outcome();
      const number = scenarioNumber(test.title);
      const last = test.results[test.results.length - 1];
      const seconds = last ? last.duration / 1000 : 0;

      let label: string;
      if (outcome === 'skipped') {
        label = 'NOT RUN';
      } else if (outcome === 'expected') {
        const benchmark = number !== undefined ? benchmarks[number] : undefined;
        label = benchmark !== undefined && seconds > benchmark * SLOWER_FACTOR ? 'SLOWER THAN BENCHMARK' : 'PASS';
      } else {
        label = 'FAIL';
      }
      lines.push(`${label} ${test.title}`);

      if (outcome !== 'skipped' && number !== undefined) {
        durations[number] = seconds;
      }
    }

    if (lines.length > 0) {
      process.stdout.write(`\n${lines.join('\n')}\n`);
    }

    const runDir = process.env.PW_RUN_DIR ?? MANUAL_DIR;
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'durations.json'),
      JSON.stringify({ ...durations, total: result.duration / 1000 }, null, 2) + '\n',
    );
    fs.writeFileSync(path.join(runDir, 'benchmarks.proposed.json'), JSON.stringify(durations, null, 2) + '\n');
  }
}

export default SummaryReporter;
