/**
 * Postinstall/preload patch for drizzle-orm's better-sqlite3 session.
 *
 * Fixes: drizzle-orm 0.35.x passes async callbacks to better-sqlite3's
 * synchronous db.transaction(), causing either "Transaction function cannot
 * return a promise" or silent FK constraint failures.
 *
 * The fix wraps the callback to discard its Promise return value. This is
 * safe because all actual DB operations inside the callback are synchronous
 * (better-sqlite3 is sync by design) — the Promise is just an artifact of
 * the `async` keyword in promptfoo's Eval.create().
 *
 * Run after pnpm install: node eval/patch-drizzle.cjs
 */
const fs = require('fs');
const path = require('path');
const glob = require('child_process')
  .execSync('find node_modules/.pnpm -path "*/drizzle-orm/better-sqlite3/session.cjs" 2>/dev/null')
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

const ORIGINAL = 'const nativeTx = this.client.transaction(transaction);';
const PATCHED =
  'const syncTransaction = (...args) => { transaction(...args); }; const nativeTx = this.client.transaction(syncTransaction);';

let patchedCount = 0;

for (const file of glob) {
  const fullPath = path.resolve(file);
  const content = fs.readFileSync(fullPath, 'utf8');

  if (content.includes(ORIGINAL)) {
    fs.writeFileSync(fullPath, content.replace(ORIGINAL, PATCHED));
    patchedCount++;
    console.log(`Patched: ${file}`);
  } else if (content.includes(PATCHED)) {
    console.log(`Already patched: ${file}`);
  } else {
    console.log(`Skipped (no match): ${file}`);
  }
}

if (patchedCount > 0) {
  console.log(`\nPatched ${patchedCount} file(s).`);
} else {
  console.log('\nNo files needed patching.');
}
