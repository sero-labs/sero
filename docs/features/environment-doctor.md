# Environment Doctor — Specification

> Status: spec, not yet implemented.
> Branch for implementation: `claude/plan-environment-doctor-XBpIi` (or successor).

The Environment Doctor is a diagnostic subsystem that audits the host
environment, Sero runtime, and per-profile configuration to detect
misconfiguration and guide users toward fixes. It is designed to be useful
even when Sero itself fails to start.

---

## 1. Goals & non-goals

### Goals

- Reduce setup friction for new installs.
- Standardise debugging and bug reports (deterministic, structured output).
- Surface profile/runtime/native-module breakage early — including the cases
  where the main app cannot finish booting.
- Provide the architectural seam for *guided* and eventually *automated*
  repairs, without exposing destructive actions in v1.

### Non-goals (v1)

- Auto-fix execution. Repairs are scaffolded but not invocable from the UI
  or CLI in v1. See §10.
- Performance benchmarks, continuous monitoring, remote runtime checks.
- Live API calls to provider endpoints (we trust the existing
  `provider-health` snapshot).
- Plugin-authored doctor checks. The check registry is internal in v1.

---

## 2. Core principles

| Principle | What it means concretely |
|---|---|
| **Read-only by default** | No mutations in v1. Repair functions exist on the type but are not wired to a runner. |
| **No secret access** | Environment variable *names* may be inspected. Values must never be read, logged, or serialized. Same for `auth.json`, `.env`, `safeStorage`. |
| **Deterministic** | Given identical environment + profile, the report must be byte-equal apart from the timestamp. |
| **Structured first** | Every result is a typed object. Plaintext is a derived view. |
| **Lenient** | Reading damaged profile state must never throw. Each file produces either a parsed value or a typed error result. |
| **Modular** | Each subsystem registers its own checks. Adding a check must not touch unrelated files. |
| **Survives Sero failing to boot** | The engine has zero Electron / native-module dependencies and can run in a safe mode that skips feature initialisation. |

---

## 3. Architecture overview

The doctor has three entry points sharing one engine:

```
                       ┌────────────────────────────────────────┐
                       │          Doctor engine (Node only)     │
                       │  registry · runner · checks · repairs  │
                       │   profile-state (lenient FS reader)    │
                       └──────────┬───────────┬─────────────────┘
                                  │           │
              in-app context ─────┘           └───── safe-mode context
                                  │           │
   ┌──────────────────────────────┴──┐  ┌─────┴────────────────────────────┐
   │ 1. In-app panel (settings)      │  │ 2. Safe mode: electron --doctor  │
   │    Full Sero booted             │  │    No IPC features registered    │
   │    Active profile loaded        │  │    Profiles read defensively     │
   │    Streams progress over IPC    │  │    Renders minimal recovery UI   │
   └─────────────────────────────────┘  └──────────────────────────────────┘
                                                    │
                                                    │ wraps
                                                    ▼
                                  ┌──────────────────────────────────┐
                                  │ 3. CLI shim: sero-doctor         │
                                  │    Bundled in Sero.app           │
                                  │    Execs electron --doctor --json │
                                  │    Stdout = JSON, stderr = logs  │
                                  └──────────────────────────────────┘
```

### 3.1 Why this shape

- A pure standalone CLI would need its own signing/notarization/install
  path; most macOS users would never get it.
- An in-app-only doctor is useless precisely when it matters most (corrupt
  profile, broken native module, malformed `settings.json`).
- The hybrid handles ~90% of "Sero won't load" cases by short-circuiting
  `main.ts` before any feature import.

### 3.2 Engine constraints

The engine module **must not** import:

- anything under `electron/features/` other than its own subtree
- anything under `electron/ipc/`
- `electron`, `node-pty`, `better-sqlite3`, `@mariozechner/pi-*` SDKs,
  `@google/genai`, `@anthropic-ai/sdk`, etc.

The engine **may** import:

- Node built-ins (`fs`, `path`, `os`, `child_process`, `util`).
- Pure types from `@sero-ai/common` and renderer-safe types.
- `electron/platform/env` *constants only* (`SERO_FIXED_ROOT`, path
  helpers) — never `loadSeroEnv()` or anything that mutates `process.env`.

This is enforced in CI by a knip/eslint rule that bans those imports
inside `features/doctor/engine/**`.

---

## 4. Public types

```ts
// features/doctor/engine/types.ts

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export type DoctorCategory =
  | 'system'
  | 'runtime'
  | 'node'
  | 'profile'        // NEW vs original spec — covers profiles.json + per-profile config files
  | 'workspace'
  | 'providers'
  | 'plugins'
  | 'environment';

export interface DoctorResult {
  id: string;                   // stable, dot.separated, e.g. 'profile.settings.parse'
  category: DoctorCategory;
  status: DoctorStatus;
  message: string;
  fix?: DoctorFix;
  details?: Record<string, unknown>;  // serializable; redaction-checked at boundary
  durationMs: number;
}

export type DoctorFix =
  | { kind: 'manual';  instructions: string }
  | { kind: 'command'; command: string; args: string[]; description: string }
  | { kind: 'repair';  repairId: string; description: string; destructive: boolean };

export interface DoctorContext {
  mode: 'in-app' | 'safe';
  profile: ProfileSnapshot | null;     // null only when no profile exists at all
  allProfiles: ProfileSnapshot[];      // populated when --all-profiles, otherwise [profile]
  seroVersion: string;
  signal: AbortSignal;
  now(): Date;                         // injectable for deterministic tests
}

export interface DoctorCheck {
  id: string;
  category: DoctorCategory;
  /** Skip in quick mode if true (default false). */
  slow?: boolean;
  /** Skip in safe mode if true (e.g. live workspace exec). */
  needsBootedApp?: boolean;
  run(ctx: DoctorContext): Promise<DoctorResult | DoctorResult[]>;
  repair?: DoctorRepair;
}

export interface DoctorRepair {
  id: string;                          // matches DoctorFix.repairId
  description: string;
  destructive: boolean;                // true ⇒ requires explicit confirmation
  /** Not invoked in v1. Present for forward compatibility. */
  run(ctx: DoctorContext): Promise<RepairResult>;
}

export interface RepairResult {
  status: 'success' | 'failed' | 'skipped';
  message: string;
  backedUpFiles?: string[];
}

export interface EnvAudit {
  present: string[];           // names only, sorted
  missing: string[];           // names from `required` not present
  recommended: string[];       // names from `recommended` not present
}

export interface DoctorReport {
  schemaVersion: 1;
  timestamp: string;           // ISO-8601
  mode: 'in-app' | 'safe' | 'quick';
  system: { os: string; version: string; arch: string };
  seroVersion: string;
  profilesScanned: Array<{ id: string; pathHash: string }>; // pathHash, never raw path
  results: DoctorResult[];
  envAudit: EnvAudit;
  durationMs: number;
}
```

### 4.1 Identifier conventions

- Check IDs are dotted: `<category>.<subsystem>.<aspect>` e.g.
  `node.module.node-pty`, `profile.settings.parse`.
- Repair IDs use a `repair.` prefix: `repair.profile.settings.reset`.
- IDs are stable contracts. Renaming one is a schema-bump.

---

## 5. Engine modules

```
apps/desktop/electron/features/doctor/
  engine/
    types.ts
    registry.ts          # registerDoctorCheck / iterators
    runner.ts            # parallel run, per-check timeout, progress events
    report.ts            # serialize + redact + plaintext renderer
    redaction.ts         # one place that scrubs values; unit-tested heavily
    checks/
      system.ts
      runtime-container.ts
      runtime-docker.ts
      node.ts
      profile.ts
      profile-registry.ts
      workspace.ts
      providers.ts
      plugins.ts
      environment.ts
    repairs/
      index.ts            # repairs registered alongside checks (not invocable v1)
      profile-settings-reset.ts
      profile-auth-reset.ts
      profile-registry-rebuild.ts
      ... (see §10.2)
  profile-state/
    read.ts              # never throws; { ok, value } | { ok: false, error, path }
    snapshot.ts          # ProfileSnapshot builder
    types.ts
  modes/
    in-app.ts            # uses booted electron context
    safe-mode.ts         # bypasses loadSeroEnv; reads profiles itself
  cli.ts                 # entry called from main.ts when --doctor present
```

### 5.1 `profile-state` reader

```ts
type ReadResult<T> =
  | { ok: true; value: T; path: string }
  | { ok: false; error: { kind: 'missing' | 'denied' | 'parse' | 'schema'; message: string }; path: string };

interface ProfileSnapshot {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  isOrphan: boolean;            // not registered, but a sero-shaped dir exists
  pathExists: boolean;
  agentDirExists: boolean;
  agentDirWritable: boolean;
  files: {
    settings: ReadResult<unknown>;
    auth:     ReadResult<{ keys: string[] }>;   // names only — values never read
    env:      ReadResult<{ keys: string[] }>;   // names only
    models:   ReadResult<unknown>;
    layout:   ReadResult<unknown>;
    workspaces: ReadResult<unknown>;
  };
}
```

`read.ts` rules:

- Always returns a value; never throws.
- For `auth.json` and `.env`, parse into a structure that exposes only the
  set of keys, **never** values. The reader must actively `delete` value
  fields after parsing as a defence-in-depth measure.
- Reads are best-effort; `ENOENT` becomes `error.kind = 'missing'`,
  `EACCES` becomes `'denied'`, JSON parse errors become `'parse'`, schema
  mismatch becomes `'schema'`.

### 5.2 Registry

```ts
// engine/registry.ts
const checks: DoctorCheck[] = [];
const repairs = new Map<string, DoctorRepair>();

export function registerDoctorCheck(check: DoctorCheck): void {
  if (checks.some(c => c.id === check.id)) throw new Error(`duplicate check ${check.id}`);
  checks.push(check);
  if (check.repair) repairs.set(check.repair.id, check.repair);
}

export function listChecks(filter?: { category?: DoctorCategory; quick?: boolean; safe?: boolean }): DoctorCheck[];
export function getRepair(id: string): DoctorRepair | undefined;
```

Built-in checks self-register via a side-effecting import in
`engine/checks/index.ts` which `engine/runner.ts` imports once.

### 5.3 Runner

```ts
interface RunOptions {
  mode: 'quick' | 'full';
  category?: DoctorCategory;       // run a single category only
  signal?: AbortSignal;
  perCheckTimeoutMs?: number;      // default 3000
  onProgress?: (e: ProgressEvent) => void;
}

type ProgressEvent =
  | { kind: 'check-start'; id: string; category: DoctorCategory }
  | { kind: 'check-done';  result: DoctorResult }
  | { kind: 'all-done';    report: DoctorReport };
```

Behaviour:

- Runs all selected checks via `Promise.allSettled`.
- Each check is wrapped in a timeout race; on timeout it produces a
  synthetic `fail` result with `id: <check.id>`, `message: 'Check timed
  out after Xms'`.
- The total run honours the global budget: quick ≤ 2s, full ≤ 10s. The
  budget is enforced via a top-level `AbortController` whose signal is
  passed into each check's context.
- `onProgress` is invoked for every transition. The IPC layer translates
  these into events on `IpcChannels.doctor.event`.

### 5.4 Report assembly + redaction

`report.ts`:

- Builds the `DoctorReport`.
- Hashes profile paths with `crypto.createHash('sha256')` truncated to 12
  hex chars before serialising. Raw paths never leave the process.
- Calls `redaction.scrub(report)` before returning. `scrub` walks the
  serialised tree and:
  - Strips any field named `value`, `secret`, `token`, `apiKey`, `password`
    (case-insensitive).
  - Replaces any string matching common credential patterns
    (`sk-`, `Bearer `, GitHub PAT prefixes, hex strings ≥ 32 chars
    surrounded by quotes) with `'[redacted]'`.
  - Strips any absolute path under the user's home directory, replacing
    with `~/...` shape.
- Plaintext renderer in `report.ts::renderPlaintext` produces the
  category-grouped view shown in §8.

The redactor is a **last line of defence**. Checks must still avoid
capturing sensitive data in `details` in the first place.

---

## 6. Check catalogue (v1)

Every check below ships in v1. Each row lists:

- `id` — stable identifier
- `slow` — excluded from quick mode
- `needsBootedApp` — excluded from safe mode
- `repair` — repair scaffolded (not invocable v1)

### 6.1 System (`category: 'system'`)

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `system.os.platform` | no | no | — | macOS in v1; warn on Linux/Windows. |
| `system.os.version` | no | no | — | Reports `os.release()`; warns below Sero's minimum macOS version. |
| `system.arch` | no | no | — | `process.arch`; warn on x64 (Sero targets arm64 first). |
| `system.disk.free` | no | no | — | Free space in `SERO_FIXED_ROOT` ≥ 2 GB. Uses `child_process.execFile('df', ['-k', path])`. |
| `system.memory` | no | no | — | macOS memory pressure / reclaimable memory; non-macOS falls back to `os.freemem()`. |

### 6.2 Runtime — Apple Container (`category: 'runtime'`)

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `runtime.container.cli` | no | no | — | `CONTAINER_BIN` exists and is executable. |
| `runtime.container.version` | no | no | — | `container --version` parses; warn if below known-good range. |
| `runtime.container.daemon` | no | no | `repair.container.start` (scaffold) | Reuses `getContainerAvailability()` semantics. |
| `runtime.container.create` | yes | yes | — | Creates ephemeral container, runs `echo ok`, removes it. |
| `runtime.container.exec` | yes | yes | — | Execs in an existing test container. |
| `runtime.container.mount` | yes | yes | — | Mounts a tempdir, writes + reads a file. |

Quick mode runs the first three only.

### 6.3 Node / native modules (`category: 'node'`)

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `node.version` | no | no | — | `process.versions.node` matches the range in `apps/desktop/package.json#engines.node`. |
| `node.abi` | no | no | — | `process.versions.modules` matches the value the rebuild scripts target. |
| `node.module.node-pty` | no | no | `repair.native.rebuild-node-pty` (scaffold; runs `scripts/rebuild-node-pty.mjs`) | Dynamic `import('node-pty')` succeeds. |

### 6.4 Profile — registry (`category: 'profile'`)

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `profile.registry.exists` | no | no | — | `~/.sero-ui/profiles.json` exists. |
| `profile.registry.parse` | no | no | `repair.profile.registry.rebuild` | JSON parses + matches schema. |
| `profile.registry.activeIdResolves` | no | no | `repair.profile.registry.activeIdRepair` | `activeProfileId` references an entry. |
| `profile.registry.orphans` | no | no | — | Reports profile-shaped dirs not in the registry as `warn`. |

### 6.6 Profile — per-profile config (`category: 'profile'`)

These run once per profile in `ctx.allProfiles`. The check's emitted
`DoctorResult.id` is suffixed with the profile id hash, e.g.
`profile.settings.parse:abc123def456`.

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `profile.dir.exists` | no | no | — | Profile path resolves and is a directory. |
| `profile.dir.writable` | no | no | — | `fs.access(path, W_OK)`. |
| `profile.agent.exists` | no | no | — | `<profile>/agent/` exists. |
| `profile.settings.parse` | no | no | `repair.profile.settings.reset` | `agent/settings.json` parses; if missing or malformed, fail. |
| `profile.auth.parse` | no | no | `repair.profile.auth.reset` | `agent/auth.json` parses. **Names of credentials only — no values.** |
| `profile.env.parse` | no | no | `repair.profile.env.reset` | `agent/.env` lines parse as `KEY=VALUE`. **Names only — no values.** |
| `profile.models.parse` | no | no | `repair.profile.models.reset` | `agent/models.json` parses. |
| `profile.layout.parse` | no | no | `repair.profile.layout.reset` | `agent/layout.json` parses. |

### 6.7 Workspace (`category: 'workspace'`)

These need a booted app (`needsBootedApp: true`) and the active profile.
In safe mode they are skipped with a single info-level
`workspace.skipped.safe-mode` `pass` result.

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `workspace.exists` | no | yes | — | `workspaces.json` lists at least one workspace. |
| `workspace.runtime.selected` | no | yes | — | Active workspace has `runtime: 'host' \| 'container'`. |
| `workspace.fs.accessible` | no | yes | — | Primary root resolves and is readable. |
| `workspace.exec.smoke` | yes | yes | — | Runs `echo ok` via the workspace's exec route. |
| `workspace.terminal.smoke` | yes | yes | — | Spawns a PTY, sends `printf ready\n`, asserts output. |
| `workspace.preview.port` | yes | yes | — | Reserves a port, binds, frees. |

### 6.8 Providers (`category: 'providers'`)

In v1, **no live API calls.** Reuses the existing
`getProviderHealthSnapshot()`. One `DoctorResult` per known provider.

| id pattern | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `providers.<id>.health` | no | yes | — | Maps `provider-health` status to `pass`/`warn`/`fail`. |
| `providers.<id>.env` | no | no | — | Provider-related env *names* present (e.g. `OPENAI_API_KEY`). |
| `providers.any-usable` | no | yes | — | At least one provider has a usable model. |

### 6.9 Plugins (`category: 'plugins'`)

| id pattern | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `plugins.<id>.manifest` | no | yes | `repair.plugin.disable` | Manifest parses + schema-valid. |
| `plugins.<id>.compatibility` | no | yes | `repair.plugin.disable` | `assertPluginCompatible` passes. |
| `plugins.<id>.resources` | no | yes | — | Resource compatibility passes. |
| `plugins.<id>.load` | yes | yes | — | Activation does not throw (sandboxed, no side effects). |

### 6.10 Environment (`category: 'environment'`)

A single check producing one `DoctorResult` plus the global `EnvAudit`.

| id | slow | needsBootedApp | repair | What it checks |
|---|---|---|---|---|
| `environment.audit` | no | no | — | Builds `EnvAudit` (names only). |

Catalogues (single source of truth, edited rarely):

```ts
// engine/checks/environment.ts
const REQUIRED = ['PATH', 'HOME', 'SHELL'] as const;
const RECOMMENDED: readonly string[] = [];

// Provider-related names are sourced from electron/shared/auth/provider-catalog
// at runtime; environment.ts must not hard-code provider keys.
```

The audit emits status:

- `fail` if any `REQUIRED` name is missing.
- `warn` if any provider-related name is missing **and** that provider is
  configured in the active profile.
- `pass` otherwise.

---

## 7. Entry points

### 7.1 In-app

- **Command palette → Diagnostics → Environment Doctor** opens `DoctorPanel`.
- **First run** — after profile setup, a "Run diagnostics" button is
  shown alongside "Continue."
- **Error fallback** — when `PROFILE_STARTUP_ISSUE` is set or the
  recovery path triggers, the recovery screen exposes a "Run Doctor"
  button that calls into the same engine in safe mode.

### 7.2 Safe mode (`electron --doctor`)

The first lines of `apps/desktop/electron/main.ts` become:

```ts
import { runDoctorSafeMode } from '@electron/features/doctor/cli';

if (process.argv.includes('--doctor')) {
  await runDoctorSafeMode({
    json: process.argv.includes('--json'),
    profileFilter: parseProfileFilter(process.argv),
  });
  app.exit(computeExitCode(report));
  return;
}
```

`runDoctorSafeMode`:

- Does **not** call `loadSeroEnv()`.
- Does **not** call `registerAllIpcHandlers()`.
- Reads profiles via `profile-state/snapshot.ts`.
- If `--json` is set, writes a single JSON document to stdout and
  nothing else; all logs and progress go to stderr.
- If `--json` is not set, opens a minimal `BrowserWindow` rendering
  `DoctorPanel` in safe-mode styling (banner: *"Recovery mode — Sero
  is not running normally."*).

### 7.3 CLI shim

A shell script bundled at
`Sero.app/Contents/Resources/sero-doctor`:

```sh
#!/bin/sh
exec "$(dirname "$0")/../MacOS/Sero" --doctor "$@"
```

Added to `electron-builder.yml` `extraResources`. On first run, the app
offers (does not require) to symlink it to `/usr/local/bin/sero-doctor`
via a one-shot dialog; declined by default. The symlink offer is part of
the existing first-run setup, not part of the doctor itself.

### 7.4 CLI flags

| Flag | Effect |
|---|---|
| `--doctor` | Enter safe mode. Required. |
| `--json` | Emit a single `DoctorReport` JSON document to stdout. Stderr carries logs. |
| `--quick` | Use quick mode (≤ 2s budget; skips `slow` checks). |
| `--profile <id|path>` | Target a specific profile. Otherwise active profile is used. |
| `--all-profiles` | Scan every registered profile (and orphans). |
| `--category <name>` | Run a single category. |
| `--report <path>` | Write JSON to `<path>` instead of stdout. Implies `--json`. |

### 7.5 Exit codes

- `0` — all checks `pass` or `warn`.
- `1` — one or more checks `fail`.
- `2` — engine itself crashed (bug); stderr carries the stack.

---

## 8. UI

```
Environment Doctor                                       [ Re-run ] [ Export ]

System
  ✓ macOS 14.5
  ✓ Apple Silicon
  ✓ 42 GB free

Runtime
  ✓ Apple Container 0.3.1

Node
  ✓ Node v20.11.0
  ✓ node-pty

Profile (Default)
  ✓ Profile registry
  ✗ agent/settings.json malformed   →   Reset (will back up to .bak)
  ✓ agent/auth.json
  ✓ agent/.env (3 keys)

Workspace (sero)
  ✓ Filesystem accessible
  ✓ Terminal smoke test

Providers
  ✓ OpenAI (env)
  ⚠ Anthropic not configured

Plugins
  ✓ sero-cron-plugin
  ⚠ custom-plugin: incompatible Sero version

Environment
  ⚠ OPENAI_API_KEY missing
```

- Each row is clickable; expanding shows `details` and the `fix.instructions`.
- Failing rows with a `fix.kind === 'command'` show a copy-to-clipboard button.
- Failing rows with a `fix.kind === 'repair'` show a disabled
  *"Auto-repair (coming soon)"* button in v1.
- `[Export]` opens a save dialog (`sero-doctor-report-<ISO>.json`) and
  also offers "Copy JSON to clipboard."

In safe-mode rendering, the top of the panel shows a recovery banner and
a yellow stripe indicating the workspace category was skipped.

---

## 9. IPC

Channel constants added to
`apps/desktop/src/types/ipc-channels.ts`:

```ts
doctor: {
  /** Run a full doctor pass. Streams progress on `event`. Returns final report. */
  run:        'sero:doctor:run',
  /** Run quick mode (≤ 2s). */
  runQuick:   'sero:doctor:run-quick',
  /** Save a previously returned report to a file via native dialog. */
  exportReport: 'sero:doctor:export-report',
  /** Copy report JSON or plaintext to clipboard. */
  copyReport: 'sero:doctor:copy-report',
  /** Main → renderer push: progress events during a run. */
  event:      'sero:doctor:event',
  /** Reserved for v2 — invoke a registered repair. Returns 501 in v1. */
  repair:     'sero:doctor:repair',
}
```

Handlers live in `apps/desktop/electron/ipc/doctor/doctor.ts` and are
registered from `ipc/index.ts::registerAllIpcHandlers`. Renderer types
mirror the engine types via `@sero-ai/common`.

The `run`/`runQuick` handlers accept an optional `{ category?:
DoctorCategory; allProfiles?: boolean }` arg.

---

## 10. Repairs (scaffolded, not invocable in v1)

### 10.1 Why scaffold now

The user requirement is "guide/fix all problems eventually." Adding the
shape of repairs now (registered alongside their checks, addressable by
ID, marked destructive or not) costs ~10% extra code and avoids a
v1.5 refactor where every check has to be revisited.

### 10.2 Repair catalogue

| repairId | destructive | What v2 will do |
|---|---|---|
| `repair.profile.settings.reset` | yes | Move `agent/settings.json` to `.bak.<ts>`, write defaults from `packages/templates`. |
| `repair.profile.auth.reset` | yes | Move `agent/auth.json` to `.bak.<ts>`, clear (forces re-login). |
| `repair.profile.env.reset` | yes | Move `agent/.env` to `.bak.<ts>`, write empty file with comments. |
| `repair.profile.models.reset` | yes | Move + write defaults. |
| `repair.profile.layout.reset` | yes | Move + write defaults. |
| `repair.profile.registry.rebuild` | yes | Move `profiles.json` to `.bak.<ts>`, regenerate from on-disk profile dirs. |
| `repair.profile.registry.activeIdRepair` | no | Same as the existing in-place repair in `platform/env`. |
| `repair.native.rebuild-node-pty` | no | `node scripts/rebuild-node-pty.mjs`. |
| `repair.container.start` | no | `container system start`. |
| `repair.plugin.disable` | yes | Mark plugin disabled in settings; rename install dir to `<id>.disabled.<ts>`. |

### 10.3 Invariants for every repair

1. Always back up before mutating. Backups are sibling files with
   `.bak.<ISO-timestamp>` suffix.
2. Repairs are idempotent — running twice is a no-op the second time.
3. Repairs return `RepairResult.backedUpFiles` so the v2 UI can show what
   was moved.
4. Repairs never touch files outside the profile they target.
5. Destructive repairs require explicit user confirmation in v2 UI; the
   handler enforces this regardless of how it's called.

### 10.4 v1 wiring

- Repairs are **registered** in `repairs/index.ts` and importable from
  the engine.
- `IpcChannels.doctor.repair` is reserved but its handler returns
  `{ status: 'failed', message: 'Auto-repair not yet enabled.' }`.
- The UI shows the repair ID + description in the `fix` block but the
  invoke button is disabled and labelled *"Coming soon"*.

---

## 11. Performance budgets

| Mode | Budget | Excludes |
|---|---|---|
| Quick (default safe-mode default; in-app first run) | ≤ 2s | All `slow: true` checks. |
| Full | ≤ 10s | Nothing. |

Per-check timeout defaults to 3s and is overridable per check via
`runner.ts` options. A timed-out check produces a synthetic `fail`
result, never a thrown error.

The runner must not block the renderer; in-app it runs in the main
process and streams progress via IPC.

---

## 12. Redaction tests (mandatory)

`engine/redaction.test.ts` must include:

- Property-based test: for any 32+ char hex string in any nested string
  field, the output replaces it with `[redacted]`.
- Snapshot test: a synthetic report containing fake `OPENAI_API_KEY=sk-…`
  in `details` produces no `sk-` substring in the serialized output.
- Regression test: profile paths under `os.homedir()` are replaced with
  `~/...` shape.
- Regression test: `auth.json` parser exposes only `keys: string[]` and
  the value side of every key/value pair is `delete`d.

These tests are blocking; CI fails if any pattern leaks.

---

## 13. Determinism tests

- Running the doctor twice in the same environment produces reports
  whose JSON is byte-equal *except* for `timestamp` and `durationMs`
  fields.
- Check IDs are sorted before serialisation.
- Provider list is sorted by id.
- Profile list is sorted by hash.

---

## 14. File-by-file deltas (implementation checklist)

This list is the authoritative implementation plan. A future session
should be able to walk it top to bottom.

### New files

```
apps/desktop/electron/features/doctor/
  engine/types.ts
  engine/registry.ts
  engine/runner.ts
  engine/report.ts
  engine/redaction.ts
  engine/checks/index.ts
  engine/checks/system.ts
  engine/checks/runtime-container.ts
  engine/checks/runtime-docker.ts
  engine/checks/node.ts
  engine/checks/profile.ts
  engine/checks/profile-registry.ts
  engine/checks/workspace.ts
  engine/checks/providers.ts
  engine/checks/plugins.ts
  engine/checks/environment.ts
  engine/repairs/index.ts
  engine/repairs/profile-settings-reset.ts
  engine/repairs/profile-auth-reset.ts
  engine/repairs/profile-env-reset.ts
  engine/repairs/profile-models-reset.ts
  engine/repairs/profile-layout-reset.ts
  engine/repairs/profile-registry-rebuild.ts
  engine/repairs/profile-registry-active-id.ts
  engine/repairs/native-rebuild-node-pty.ts
  engine/repairs/container-start.ts
  engine/repairs/plugin-disable.ts
  profile-state/types.ts
  profile-state/read.ts
  profile-state/snapshot.ts
  modes/in-app.ts
  modes/safe-mode.ts
  cli.ts
  __tests__/redaction.test.ts
  __tests__/runner.test.ts
  __tests__/profile-state.test.ts
  __tests__/checks/*.test.ts

apps/desktop/electron/ipc/doctor/doctor.ts

apps/desktop/src/components/diagnostics/
  DoctorPanel.tsx
  DoctorCategorySection.tsx
  DoctorResultRow.tsx
  DoctorPanel.test.tsx
  useDoctor.ts

apps/desktop/scripts/sero-doctor.sh   # bundled CLI shim
```

### Edits

- `apps/desktop/electron/main.ts` — add `--doctor` short-circuit at top.
- `apps/desktop/electron/ipc/index.ts` — register doctor handlers.
- `apps/desktop/src/types/ipc-channels.ts` — add `doctor` block.
- `apps/desktop/src/types/ipc.ts` — re-export engine types or add slim
  renderer-side mirrors.
- `apps/desktop/electron-builder.yml` — add `sero-doctor.sh` to
  `extraResources`.
- `apps/desktop/package.json` — add `engines.node` (used by `node.version`
  check) if not already present.
- `docs/features/environment-doctor.md` — this file (already exists).
- `docs/decisions.md` — add an AD entry referencing the safe-mode
  short-circuit and the repair-scaffolding decision.

### CI / lint

- Add an eslint rule (or knip config) that bans imports from
  `electron/features/{agent,container,workspace,plugins,...}` inside
  `electron/features/doctor/engine/**`.
- Add a vitest `test:redaction` task that runs `redaction.test.ts` with
  the property-based generator seed pinned (deterministic).

### Out of scope for this PR

- Live provider API calls.
- Auto-fix (repair) execution.
- Plugin-authored doctor checks.
- Linux/Windows host support.

---

## 15. Open questions for v2+

- Plugin-authored checks: the registry needs a security boundary
  (capability declarations, sandbox). Tracked separately.
- Continuous monitoring (background re-runs on file watchers).
- Telemetry-style "known issues" matching: ship a small JSON file of
  patterns + fixes that gets matched against report failures.
- Direct upload of reports to a Sero support endpoint (with explicit
  consent + redaction preview).

---

## 16. Acceptance criteria for v1 PR

A v1 implementation is complete when:

1. `pnpm typecheck` and `pnpm test` pass.
2. `apps/desktop/dist/electron/main.mjs --doctor --json` prints a valid
   `DoctorReport` and exits 0/1 deterministically.
3. The in-app `DoctorPanel` is reachable from settings and the command
   palette and renders results streamed from the engine.
4. The redaction test suite passes with no leaked secrets.
5. Running `--doctor` against an intentionally corrupted
   `agent/settings.json` produces a `fail` result with `repairId:
   'repair.profile.settings.reset'` (the repair button is visible but
   disabled).
6. Running `--doctor` against a profile with malformed `profiles.json`
   completes (does not crash) and produces a `fail` for
   `profile.registry.parse` plus orphan-detection `warn` results.
7. Quick mode finishes in ≤ 2s on a clean macOS machine; full mode in
   ≤ 10s.
