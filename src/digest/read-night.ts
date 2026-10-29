// Run log reader (plan §1): reads runs/<night>.jsonl into one row per job.
// Contract types live in types.ts; readNight there re-exports from here.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestRow, RunEvent, RunStatus } from './types';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

export type NightDigest = {
  rows: DigestRow[]; // one per job, sorted by job ascending
  badLines: number; // lines that didn't parse — counted, never thrown
  ok: number; // lines with status "ok"
  retry: number; // lines with status "retry"
  fail: number; // lines with status "fail"
};

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.at === 'string' &&
    typeof v.job === 'string' &&
    STATUSES.includes(v.status as RunStatus) &&
    (v.owner === null || typeof v.owner === 'string') &&
    (v.error === undefined || typeof v.error === 'string')
  );
}

// Read and parse a night's log. A missing file is an empty night ([] rows).
export async function readNightDetailed(runsDir: string, night: string): Promise<NightDigest> {
  let text: string;
  try {
    text = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return { rows: [], badLines: 0, ok: 0, retry: 0, fail: 0 };
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  let ok = 0;
  let retry = 0;
  let fail = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRunEvent(parsed)) {
      badLines++;
      continue;
    }

    let row = rows.get(parsed.job);
    if (!row) {
      row = {
        job: parsed.job,
        owner: parsed.owner,
        runs: 0,
        retries: 0,
        lastStatus: parsed.status,
        lastError: null,
        firstAt: parsed.at,
        lastAt: parsed.at,
      };
      rows.set(parsed.job, row);
    }
    row.runs++;
    if (parsed.status === 'retry') row.retries++;
    if (parsed.status === 'ok') ok++;
    else if (parsed.status === 'retry') retry++;
    else fail++;
    row.lastStatus = parsed.status;
    row.lastAt = parsed.at;
    if (parsed.error !== undefined) row.lastError = parsed.error;
  }

  return { rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)), badLines, ok, retry, fail };
}

// The contract shape from types.ts: rows only, sorted by job.
export async function readNight(runsDir: string, night: string): Promise<DigestRow[]> {
  return (await readNightDetailed(runsDir, night)).rows;
}
