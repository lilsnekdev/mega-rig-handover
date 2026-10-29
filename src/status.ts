import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNightDetailed } from './digest/read-night.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
};

// A night on the board: the link target plus its ok / retry / fail event counts.
export type NightLink = {
  night: string;
  ok: number;
  retry: number;
  fail: number;
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir),
  };
}

// Each night with its ok / retry / fail counts, newest first.
// readNightDetailed is the one source for counts (ADR 0001): the board and the digest
// page read the same night, so they can never disagree.
export async function nightsWithCounts(runsDir: string): Promise<NightLink[]> {
  const links: NightLink[] = [];
  for (const night of nightsOnDisk(runsDir)) {
    const { ok, retry, fail } = await readNightDetailed(runsDir, night);
    links.push({ night, ok, retry, fail });
  }
  return links;
}
