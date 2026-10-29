import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Route tests for plan §2a and §2b (issue #6): GET /digest/:night and GET /api/digest/:night.
// Both routes are covered for the same four cases: 200, 404, the empty night, a night with a
// bad line. runs/ is read-only fixtures — every test builds its own temp runs dir.

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function appFor(files: Record<string, string>): ReturnType<typeof createApp> {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  dirs.push(runsDir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(runsDir, name), body);
  const config: RigConfig = { adapter: 'shim', installed: '', beatEverySeconds: 60, runsDir };
  return createApp(config);
}

const goodNight = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T00:00:04+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
  '{"at":"2026-10-29T01:00:05+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
].join('\n');

describe('GET /digest/:night (page)', () => {
  it('200: renders the rows in one table, sorted by job', async () => {
    const app = appFor({ '2026-10-28.jsonl': `${goodNight}\n` });
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<table>');
    const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'];
    const pos = jobs.map((j) => html.indexOf(`>${j}<`));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b)); // sorted by job
    expect(html).toContain('>—<'); // owner null renders as em dash
    expect(html).toContain('fixtures/refresh</td><td>rook</td><td>4</td><td>3</td>'); // counted rows
    // retries >= 3 and fail rows are marked (warn class)
    expect((html.match(/class="warn"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('404: a night with no file', async () => {
    const app = appFor({ '2026-10-28.jsonl': `${goodNight}\n` });
    const res = await app.request('/digest/1999-01-01');
    expect(res.status).toBe(404);
  });

  it('empty night: 200 and "nothing ran"', async () => {
    const app = appFor({ '2026-10-28.jsonl': '' });
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad line: still renders the rest of the night', async () => {
    const app = appFor({ '2026-10-28.jsonl': `not json at all\n${goodNight}\n` });
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<table>');
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200: one row per job, sorted by job', async () => {
    const app = appFor({ '2026-10-28.jsonl': `${goodNight}\n` });
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const rows = await res.json();
    expect(rows.map((r: { job: string }) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
    ]);
    expect(rows[2]).toEqual({
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

  it('404: a night with no file, as JSON', async () => {
    const app = appFor({ '2026-10-28.jsonl': `${goodNight}\n` });
    const res = await app.request('/api/digest/1999-01-01');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'no run log for 1999-01-01' });
  });

  it('empty night: 200 and []', async () => {
    const app = appFor({ '2026-10-28.jsonl': '' });
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('bad line: skips it and keeps the rest of the night', async () => {
    const app = appFor({ '2026-10-28.jsonl': `${goodNight}\n{"at":"2026-10-29T06:00:00+01:00","job":"broken\n` });
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { job: string }) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
    ]);
  });
});

describe('page and JSON never disagree (ADR 0001)', () => {
  it('serves the same jobs, in the same order, from the same runs dir', async () => {
    const app = appFor({ '2026-10-28.jsonl': `${goodNight}\n` });
    const page = await (await app.request('/digest/2026-10-28')).text();
    const rows = await (await app.request('/api/digest/2026-10-28')).json();
    const jobs = rows.map((r: { job: string }) => r.job);
    const pos = jobs.map((j: string) => page.indexOf(`>${j}<`));
    expect(pos.every((p: number) => p >= 0)).toBe(true); // every JSON job is on the page
    expect(pos).toEqual([...pos].sort((a, b) => a - b)); // in the same order
  });
});
