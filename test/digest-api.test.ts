import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// runs/ is read-only fixtures: these tests build their own runs dir (issue #2d's pattern).
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-test-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const night = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T00:00:04+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
  '{"at":"2026-10-29T01:00:05+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
].join('\n');

describe('GET /api/digest/:night', () => {
  it('returns one row per job, sorted by job', async () => {
    const runsDir = makeRuns({ '2026-10-28.jsonl': `${night}\n` });
    const res = await createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }).request(
      '/api/digest/2026-10-28',
    );
    const rows = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(rows.map((r: { job: string }) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
    expect(rows[1]).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 3,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:02+01:00',
      lastAt: '2026-10-29T01:00:05+01:00',
    });
  });

  it('answers 404 as JSON for a night with no file', async () => {
    const runsDir = makeRuns({ '2026-10-28.jsonl': `${night}\n` });
    const res = await createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }).request(
      '/api/digest/1999-01-01',
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'no run log for 1999-01-01' });
  });

  it('renders an empty night as an empty array', async () => {
    const runsDir = makeRuns({ '2026-10-28.jsonl': '' });
    const res = await createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }).request(
      '/api/digest/2026-10-28',
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('skips a bad line and keeps the rest of the night', async () => {
    const runsDir = makeRuns({ '2026-10-28.jsonl': `${night}\n{"at":"2026-10-29T06:00:00+01:00","job":"broken\n` });
    const res = await createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir }).request(
      '/api/digest/2026-10-28',
    );
    const rows = await res.json();
    expect(res.status).toBe(200);
    expect(rows.map((r: { job: string }) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
  });

  it('serves the same rows as the real fixture night would give', async () => {
    const res = await createApp({ adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir: 'runs' }).request(
      '/api/digest/2026-10-28',
    );
    const rows = await res.json();
    expect(res.status).toBe(200);
    expect(rows).toHaveLength(5);
    expect(rows.map((r: { job: string }) => r.job)).toEqual([...rows.map((r: { job: string }) => r.job)].sort());
  });
});
