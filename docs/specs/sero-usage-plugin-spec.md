# Sero Usage Plugin — Specification

**Built-in global plugin that aggregates AI usage across all sessions in the
active profile and presents it in a Usage app plus a dashboard widget.**

This is a **clean-room spec**: it describes the observable behaviour of an
existing Pi `/usage` TUI extension (data model, aggregation rules, formatting)
so the plugin can be implemented from scratch inside this repo. Do **not** copy
source code from the original extension — reimplement from this document,
following the `sero-plugin` and `sero-dashboard-ui` skills.

---

## 1. Overview

- **Problem**: Sero records token/cost usage in every session `.jsonl` file,
  but there is no way to see aggregate usage — per provider, per model, per
  session, or over time — without leaving the app.
- **Solution**: A built-in plugin (`plugins/sero-usage-plugin/`) that scans the
  profile's session files, aggregates usage into a compact state file, and
  renders it in a rich web UI (stat tiles, activity heatmap, provider/model
  table, per-session breakdown) plus a compact dashboard widget. Data
  refreshes on demand and on a user-selectable interval.
- **Success criteria**:
  - Usage app shows totals, provider/model breakdown, daily activity and top
    sessions for Today / This Week / Last Week / All Time.
  - Dashboard widget shows an at-a-glance summary that stays legible at 1×1.
  - Refresh completes without blocking the agent or the UI, and repeated
    refreshes are incremental (unchanged files are not re-parsed).
  - Works per profile automatically — no configuration needed.

### Naming

| Item | Value |
|---|---|
| Directory | `plugins/sero-usage-plugin/` |
| npm package | `@sero-ai/plugin-usage` |
| App id | `usage` |
| Display name | `Usage` |
| Icon (Lucide) | `chart-column` |
| Scope | `global` |
| State file (manifest field) | `.sero/apps/usage/state.json` |
| Dev port | `5189` (unique; checked against existing plugins) |
| Tool | `usage` (CLI-bridged → `sero usage …`) |

---

## 2. Source data

### 2.1 Where sessions live

Session transcripts are `.jsonl` files under the profile's agent directory:

```
${PI_CODING_AGENT_DIR}/sessions/**/*.jsonl
```

Resolution: `process.env.PI_CODING_AGENT_DIR` only. Sero always sets it to the
active profile's agent dir (`SERO_HOME/agent`), so aggregation is per profile
with zero extra work. This is a Sero-only built-in plugin — there is **no
`~/.pi/agent` fallback**; if the env var is somehow unset, the `refresh` action
returns an explicit error instead of scanning standalone Pi CLI sessions.

Scan is **recursive** (session files may be nested in subdirectories) and
**read-only** — the plugin never writes into the sessions tree.

### 2.2 Entries the scanner consumes

Each line is one JSON object. Only three entry shapes matter; everything else
(and any malformed line) is skipped silently:

| Entry | Fields used |
|---|---|
| `type: "session"` (header) | `id`, `cwd`, `timestamp` |
| `type: "session_info"` | `name` (session display name, may appear later in the file) |
| `type: "message"` with `message.role === "assistant"` | `message.provider`, `message.model`, `message.usage.{input, output, cacheRead, cacheWrite, cost.total}`, `message.timestamp` (fallback: entry `timestamp`) |

Assistant messages missing `usage`, `provider` or `model` are ignored. A file
with no session header is ignored. For the per-session breakdown, the first
`user` message's text is captured as a fallback label when no `session_info`
name exists (same rule the desktop session browser uses —
`apps/desktop/electron/ipc/agent/core/session-metadata.ts`).

### 2.3 Deduplication (critical)

Branched/forked session files duplicate copied history. To keep totals honest,
messages are deduplicated **globally across all files** with the fingerprint:

```
`${timestamp}:${input + output + cacheRead + cacheWrite}`
```

A message whose fingerprint was already seen in this scan is skipped. Files
must be processed in a stable order (sorted by path) so results are
deterministic.

### 2.4 Token accounting rules

These formulas are product decisions inherited from the original extension —
keep them, and state them in the UI footnote:

| Displayed value | Formula | Rationale |
|---|---|---|
| **Tokens** (headline) | `input + output + cacheWrite` | Fresh tokens processed. `cacheRead` is excluded — repeated cache hits would dominate totals. `cacheWrite` is included — those prompt tokens were newly written and billed. |
| **↑ In** | `input + cacheWrite` | Fresh input sent this turn, even for providers (Anthropic) that split cached-prompt creation out of the input count. |
| **↓ Out** | `output` | |
| **Cache** | `cacheRead + cacheWrite` | |
| **Cost** | `usage.cost.total` summed | Zero/absent cost (subscription auth, local models) renders as `-`, never `$0.00`. |

### 2.5 Time periods and buckets

- Periods: **Today** (local midnight), **This Week** (Monday 00:00 local),
  **Last Week** (previous Monday → Monday), **All Time**.
- A message belongs to every period containing its timestamp; a session counts
  toward a period's session count if it contributed ≥ 1 message to it.
- **Daily buckets** (for the heatmap and trend chart): one bucket per local
  calendar day for the last 365 days, each holding
  `{ date, cost, tokens, input, output, messages }` using the formulas above,
  plus a per-provider split (`byProvider`) so the trend chart can stack by
  provider. Days with no activity may be omitted from state (the UI fills gaps).
- **Hourly buckets**: the same shape per local hour (0–23) of the current day,
  recomputed on every refresh — backing the Today tab's trend chart.
- Messages with missing/unparseable timestamps count toward All Time only and
  are excluded from time-sensitive views.

---

## 3. Architecture

```
                 SERO_HOME/apps/usage/state.json   (aggregated, UI-facing)
                        ▲ write            ▲ watch (useAppState)
   sessions/**/*.jsonl ─┘                  │
        ▲ read                             │
        │                          ┌───────┴────────┐
  extension/ `usage` tool          │ UsageApp (UI)  │   UsageWidget (dashboard)
  (scan → aggregate → state)       └────────────────┘
```

Three parts, no background runtime:

1. **Pi extension** (`extension/`) — owns all scanning/aggregation. Registers
   the `usage` tool (CLI-bridged). Follows standard extension boundaries (no
   Sero/desktop imports), but is Sero-only in practice — it resolves
   everything from Sero-provided env vars and is never run in the plain Pi CLI.
2. **Web UI** (`ui/`) — reads `state.json` via `useAppState`, triggers
   refreshes via `useAppTools().run('usage', { action: 'refresh' })`.
3. **Dashboard widget** (`ui/widgets/`) — compact summary from the same state.

### 3.1 Why not the cron plugin (decision)

The cron plugin schedules **agent prompts** — each job spawns an agent session,
shows up in the user's job list, and burns tokens. A usage refresh is a pure
local data pass; routing it through cron would create cross-plugin coupling and
user-visible noise for no benefit. **Decision: the plugin owns its refresh
schedule** (see 3.3). If a truly headless refresh is ever needed (Sero closed,
gateway-only), revisit with a `runtime/` entry — out of scope for v1.

### 3.2 The `usage` tool

One tool, action-based (use `StringEnum` for the action field), bridged to the
CLI (`bridgeTools: ["usage"]` → `sero usage …`):

| Action | Params | Behaviour |
|---|---|---|
| `refresh` | `force?: boolean` | Run a scan and rewrite `state.json`. If a scan is already running, return its status instead of starting another (module-level singleton guard, same pattern as the cron scheduler singleton). Returns a one-line summary (files scanned, files reused from cache, duration, totals). |
| `summary` | `period?` (`today` default) | Text summary of totals + top providers for the agent/CLI. |
| `sessions` | `period?`, `limit?` (default 20, max 50) | Top sessions by cost for the period, served from the top-50 stored in state. |
| `config` | `refreshIntervalMinutes?` | Read/update settings stored in state (`0` = manual only). |

Keep tool output concise (it lands in agent context). No `pi.registerCommand`
named `usage` — that would shadow the bridged CLI entry; if a `/usage` slash
shortcut is wanted, add a prompt template under `prompts/` declared in
`pi.prompts`.

### 3.3 Refresh scheduling

- **Interval options**: Manual (off), 5 m, 30 m, 1 h, 6 h, 12 h, 24 h.
  Default: **30 m**. Stored in state (`settings.refreshIntervalMinutes`).
- **Trigger locations**: a small shared hook (`ui/lib/useAutoRefresh.ts`) used
  by both the app and the widget:
  - on mount: refresh if `now - lastRefreshedAt ≥ interval` (and always if
    state is empty);
  - `setInterval` at 60 s: re-check the same staleness condition.
- **Concurrency**: staleness is re-checked against the latest state before
  each call, and the extension-side singleton guard makes concurrent
  `refresh` calls idempotent — so app + widget both mounting is safe.
- **Manual refresh**: button in both surfaces; always calls
  `refresh { force: true }`.

Because widgets live on the dashboard, an open Sero window keeps the schedule
alive; when Sero was closed, the on-mount staleness check catches up
immediately. This needs `requiredHostCapabilities: ["appAgent.invokeTool", "tool.cli"]`.

### 3.4 Incremental scan cache

Parsing every `.jsonl` on every refresh does not scale (hundreds of files,
some large). The scanner keeps a **per-file cache** keyed by absolute path
with fingerprint `{ mtimeMs, size }`:

- Fingerprint unchanged → reuse the cached compact per-message records
  (needed because dedup is cross-file, so aggregation must re-run globally,
  but parsing — the expensive part — is skipped).
- Cached record shape (compact): `{ provider, model, cost, input, output,
  cacheRead, cacheWrite, timestamp }` plus per-file `{ sessionId, name,
  firstMessage, cwd }`.
- Cache lives at `SERO_HOME/apps/usage/scan-cache.json` (data → profile dir is
  correct; this is not a tool install). Versioned with `schemaVersion`;
  mismatch → discard and rescan. Atomic writes (temp → rename).
- Deleted files are dropped from the cache on each scan.

Scan hygiene: stream files line-by-line (`readline` over `createReadStream`),
yield to the event loop periodically, skip unreadable files/dirs silently,
and cap malformed-line handling at "skip and continue".

### 3.5 State shape (`shared/types.ts`)

Single source of truth imported by extension, UI and widget. JSON-serialisable
only; export `DEFAULT_STATE`. Keep it compact — this file is watched and
shipped to the renderer on every change.

```ts
interface UsageState {
  schemaVersion: 1;
  settings: { refreshIntervalMinutes: number };          // 0 = manual
  lastRefreshedAt: number | null;                        // epoch ms
  lastScan: { files: number; reused: number; durationMs: number } | null;
  periods: Record<'today' | 'thisWeek' | 'lastWeek' | 'allTime', PeriodStats>;
  daily: DailyBucket[];                                  // ≤ 365 entries, ascending date
  hourly: HourlyBucket[];                                // current day only, ≤ 24 entries
}

interface TokenBreakdown { total: number; input: number; output: number; cacheRead: number; cacheWrite: number }

interface PeriodStats {
  totals: { sessions: number; messages: number; cost: number; tokens: TokenBreakdown };
  providers: ProviderStats[];                            // sorted by cost desc
  topSessions: SessionStats[];                           // top 50 by cost
}

interface ProviderStats {
  provider: string;
  sessions: number; messages: number; cost: number; tokens: TokenBreakdown;
  models: ModelStats[];                                  // sorted by cost desc
}

interface ModelStats {
  model: string;
  sessions: number; messages: number; cost: number; tokens: TokenBreakdown;
}

interface SessionStats {
  id: string;
  label: string;            // session_info name, else first user message (truncated ~80 chars), else id
  cwd: string;              // workspace path, for display
  path: string;             // absolute session .jsonl path — for reveal-in-folder
  messages: number; cost: number; tokens: TokenBreakdown;
  firstActivity: number; lastActivity: number;           // epoch ms
}

interface ProviderSlice { cost: number; tokens: number; messages: number }

interface DailyBucket {
  date: string;             // YYYY-MM-DD local
  cost: number; tokens: number; input: number; output: number; messages: number;
  byProvider: Record<string, ProviderSlice>;             // for the stacked trend chart
}

interface HourlyBucket {
  hour: number;             // 0–23, local, current day
  cost: number; tokens: number; messages: number;
  byProvider: Record<string, ProviderSlice>;
}
```

State path: Sero resolves global app state to `SERO_HOME/apps/usage/state.json`;
the extension resolves the same via `process.env.SERO_HOME` (always set by
Sero — error if absent, no cwd fallback). Atomic writes only. The manifest
`stateFile` field is still declared because the app-manifest schema requires
it, but it is never used as a runtime fallback.

---

## 4. UI specification

All presentation composes `@sero-ai/ui` — shadcn primitives, the dashboard
component set (`WidgetContent`, `Stack`, `Inline`, `Grid`, `Metric`, `Text`,
`ItemList`, `DataBoundary`, `EmptyState`, …) and the recharts-based
`ChartContainer`/`ChartTooltip` for charts. Semantic theme tokens only — no
hard-coded colours. Read the `dataviz` guidance before building the charts.

### 4.1 Usage app (`ui/UsageApp.tsx`)

Layout, top to bottom (reference: the two design screenshots — TUI table and
"pi-tokamak" heatmap page):

1. **Header row** — period tabs `Today · This Week · Last Week · All Time`
   (shadcn `Tabs`); right-aligned: refresh-interval `Select` (Manual/5m/30m/
   1h/6h/12h/24h), manual refresh `IconButton` (spinning while a refresh is in
   flight), and muted "updated 5 min ago" text derived from `lastRefreshedAt`.
2. **Stat tile row** — six `Metric` tiles for the active period: Total cost,
   Total tokens, Input (↑In formula), Output, Sessions, Messages. Responsive
   `Grid` (wraps on narrow widths).
3. **Daily Activity heatmap** — GitHub-style calendar (53×7 CSS grid),
   plugin-local component. Metric selector: `tokens | cost | messages`.
   5-step colour scale from theme chart/success tokens; empty cells use a
   muted surface token. Cell tooltip: date + formatted value. Legend
   `less → more` + "max N/day". Today is the rightmost column. Always renders
   the full trailing year regardless of period tab (it is a global view).
4. **Cost/usage trend chart** — stacked bar chart of the selected metric,
   split by provider (top 5 providers + "other"), via `ChartContainer`.
   X-range follows the active period: **Today shows per-hour bars** (from
   `hourly`, 00–23 with empty hours rendered as gaps), week/all-time views
   show per-day bars (from `daily`).
5. **By Provider · Model table** — the core table. One row group per provider
   (sorted by cost desc): provider header row carrying the aggregate values,
   model rows beneath (no separate subtotal row — the header row already
   shows the aggregates). Columns: `Provider/Model · Sessions · Msgs · Cost ·
   Tokens · ↑In · ↓Out · Cache`. Providers collapsible (default expanded);
   dim the ↑In/↓Out/Cache columns (`text-muted-foreground`).
6. **Sessions section** (the optional per-session breakdown) — table of
   `topSessions` for the active period: Label, Workspace (basename of `cwd`),
   Msgs, Tokens, Cost, Last active (relative). Sortable by cost (default),
   tokens, last active. Capped at the stored top 50 with a muted footer note
   when more sessions exist. Each row has a reveal-in-folder action
   (`IconButton`, `folder-open`) calling
   `window.sero.shell.showItemInFolder(session.path)` — the same generic host
   bridge the status bar uses for the workspace/profile folder.
7. **Footnote** — muted, single line:
   `Tokens = Input + Output + CacheWrite · ↑In = Input + CacheWrite · costs are approximate, based on local session data.`

States: `DataBoundary` everywhere — skeleton tiles/table while first scan
runs, `EmptyState` ("No usage recorded yet" / "No usage for this period"),
`Alert` on scan failure (surface the tool error text).

### 4.2 Dashboard widget (`ui/widgets/UsageWidget.tsx`)

Static manifest widget, id `usage-summary`, name `Usage`, default 2×2,
min 1×1, max 4×3. Content per size (container queries via `WidgetContent`):

- **1×1** — today's cost as a big `Metric` + tokens beneath (`Text variant="muted"`).
- **2×2 (default)** — `Metric` pair: cost Today and This Week; a 14-day
  mini bar sparkline (tokens/day) built from `daily`; muted "top: anthropic
  $257" line for the week's top provider.
- **3×2+** — adds a compact 3-row provider `ItemList` (name → cost) for This
  Week.

Clicking through to the app is host-owned chrome — do not add custom open
buttons. Widget participates in auto-refresh via the shared hook (3.3).

### 4.3 Formatting rules (shared `ui/lib/format.ts` + extension summaries)

| Value | Rule |
|---|---|
| Cost | `-` when 0; 4 dp under $0.01; 2 dp under $10; 1 dp under $100; whole dollars above |
| Tokens | `-` when 0; raw under 1 000; `1.2k` under 10 000; `123k` under 1 M; `1.4M` under 10 M; `284M` above |
| Counts | `-` when 0; else locale-formatted (`4,148`) |
| Relative time | `just now / N min ago / N h ago / date` |

---

## 5. Package layout & manifest

```
plugins/sero-usage-plugin/
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── shared/                   # imported by extension AND UI
│   ├── types.ts              # UsageState + DEFAULT_STATE + normalize (§3.5)
│   ├── period.ts             # period boundaries, dateKey (§2.5)
│   ├── format.ts             # display formatting rules (§4.3)
│   └── __tests__/
├── extension/
│   ├── index.ts              # entry: registers the tool
│   ├── tools.ts              # `usage` tool actions + CLI surface (§3.2)
│   ├── refresh.ts            # scan → aggregate → state, in-flight singleton
│   ├── scan.ts               # file discovery, streaming parse (§2)
│   ├── aggregate.ts          # dedup, periods, daily/hourly buckets, rollups
│   ├── scan-cache.ts         # per-file fingerprint cache (§3.4)
│   ├── state-io.ts           # Sero-only path resolution, atomic writes
│   ├── __tests__/
│   └── tsconfig.json
└── ui/
    ├── UsageApp.tsx
    ├── components/           # StatTiles, ActivityHeatmap, TrendChart,
    │                         # ProviderTable, SessionsTable
    ├── widgets/UsageWidget.tsx
    ├── lib/useAutoRefresh.ts # staleness-driven refresh (§3.3)
    ├── lib/trend.ts          # metric selection + provider ranking
    ├── lib/host.ts           # reveal-in-folder shell bridge
    ├── styles.css            # imports @sero-ai/ui/styles/plugin.css + @source
    ├── index.html
    ├── vite-env.d.ts
    └── tsconfig.json
```

Every source file stays under 500 LOC — the component split above exists for
that reason.

`package.json` essentials (full template in the `sero-plugin` skill):

```jsonc
{
  "name": "@sero-ai/plugin-usage",
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./extension/index.ts"] },
  "sero": {
    "app": {
      "id": "usage",
      "name": "Usage",
      "icon": "chart-column",
      "scope": "global",
      "stateFile": ".sero/apps/usage/state.json",   // required by manifest schema; unused at runtime
      "ui": "./dist/ui/remoteEntry.js",
      "component": "UsageApp",
      "devPort": 5189,
      "widgets": [{
        "id": "usage-summary",
        "name": "Usage",
        "component": "UsageWidget",
        "description": "AI usage and cost summary",
        "defaultSize": { "w": 2, "h": 2 },
        "minSize": { "w": 1, "h": 1 },
        "maxSize": { "w": 4, "h": 3 }
      }]
    },
    "plugin": {
      "category": "productivity",
      "tags": ["usage", "cost", "tokens", "analytics"],
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"],
      "bridgeTools": ["usage"]
    }
  }
}
```

Pi SDK packages go in `peerDependencies` (`catalog:peer`); `@sero-ai/ui`,
`@sero-ai/app-runtime`, react, vite tooling in `devDependencies` (`catalog:`);
`typebox` in `dependencies`. MF remote name `sero_usage`; exposes
`./UsageApp` and `./UsageWidget`, both importing `./styles.css`.

Being a built-in plugin, it is auto-discovered from `plugins/` and does not
appear in the Plugin Manager.

---

## 6. Performance & robustness requirements

- First full scan of ~500 files / ~200 MB of jsonl must not freeze the app:
  streaming parse, periodic event-loop yields, and the UI stays interactive
  (refresh runs through the app-agent tool invocation, off the renderer).
- Warm refresh (no file changes) should be near-instant: all files reused
  from the fingerprint cache, aggregation only.
- A corrupt `state.json` or `scan-cache.json` must never crash anything:
  invalid JSON → treat as absent, rescan, rewrite.
- All writes atomic (temp file → rename). Never use `localStorage`.
- No network access; read-only against session files.

## 7. Non-goals (v1)

- No provider billing-API integration — local session data only.
- No per-workspace scope, no cross-profile aggregation.
- No background runtime / headless refresh while Sero is closed.
- No insights/cost-attribution heuristics (the original extension's Insights
  view is intentionally dropped, not deferred).
- No CSV export.

## 8. Verification checklist

1. `pnpm install && pnpm --filter @sero-ai/plugin-usage build && pnpm typecheck` pass.
2. `SERO_DEV_PLUGINS=usage bash scripts/dev.sh` → Usage app appears in the
   sidebar; dashboard widget available in the Add Widget picker.
3. First open triggers a scan; tiles/heatmap/table populate; numbers match a
   hand-checked sample session file (dedup rule verified against a branched
   session pair).
4. `sero usage summary` and `sero usage sessions` return concise text in a
   chat session; `/reload` shows no command/tool name shadowing.
5. Interval select persists across restarts (state, not localStorage);
   staleness refresh fires after the interval elapses; two surfaces mounted
   do not double-scan.
6. Widget legible at 1×1, 2×2 and 3×2; light and dark themes; empty-profile
   case shows `EmptyState`, not zeros.
7. Unit tests (vitest, colocated `__tests__/` like the cron plugin) for:
   period bucketing, dedup fingerprinting, token formulas, formatting rules,
   cache reuse/invalidation, top-session ranking.

## 9. Resolved decisions

- **Today tab trend chart**: shows per-hour stacked bars (not hidden) — see
  §2.5 hourly buckets and §4.1 item 4.
- **Insights view**: dropped entirely, not deferred — see non-goals.
- **Session drill-down**: each sessions-table row reveals the session's
  `.jsonl` in the file manager via `window.sero.shell.showItemInFolder`
  (existing generic host bridge; no new seam needed). Opening the session in
  the Admin session browser remains out of scope.
