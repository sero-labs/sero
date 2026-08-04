# Migrating Sero from Pi 0.78.0 to 0.80.6

A focused playbook for moving Sero onto Pi 0.80.6. Everything Sero does today
must keep working — normal chat, background memory jobs, web summaries, custom
providers, OAuth, voice transcription, and external plugins. Nothing here
requires dropping a feature.

## The one rule

**Do not import `@earendil-works/pi-ai/compat` in any Sero source file.** It is a
temporary shim Pi will delete. Every capability it provided has a supported
replacement (below).

One exception, and it is *not* a source import: pi-coding-agent's own type
declarations still reference `/compat`, so the `paths` entry for it in
`tsconfig.electron.json` must stay. Keep the mapping, ban the import.

### The compat surface to migrate (Sero, as of the 0.78→0.80.6 bump)

In 0.78 these helpers were **root** exports of `@earendil-works/pi-ai`; in 0.80.6
they exist only under `/compat`. So the version bump itself compiles once you
point the imports at `/compat` — that is the "make it build" shortcut, not the
migration. The real work is moving each of these to a supported replacement:

- `plugins/sero-memory-plugin/extension/consolidation.ts` — `complete()`
- `plugins/sero-memory-plugin/extension/migration.ts` — `complete()`
- `plugins/sero-memory-plugin/extension/session-lifecycle.ts` — `complete()`
- `plugins/sero-web-plugin/extension/summary-review.ts` — `complete()` + `getModel()`
- `apps/desktop/electron/shared/auth/provider-catalog.ts` — `getEnvApiKey()`
- `apps/desktop/electron/features/agent/assistants/voice-transcription-host.ts` — `getEnvApiKey()`

The first four are model dispatch (see **Dispatch**); the last two are
auth-value reads (see **Auth without dispatch**). Re-inventory before starting —
this list drifts.

## Before touching code

- **Bump the whole Pi family together** in the workspace catalog —
  `pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui` — plus any direct
  versions and plugin peer ranges. Regenerate the lockfile with pnpm; never
  hand-edit it. A mixed family causes phantom type errors and duplicate runtime
  copies.
- **Read the installed 0.80.6 declarations, not memory.** `pi-ai` and
  `pi-coding-agent` move at different speeds; the low-level model API may look
  different from what coding-agent accepts.
- **A green typecheck proves nothing about behaviour.** It does not exercise
  model dispatch, credentials, or custom providers. Those need real tests
  (see Testing).

## One owner for models, auth, and credentials

`ensureInfra()` in `apps/desktop/electron/shared/infra/shared-infra.ts` owns the
single `AuthStorage`, `ModelRegistry`, `SettingsManager`, and selected model,
all under the Sero agent dir (`PI_CODING_AGENT_DIR`). Reuse those objects. Never
create a second credential store or a second model collection.

Inside a Pi extension you reach the **same** runtime through `ctx.modelRegistry`
— and its credential store through `ctx.modelRegistry.authStorage`. This is what
lets background/plugin model work run correctly in-process without calling back
into the Electron host (there is no such bridge for in-process extensions).

## Old global calls → replacements

| Old (compat) | Use instead |
|---|---|
| `complete(model, ctx, opts)` | A short-lived isolated `AgentSession` — see **Dispatch** |
| `getModel(provider, id)` (static catalogue) | `ModelRegistry.find(provider, id)` — sees `models.json` and extension-registered models |
| `getModels()` / `getProviders()` | `ModelRegistry.getAll()` / `getAvailable()` |
| `getEnvApiKey(provider)` | `ModelRegistry` auth methods — see **Auth without dispatch** |
| global image generation | `ImagesModels` / `builtinImagesModels()` with explicit image providers |

## Dispatch — the footgun that matters most

To run a one-off completion (a memory summary, a web summary, a commit message):

**Correct:** create a short-lived isolated `AgentSession` from the runtime and
prompt it.

```ts
const { session } = await createAgentSession({
  cwd,
  model: ctx.model,                       // or ModelRegistry.find(...)
  thinkingLevel,                          // set per task: low for auto, medium for manual
  modelRegistry: ctx.modelRegistry,       // the real runtime registry
  authStorage: ctx.modelRegistry.authStorage,
  noTools: 'all',
  sessionManager: SessionManager.inMemory(cwd),
});
// subscribe for text deltas → prompt → dispose in a finally block
```

Because it dispatches through the real `ModelRegistry`, it works for **every**
provider: built-in, `models.json` custom, and extension-registered (e.g. the
`sero-alibaba-plugin`, which registers `alibaba-coding-plan` with its own base
URL). The desktop already does exactly this in
`features/agent/assistants/adhoc-agent.ts` (`runAdhocAgent`) — copy that shape,
do not reinvent it.

**Wrong — do not do this:** `builtinModels()` (or any standalone `Models`
collection) + `completeSimple()`. A `Models` collection routes each request by
`model.provider` **id**, not by API type. It only contains the built-in provider
ids, so the moment the active model belongs to a custom or extension-registered
provider it throws `Unknown provider: <id>`. This passes built-in-only tests and
silently breaks real users who run a custom provider. It is never the right tool
for dispatch.

When you move a call onto a session, preserve:

- system and user prompts, exactly
- model choice and any preferred-model fallback order
- reasoning level (compat's `reasoningEffort` → the session's `thinkingLevel`;
  keep low for automatic jobs, medium for manual)
- cancellation (thread the `AbortSignal` through)
- deterministic fallbacks callers already have
- text extraction: join only `text` blocks of the final assistant message;
  never thinking blocks
- explicit handling of empty, aborted, and error results

Keep the task session **isolated** — no extensions, skills, or tools loaded — so
a session-lifecycle extension (like memory's session-end summary) can't trigger
itself and recurse. Dispose the session on success, failure, and cancellation.

## Auth without dispatch

Reading whether a provider is usable, or getting a key value, is **not**
dispatch and needs no session:

- `ModelRegistry.getProviderAuthStatus(provider)` — is it configured (for UI)
- `ModelRegistry.getApiKeyForProvider(provider)` — stored key + documented env
  fallback, resolved in one call
- `ModelRegistry.getApiKeyAndHeaders(model)` — per-model key + headers + env for
  a request

Prefer these over a global env-key helper or a hand-rolled
`stored ?? process.env.X`.

Two carve-outs:

- **A non-Pi API that needs the raw key and has its own retry** (OpenAI voice
  transcription: stored key primary, env key fallback on 401/403). Read the
  documented env var and the stored `AuthStorage` key directly and keep them
  **separate** — `getApiKeyForProvider` collapses them and would break the
  fallback. This is not a chat model; it needs no session.
- **A hand-maintained provider-list UI** (`shared/auth/provider-catalog.ts`).
  If Sero keeps its own mirror of Pi's provider list, keep the env-var names in
  that data rather than reaching for a global helper. Package-provider manifests
  stay as an additive source.

## Private SDK internals

Where Sero must reach past the public API into a private field/method (e.g.
`sdk-private-adapter.ts` writing a session's cached base prompt or calling a
private rewrite hook), isolate it behind one narrow adapter with a
`VALIDATED_PI_VERSION` constant beside it and a runtime warning if the shape is
missing.

On the version bump, re-validate empirically — a green typecheck cannot see
these accesses (they cast through `unknown`):

- Grep the installed **compiled JS** for the literal `_underscore` names;
  `.d.ts` files often mangle private members to meaningless short names.
- Prove behaviour with a test that drives a **real** session through the adapter
  and reads the public result (e.g. set the base prompt, then read the public
  `systemPrompt` getter). A test against a hand-built fake only checks the
  adapter's own branching.
- When it holds, bump the version constant **and** every test that asserts on it
  in the same change. A stale "validated against" constant is itself a bug.

## Types, unions, contexts

- Import Pi's public types; don't keep local copies. New required fields should
  then fail typecheck until fixed.
- If `ThinkingLevel` (or similar closed union) gains a value, update every
  exhaustive mapping — option arrays, labels, theme colours, schemas, IPC types,
  defaults, tests. Use `satisfies readonly ThinkingLevel[]` and
  `Record<ThinkingLevel, …>` so future additions fail at compile time. Never
  relabel an existing value to stand in for a new one.
- If `ExtensionContext` / command contexts gain fields or callbacks, update all
  builders, bridges, fallbacks, and test fixtures together. Forward real values;
  only use fixed values for genuinely synthetic contexts. No `any`,
  `@ts-ignore`, `@ts-expect-error`, or broad casts — they hide the exact changes
  the migration must surface.

## Subpath exports & tsconfig

Some public `pi-ai` subpaths (e.g. `oauth`) don't resolve under the Electron
config's `moduleResolution: node`. Add a narrow `paths` entry pointing at the
built declaration dir. Keep the `/compat` mapping too (upstream `.d.ts` needs
it), even though no Sero source imports `/compat`. Verify both type resolution
**and** that the packaged app resolves the runtime files.

## Extensions

- Confirm lifecycle event names and callback context shapes still exist in the
  typed API.
- Keep TypeBox helpers (`StringEnum`, `Type`) and public types as **root**
  imports from `@earendil-works/pi-ai`.
- Keep Pi dependencies as peer deps; keep extensions free of Sero
  renderer/Electron imports.

## Testing — the tests that would have caught the mess

Use Pi's fake provider or mocked sessions; never call live providers.

- **A custom/extension-registered provider must dispatch.** Register an
  Alibaba-style provider (`registerProvider` with a non-built-in id + custom base
  URL) and prove a background job completes through it. This is the test that
  distinguishes the correct session approach from the broken `builtinModels()`
  one — do not skip it.
- preferred-model selection and fallback
- reasoning level preserved (auto = low, manual = medium)
- credentials: stored key, env key, OAuth refresh, command-based, custom headers
- background jobs (cron, session-end): no recursion, session disposed every path
- cancellation, empty/aborted responses, deterministic fallback
- non-model path: voice transcription stored-key primary + env fallback
- private-adapter real-session re-validation
- packaged app loads and can create a real session

## Order of work

1. Bump the Pi family + regenerate the lockfile.
2. Inventory every Pi import/subpath across apps, packages, plugins, and
   external plugins.
3. Typecheck to map the breakage.
4. Update closed unions and context builders/fixtures.
5. Move each one-off completion onto an isolated runtime session; move auth/status
   reads onto `ModelRegistry` methods.
6. Add `paths` entries for any public subpath that won't resolve.
7. Write the behaviour tests above — including the custom-provider dispatch test —
   before deleting the old calls.
8. Re-validate the private-internal adapter and bump its version constant.
9. Typecheck, test, build the packaged app, launch it, create a real session.
10. Final search: no `@earendil-works/pi-ai/compat` import in any `.ts`/`.tsx`
    under apps, packages, or plugins.

## Validation

```bash
pnpm install && pnpm typecheck && pnpm test && pnpm build
rg -n "@earendil-works/pi-ai/compat" apps packages plugins --glob '*.ts' --glob '*.tsx'
```

Expect: typecheck and tests pass without suppressions; the compat search returns
nothing (the tsconfig mapping is in a `.json`, not matched); custom providers,
OAuth, and env credentials still work; background jobs don't write to the user's
chat or recurse; the packaged app starts and runs a session.
