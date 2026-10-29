// Minimal local reader for the readNight contract (src/digest/types.ts), used only while
// issue #2's real implementation is not in yet. It follows the same rules: one row per job,
// sorted by job; a line that doesn't parse is skipped, never thrown; a missing file yields [].
// When the real readNight lands, app.tsx stops calling this — delete the file then.

import { readFileSync } from 'node:fs';
import type { DigestRow, RunStatus } from './types.js';

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

export function readNightFallback(runsDir: string, night: string): DigestRow[] {
  let text: string;
  try {
    text = readFileSync(`${runsDir}/${night}.jsonl`, 'utf8');
  } catch {
    return [];
  }

  const rows = new Map<string, DigestRow>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      continue; // counted, never thrown
    }
    const e = ev as Record<string, unknown>;
    if (typeof e?.at !== 'string' || typeof e?.job !== 'string' || !isStatus(e?.status)) continue;
    const owner = typeof e.owner === 'string' ? e.owner : null;
    const error = typeof e.error === 'string' ? e.error : null;

    const row = rows.get(e.job);
    if (!row) {
      rows.set(e.job, {
        job: e.job,
        owner,
        runs: 1,
        retries: e.status === 'retry' ? 1 : 0,
        lastStatus: e.status,
        lastError: error,
        firstAt: e.at,
        lastAt: e.at,
      });
    } else {
      row.runs += 1;
      if (e.status === 'retry') row.retries += 1;
      if (owner !== null) row.owner = owner;
      if (error !== null) row.lastError = error;
      row.lastStatus = e.status;
      row.lastAt = e.at;
    }
  }

  return [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}
