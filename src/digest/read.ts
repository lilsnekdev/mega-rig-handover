import { existsSync } from 'node:fs';
import { readNight, type DigestRow } from './types.js';
import { readNightFallback } from './fallback.js';

// Wrap the readNight contract: while issue #2's implementation is still the
// throwing stub in types.ts, fall back to the local minimal reader. Once the
// real reader lands, readNight succeeds and the fallback is never used.
export function readDigest(runsDir: string, night: string): DigestRow[] | null {
  if (!existsSync(`${runsDir}/${night}.jsonl`)) return null; // no file -> 404
  try {
    return readNight(runsDir, night);
  } catch (e) {
    if (e instanceof Error && e.message.includes('not implemented')) {
      return readNightFallback(runsDir, night);
    }
    throw e;
  }
}
