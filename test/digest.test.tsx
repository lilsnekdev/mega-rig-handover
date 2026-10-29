import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

// Temp runs dir: runs/ is read-only fixtures (plan §2d).
let runsDir: string;
let config: RigConfig;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  config = { adapter: 'test', installed: 'now', beatEverySeconds: 60, runsDir };
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

function night(name: string, lines: string[]) {
  writeFileSync(join(runsDir, `${name}.jsonl`), lines.join('\n') + '\n');
}

describe('GET /digest/:night', () => {
  it('renders the fixture rows in one table, sorted by job', async () => {
    night('2026-10-28', [
      '{"at":"2026-10-28T23:00:02+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
      '{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
      '{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
      '{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
      '{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
      '{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
    ]);
    const res = await createApp(config).request('/digest/2026-10-28');
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

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/1999-01-01');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty file', async () => {
    night('2026-10-29', []);
    const res = await createApp(config).request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line', async () => {
    night('2026-10-30', [
      'not json at all',
      '{"at":"2026-10-30T03:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
    ]);
    const res = await createApp(config).request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lane/sync');
    expect(html).toContain('<table>');
  });
});
