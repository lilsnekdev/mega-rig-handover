import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNightFallback } from './digest/fallback.js';
import { readNight, type DigestRow } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';

// readNight is the one source for digest rows (ADR 0001): the page and /api/digest both call
// it, so they can never disagree. While issue #2's implementation is not in yet, the contract
// stub throws; fall back to a local minimal reader so this route works now. The guard keys on
// the stub's message, so the fallback dies the moment the real reader lands — remove both then.
function digestRows(runsDir: string, night: string): DigestRow[] {
  try {
    return readNight(runsDir, night);
  } catch (e) {
    if (e instanceof Error && e.message.includes('not implemented')) {
      return readNightFallback(runsDir, night);
    }
    throw e;
  }
}
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const file = join(config.runsDir, `${night}.jsonl`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night) || !existsSync(file)) {
      return c.json({ error: `no run log for ${night}` }, 404);
    }
    return c.json(digestRows(config.runsDir, night));
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  return app;
}
