import { readFileSync } from 'node:fs';
import type { DigestRow, RunEvent } from './types.js';

// Minimal fallback reader for the digest page, used only while the real readNight
// (src/digest/types.ts, issue #2) is still the contract stub that throws. Same
// contract: one row per job, sorted by job; a bad line is counted, never thrown.
// The page stops using it the moment the real reader lands (see digest.ts).

function parseLine(line: string): RunEvent | null {
  try {
    const ev = JSON.parse(line) as Partial<RunEvent>;
    if (typeof ev.at !== 'string' || typeof ev.job !== 'string') return null;
    if (ev.status !== 'ok' && ev.status !== 'retry' && ev.status !== 'fail') return null;
    return { at: ev.at, job: ev.job, status: ev.status, owner: typeof ev.owner === 'string' ? ev.owner : null, error: typeof ev.error === 'string' ? ev.error : undefined };
  } catch {
    return null;
  }
}

export function readNightFallback(runsDir: string, night: string): DigestRow[] {
  const rows = new Map<string, DigestRow>();
  for (const line of readFileSync(`${runsDir}/${night}.jsonl`, 'utf8').split('\n')) {
    const ev = parseLine(line);
    if (!ev) continue; // bad or empty line: counted, never thrown
    const row = rows.get(ev.job);
    if (row) {
      row.runs += 1;
      if (ev.status === 'retry') row.retries += 1;
      row.lastStatus = ev.status;
      row.lastError = ev.error ?? null;
      row.lastAt = ev.at;
    } else {
      rows.set(ev.job, {
        job: ev.job,
        owner: ev.owner ?? null,
        runs: 1,
        retries: ev.status === 'retry' ? 1 : 0,
        lastStatus: ev.status,
        lastError: ev.error ?? null,
        firstAt: ev.at,
        lastAt: ev.at,
      });
    }
  }
  return [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}
