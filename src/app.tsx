import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight, type DigestRow } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus, nightsWithCounts } from './status.js';
import { Layout } from './views/layout.js';
import { Digest } from './views/digest.js';
import { StatusBoard } from './views/status.js';

// readNight is the one source for digest rows (ADR 0001): the page and /api/digest both
// call it, so they can never disagree. A missing file is the route's 404 to signal;
// an existing file always renders (empty file -> "nothing ran").
async function digestRows(runsDir: string, night: string): Promise<DigestRow[]> {
  return readNight(runsDir, night);
}

function nightExists(runsDir: string, night: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(night) && existsSync(join(runsDir, `${night}.jsonl`));
}

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', async (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} nights={await nightsWithCounts(config.runsDir)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', async (c) => {
    const night = c.req.param('night');
    if (!nightExists(config.runsDir, night)) return c.text('no such night', 404);
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <Digest night={night} rows={await digestRows(config.runsDir, night)} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', async (c) => {
    const night = c.req.param('night');
    if (!nightExists(config.runsDir, night)) {
      return c.json({ error: `no run log for ${night}` }, 404);
    }
    return c.json(await digestRows(config.runsDir, night));
  });

  return app;
}
