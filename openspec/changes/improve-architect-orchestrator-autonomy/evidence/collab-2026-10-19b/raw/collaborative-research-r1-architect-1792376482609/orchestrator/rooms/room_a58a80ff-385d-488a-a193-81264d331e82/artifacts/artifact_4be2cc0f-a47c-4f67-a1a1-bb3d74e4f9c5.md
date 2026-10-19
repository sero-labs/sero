# retryWithBackoff: call sites, default attempts, and overrides

Research question: which files under src/ call \`retryWithBackoff\`, what is its default number of attempts, and which callers override that number and with what value? No source file was modified.

## Answer in brief

\`retryWithBackoff\` is defined once in \`src/net/retry.js\` and is called from exactly **four** files under \`src/\`: \`src/billing/charge.js\`, \`src/billing/refund.js\`, \`src/sync/pull.js\`, and \`src/sync/push.js\`. Its default is **5 attempts**, set at \`src/config.js:1\` and read at \`src/net/retry.js:4\`. Two callers override it: \`charge\` uses **2** and \`refund\` uses **3**. \`pull\` and \`push\` accept the default of 5.

## 1. Definition

| file:line | evidence |
|---|---|
| \`src/net/retry.js:3\` | \`export async function retryWithBackoff(task, options = {}) {\` |
| \`src/net/retry.js:1\` | \`import { DEFAULTS } from '../config.js';\` |

This is the only definition and the only export site of the symbol in the repository; it is never re-exported under another name.

## 2. Default attempts value — traced to its defining line

| file:line | evidence |
|---|---|
| \`src/net/retry.js:4\` | \`const attempts = options.attempts ?? DEFAULTS.attempts;\` |
| \`src/config.js:1\` | \`export const DEFAULTS = { attempts: 5, baseDelayMs: 250 };\` |

**Default = 5.**

Chain: \`src/net/retry.js:4\` reads \`DEFAULTS.attempts\`; \`src/config.js:1\` writes \`attempts: 5\`. \`DEFAULTS\` is written only at \`src/config.js:1\` and read only at \`src/net/retry.js:1,4,5\`, so \`attempts\` is never mutated at runtime. The \`??\` operator means an absent, \`undefined\`, **or explicitly \`null\`** \`options.attempts\` all resolve to 5. The sibling default \`baseDelayMs\` (250) is defined on the same line and read at \`src/net/retry.js:5\`.

## 3. Calling files — all four, with evidence

### \`src/billing/charge.js\` — override 2
- \`:1\` \`import { retryWithBackoff } from '../net/retry.js';\`
- \`:3\` \`export function charge(gateway, order) {\`
- \`:4\` \`return retryWithBackoff(() => gateway.charge(order), { attempts: 2 });\`

### \`src/billing/refund.js\` — override 3
- \`:1\` \`import { retryWithBackoff } from '../net/retry.js';\`
- \`:3\` \`export function refund(gateway, order) {\`
- \`:4\` \`return retryWithBackoff(() => gateway.refund(order), { attempts: 3 });\`

### \`src/sync/pull.js\` — inherits default 5
- \`:1\` \`import { retryWithBackoff } from '../net/retry.js';\`
- \`:3\` \`export function pull(fetchPage, cursor) {\`
- \`:4\` \`return retryWithBackoff(() => fetchPage(cursor));\`

The options argument is omitted entirely, so \`options\` defaults to \`{}\` and \`attempts\` resolves to 5.

### \`src/sync/push.js\` — inherits default 5 (options present, \`attempts\` absent)
- \`:1\` \`import { retryWithBackoff } from '../net/retry.js';\`
- \`:3\` \`export function push(send, batch) {\`
- \`:4\` \`return retryWithBackoff(() => send(batch), { baseDelayMs: 100 });\`

The options object is **not** empty, but it contains only \`baseDelayMs\`, so \`options.attempts\` is \`undefined\` and \`attempts\` resolves to 5. This is the one site most likely to be misread as an override: it overrides the delay, not the attempt count.

## 4. Explicit attempts overrides — complete list

| caller | file:line | value |
|---|---|---|
| \`charge\` | \`src/billing/charge.js:4\` | **2** |
| \`refund\` | \`src/billing/refund.js:4\` | **3** |

No other explicit \`attempts\` override exists under \`src/\`.

## 5. Plausible near-misses, examined and excluded

- **\`src/net/retry-sync.js:1\`** — \`export function retryWithBackoffSync(task, attempts = 1) {\`. A **different symbol**. Its \`attempts = 1\` is that function's own positional parameter default, not an \`attempts\` override of \`retryWithBackoff\`. The body (\`:2-6\`) loops on its own parameter and calls \`task()\` directly; it never imports or delegates to \`retryWithBackoff\`. \`retryWithBackoffSync\` has exactly one occurrence in the repository — its own definition — so it has zero importers.
- **\`src/legacy/old-sync.js:1\`** — \`// This used to wrap its network call in retryWithBackoff before the sync rewrite.\` **Comment only**, historical prose. \`oldSync(send)\` at \`:2-4\` is \`return send();\` and makes no retry call. Zero importers.
- **\`src/config.js:1\`** — data constant; calls nothing. It is the source of the default, not a caller.
- **\`src/net/retry.js:3\`** — the definition, not a call site.

## 6. Indirect-path check (second research track)

Two independent tracks were run and cross-audited: (A) direct lexical calls/imports, and (B) indirect paths — re-exports, wrapper helpers, and modules importing a retrying wrapper.

Reading B established, positively, that no indirect path exists:
- **No aliased imports.** All four imports are static canonical named imports from \`../net/retry.js\` (\`charge.js:1\`, \`refund.js:1\`, \`pull.js:1\`, \`push.js:1\`). No \`import * as\`, no rename, no \`require(\`, no \`module.exports\`/\`exports.\`, no dynamic \`import()\`.
- **No re-export barrels.** No \`export *\`, no \`export { ... }\`, no \`export ... from\`; every export in \`src/\` is an inline declaration (\`config.js:1\`, \`retry.js:3\`, \`retry-sync.js:1\`, \`charge.js:3\`, \`refund.js:3\`, \`pull.js:3\`, \`push.js:3\`, \`old-sync.js:2\`). There is no \`index.js\` anywhere, and \`package.json\` declares no \`main\`/\`exports\` entry point, so no package-level barrel exists.
- **No second-order wrappers.** The only functions that call \`retryWithBackoff\` are the four one-line pass-throughs above; nothing in the repository calls those four. Options are plain object literals at line 4 of each caller, so no spread or indirection can inject \`attempts\`.
- **No outbound consumers.** The repository outside \`src/\` contains only \`package.json\` and \`.sero-workspace.json\`; nothing imports the four wrappers, so the caller graph does not extend beyond the four files.

## 7. Reconciliation record

Reading A (direct) and Reading B (indirect) agreed on every item — the four-file caller list, the default of 5 via \`src/net/retry.js:4\` → \`src/config.js:1\`, both overrides, and both exclusions — with **no remaining disagreement**. Reading B independently reproduced all values; Reading A independently re-verified Reading B's negative claims (alias/barrel/CJS greps over \`src/\` returned only inline export declarations, and \`no index.js\` / \`single-occurrence\` checks were re-run).

One non-overturning discrepancy was found and corrected during the audit: Reading B cited \`package.json\` \`type=module\` at line 6, but it is at **line 5** (\`name\`:2, \`version\`:3, \`private\`:4, \`type\`:5, \`scripts\`:6, \`test\`:7). Its claims that there is no \`main\`/\`exports\` field and that no test files exist are both correct. This does not affect any finding.

\`\`\`json
{"callers": ["src/billing/charge.js", "src/billing/refund.js", "src/sync/pull.js", "src/sync/push.js"], "defaultAttempts": 5, "attemptOverrides": {"src/billing/charge.js": 2, "src/billing/refund.js": 3}}
\`\`\`