import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});

describe('board links each night to its digest with counts', () => {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  const tempConfig = { ...config, runsDir };
  afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

  function log(line: object): string {
    return `${JSON.stringify(line)}\n`;
  }

  it('links every night and shows its ok / retry / fail counts', async () => {
    writeFileSync(
      join(runsDir, '2026-10-27.jsonl'),
      log({ at: '2026-10-27T01:00:00Z', job: 'a', status: 'ok', owner: null }) +
        log({ at: '2026-10-27T02:00:00Z', job: 'a', status: 'ok', owner: null }),
    );
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      log({ at: '2026-10-28T01:00:00Z', job: 'b', status: 'retry', owner: 'ana' }) +
        log({ at: '2026-10-28T02:00:00Z', job: 'b', status: 'fail', owner: 'ana', error: 'boom' }) +
        log({ at: '2026-10-28T03:00:00Z', job: 'c', status: 'ok', owner: null }),
    );

    const res = await createApp(tempConfig).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('ok 1 · retry 1 · fail 1');
    expect(html).toContain('ok 2 · retry 0 · fail 0');

    for (const night of ['2026-10-27', '2026-10-28']) {
      const digest = await createApp(tempConfig).request(`/digest/${night}`);
      expect(digest.status).toBe(200);
    }
  });
});
