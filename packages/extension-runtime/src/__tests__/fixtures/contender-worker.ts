/**
 * Stress worker for the concurrent-reclaim exclusion test.
 *
 * Usage: node contender-worker.ts <lockDir> <logFile> <id> <sections> <mode>
 * - mode `normal`: runs <sections> marker-verified critical sections and logs
 *   `OVERLAP ...` whenever another holder is observed inside one.
 * - mode `crash`: acquires once, then exits without releasing — a holder
 *   crash for the other workers to reclaim while they contend.
 * Signals readiness via `<logFile>.ready-<id>` and waits for `<logFile>.go`
 * so every process provably contends at the same time.
 */
import { existsSync } from 'node:fs';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';

import { acquireLock } from '../../file-lock.ts';

const [, , lockDir, logFile, id, sectionsArg, mode] = process.argv;
if (!lockDir || !logFile || !id || !sectionsArg || !mode) {
  throw new Error('usage: contender-worker.ts <lockDir> <logFile> <id> <sections> <mode>');
}
const sections = Number(sectionsArg);
const marker = `${logFile}.holder`;

await writeFile(`${logFile}.ready-${id}`, '', 'utf8');
while (!existsSync(`${logFile}.go`)) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

if (mode === 'crash') {
  await acquireLock(lockDir, { timeoutMs: 60_000, pollMs: 5 });
  process.exit(0); // Dies holding the lock; never touches the marker.
}

for (let i = 0; i < sections; i += 1) {
  const release = await acquireLock(lockDir, { timeoutMs: 60_000, pollMs: 5 });
  const stamp = `${id}:${i}`;
  const before = await readFile(marker, 'utf8').catch(() => null);
  if (before !== null) await appendFile(logFile, `OVERLAP enter ${stamp} saw ${before}\n`);
  await writeFile(marker, stamp, 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 2));
  const after = await readFile(marker, 'utf8').catch(() => 'missing');
  if (after !== stamp) await appendFile(logFile, `OVERLAP exit ${stamp} saw ${after}\n`);
  await rm(marker, { force: true });
  await appendFile(logFile, `OK ${stamp}\n`);
  await release();
}
