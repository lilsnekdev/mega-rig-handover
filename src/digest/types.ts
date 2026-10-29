// Types for the morning digest: one row per job for a night's run log.
// Contract only — the reader lives in section 1's implementation, views in section 2.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl.
export type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job, as the digest page and /api/digest render it.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as "—"
  runs: number; // total lines seen for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// Read runs/<night>.jsonl into one row per job, sorted by job.
// A line that doesn't parse is counted, never thrown; a missing file yields [].
// Implemented in read-night.ts (async: it reads from disk).
export { readNight, readNightDetailed } from './read-night';
export type { NightDigest } from './read-night';
