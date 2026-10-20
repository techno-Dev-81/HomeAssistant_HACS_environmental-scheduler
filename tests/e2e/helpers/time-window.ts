// A block window inside today that contains now.
//
// Blocks are at least 30 minutes, start before they end, and cannot cross
// midnight (latest end 23:59).
//
// Rule:
// - normal times: start = now minus 15 minutes (whole minutes), clamped at
//   00:00; end = start plus 60 minutes, clamped at 23:59;
// - from 23:30: 23:29 to 23:59;
// - at 23:59: throws "too close to midnight";
// - with { thermostat: true }, also throws after 23:57, because the
//   thermostat scenarios need a minute tick inside the block.
//
// Times use the local clock of the Node process.

export interface BlockWindow {
  start: string;
  end: string;
}

export interface WindowOptions {
  thermostat?: boolean;
}

const LAST_MINUTE = 23 * 60 + 59;

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function blockWindow(now: Date = new Date(), options: WindowOptions = {}): BlockWindow {
  const minute = now.getHours() * 60 + now.getMinutes();

  if (minute >= LAST_MINUTE) {
    throw new Error('too close to midnight');
  }
  if (options.thermostat && minute > 23 * 60 + 57) {
    throw new Error('too close to midnight');
  }
  if (minute >= 23 * 60 + 30) {
    return { start: '23:29', end: '23:59' };
  }

  const start = Math.max(0, minute - 15);
  const end = Math.min(LAST_MINUTE, start + 60);
  return { start: hhmm(start), end: hhmm(end) };
}
