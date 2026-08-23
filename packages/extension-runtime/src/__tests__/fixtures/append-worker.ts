/**
 * Child-process writer for the cross-process lock test.
 *
 * Usage: node append-worker.ts <stateFile> <count>
 * Appends 0..count-1 to `items` via read-modify-write under the shared lock.
 * Signals readiness via `<stateFile>.ready` and waits for `<stateFile>.go` so
 * both processes provably write concurrently — without the barrier the parent
 * can finish before the child boots and the test exercises nothing.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { withStateLock } from '../../file-lock.ts';

const [, , stateFile, countArg] = process.argv;
if (!stateFile || !countArg) throw new Error('usage: append-worker.ts <stateFile> <count>');
const count = Number(countArg);

await writeFile(`${stateFile}.ready`, '', 'utf8');
while (!existsSync(`${stateFile}.go`)) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

for (let i = 0; i < count; i += 1) {
  await withStateLock(stateFile, async () => {
    const current = JSON.parse(await readFile(stateFile, 'utf8')) as { items: number[] };
    current.items.push(i);
    await writeFile(stateFile, JSON.stringify(current), 'utf8');
  });
}
