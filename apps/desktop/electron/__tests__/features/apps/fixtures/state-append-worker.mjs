/**
 * Child-process writer for the AppStateManager cross-process test.
 *
 * Plays the role of a plugin extension: appends 0..count-1 to `items` via
 * read-modify-write under the shared `<stateFile>.lock` mutex, exactly the way
 * an extension using @sero-ai/extension-runtime does. Signals readiness via
 * `<stateFile>.ready` and waits for `<stateFile>.go` so both processes
 * provably write concurrently.
 *
 * Plain .mjs keeps the fixture out of the electron typecheck. The parent loads
 * tsx so the lock helper can use its extensionless TypeScript import.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { withStateLock } from '../../../../../../../packages/extension-runtime/src/file-lock.ts';

const [, , stateFile, countArg] = process.argv;
if (!stateFile || !countArg) throw new Error('usage: state-append-worker.mjs <stateFile> <count>');
const count = Number(countArg);

await writeFile(`${stateFile}.ready`, '', 'utf8');
while (!existsSync(`${stateFile}.go`)) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

for (let i = 0; i < count; i += 1) {
  await withStateLock(stateFile, async () => {
    const current = JSON.parse(await readFile(stateFile, 'utf8'));
    current.items.push(i);
    await writeFile(stateFile, JSON.stringify(current), 'utf8');
  });
}
