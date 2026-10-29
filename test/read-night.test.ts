import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readNight, readNightDetailed } from '../src/digest/types';

const REPO_ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(REPO_ROOT, 'runs');

let tmpRuns: string;

beforeAll(async () => {
  tmpRuns = await mkdtemp(join(tmpdir(), 'rig-read-night-'));
});

afterAll(async () => {
  // let the OS clean tmp; nothing to assert here
});

describe('readNight · normal night (fixture 2026-10-28)', () => {
  it('returns one row per job, sorted by job ascending', async () => {
    const rows = await readNight(FIXTURES, '2026-10-28');
    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('aggregates runs, retries, statuses and times per job', async () => {
    const rows = await readNight(FIXTURES, '2026-10-28');
    const byJob = Object.fromEntries(rows.map((r) => [r.job, r]));

    expect(byJob['lane/sync']).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });

    expect(byJob['fixtures/refresh']).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });

    expect(byJob['notes/backup']).toMatchObject({
      runs: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
    expect(byJob['rig/rotate-logs']).toMatchObject({ runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('counts the malformed line instead of throwing', async () => {
    const digest = await readNightDetailed(FIXTURES, '2026-10-28');
    expect(digest.badLines).toBe(1);
    // the 16-line night still renders: 5 jobs, and line counts ignore the bad one
    expect(digest.rows).toHaveLength(5);
  });
});

describe('readNight · edge cases (temp runs dir)', () => {
  it('null owner: keeps the row with owner null', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rig-null-owner-'));
    await writeFile(
      join(dir, 'n1.jsonl'),
      [
        '{"at":"2026-10-28T23:00:00Z","job":"a/job","status":"ok","owner":null}',
        '{"at":"2026-10-28T23:01:00Z","job":"a/job","status":"fail","owner":null,"error":"boom"}',
      ].join('\n') + '\n',
    );
    const rows = await readNight(dir, 'n1');
    expect(rows).toEqual([
      {
        job: 'a/job',
        owner: null,
        runs: 2,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-10-28T23:00:00Z',
        lastAt: '2026-10-28T23:01:00Z',
      },
    ]);
  });

  it('missing file: yields [] and 0 bad lines (empty night, not an error)', async () => {
    const rows = await readNight(tmpRuns, 'no-such-night');
    expect(rows).toEqual([]);
    const digest = await readNightDetailed(tmpRuns, 'no-such-night');
    expect(digest).toEqual({ rows: [], badLines: 0 });
  });

  it('empty file: yields [] and 0 bad lines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rig-empty-'));
    await writeFile(join(dir, 'empty.jsonl'), '');
    const digest = await readNightDetailed(dir, 'empty');
    expect(digest).toEqual({ rows: [], badLines: 0 });
  });

  it('a night of only bad lines: [] rows, every line counted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rig-all-bad-'));
    await writeFile(join(dir, 'bad.jsonl'), 'not json\n{"at":1}\n{"job":"x"}\n');
    const digest = await readNightDetailed(dir, 'bad');
    expect(digest.rows).toEqual([]);
    expect(digest.badLines).toBe(3);
  });

  it('bad lines mixed in: good lines still aggregate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rig-mixed-'));
    await writeFile(
      join(dir, 'mixed.jsonl'),
      [
        '{"at":"2026-10-28T23:00:00Z","job":"z/job","status":"ok","owner":"a"}',
        '{{{ broken',
        '{"at":"2026-10-28T23:05:00Z","job":"z/job","status":"retry","owner":"a","error":"e"}',
        '{"at":"2026-10-28T23:06:00Z","job":"a/job","status":"ok","owner":"b","status":"bogus"}', // invalid status -> bad line
        '{"at":"2026-10-28T23:07:00Z","job":"z/job","status":"ok","owner":"a"}',
      ].join('\n') + '\n',
    );
    const digest = await readNightDetailed(dir, 'mixed');
    expect(digest.badLines).toBe(2);
    // the duplicate-status line is bad, so a/job never gets a row
    expect(digest.rows.map((r) => r.job)).toEqual(['z/job']);
    const z = digest.rows.find((r) => r.job === 'z/job')!;
    expect(z.runs).toBe(3);
    expect(z.retries).toBe(1);
    expect(z.lastStatus).toBe('ok');
    expect(z.lastError).toBe('e');
  });

  it('fixture 2026-10-27: all-ok night reads cleanly', async () => {
    const digest = await readNightDetailed(FIXTURES, '2026-10-27');
    expect(digest.badLines).toBe(0);
    expect(digest.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(digest.rows.every((r) => r.lastStatus === 'ok' && r.retries === 0 && r.lastError === null)).toBe(true);
  });
});
