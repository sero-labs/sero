# Review: Generative Dashboard Widgets Plan

Wargame review of [generative-dashboard-widgets.md](generative-dashboard-widgets.md),
checked against the current codebase on `mockup/modern-dashboard-widgets`.

## Verdict

The plan is unusually thorough on the declarative language itself (schema,
expressions, versioning, validation, lifecycle states) and the two-model
coexistence story is well argued. The weaknesses are at the edges where the
plan meets the existing codebase: it assumes runtime surfaces that do not
exist (a place for plugin data sources and actions to execute), couples a
dashboard feature to a chat-stack migration (assistant-ui runtime), and
leaves persistence and process-boundary questions unanswered. Several
referenced types are never defined. The phasing front-loads risk into a
very large Phase 0/1 instead of a thin walking skeleton.

Issues are ordered by severity. C = critical (architecture must change or be
decided before Phase 0), G = gap (underspecified, will block implementation),
S = security/trust, P = phasing, M = minor/doc defect.

---

## Critical issues

### C1. Plugin data sources and actions have nowhere to run

`PluginWidgetDataSource.subscribe(context)` and `PluginWidgetAction.execute(input, context)`
are code contributions, but plugins currently have exactly two runtime
surfaces:

1. **Federated UI modules** — run in the renderer, and only while a widget or
   app from that plugin is actually mounted. Loaded via
   `getFederatedComponent` with an LRU module cache of 5
   (`apps/desktop/src/lib/federation-registry.ts`).
2. **Pi extensions** — run in the main process, but only inside a live agent
   session (`electron/ipc/agent/`).

Neither is a home for an always-available data source. If data sources run in
the renderer, every declarative widget must load its plugin's federated
module anyway — which defeats the claim that declarative widgets don't
execute plugin code, and ties declarative rendering to module federation
loading, caching and failure modes. If they run in the main process, Sero
needs a brand-new host-side plugin service runtime, which is a major piece
of infrastructure the plan never mentions.

Note how the cron widget actually gets data today: the extension writes
`~/.sero-ui/apps/cron/state.json`, and the widget reads it reactively via
`useAppState` → `window.sero.appState.watch/onChange`
(`packages/app-runtime/src/use-app-state.ts`). There is already a
process-neutral, always-available data channel: **app state files**.

**Recommendation:** define the v1 data-source contract as *app state file +
declared selector schema* (i.e. a manifest entry describing what paths in the
state file mean, with a schema), not as a live `subscribe()` code contract.
`$bind` then resolves against watched state files, which works today with
zero new process infrastructure and keeps the shared-subscription problem
trivial (one file watcher per state file, already implemented). Introduce a
code-based `subscribe()` contract only when a real widget needs data that
cannot flow through a state file (true high-frequency streams), and decide
the hosting process explicitly at that point.

Actions have the same problem, worse: `execute()` needs a process. The
realistic v1 options are (a) route actions through the existing tool bridge /
extension commands, which requires an agent session to be alive, or (b) a
host-side action host. The plan must pick one; "action registry" is not a
location.

### C2. The plan couples a dashboard feature to a chat replatform

Phase 1 begins with "Add assistant-ui Pi runtime to Sero's assistant
surface". Sero's chat surface is already built: ai-elements components
(AD-006) driven by the IPC agent pool (AD-011). Sero has no assistant-ui
dependency anywhere today. Swapping or augmenting the chat runtime is a
significant migration with its own risks (streaming, approvals, tool-call UI,
session restore) and is **orthogonal to dashboards** — nothing in the
declarative widget model requires the chat surface to change. The
recommended HTTP/SSE transport also duplicates the existing, working IPC
transport and creates a second path for auth and permissions.

**Recommendation:** cut the Pi-runtime integration out of this feature
entirely. Agent authoring (Phase 5) needs tools and a way to render a
preview in chat — both achievable with the existing chat stack (a tool
result that the existing chat UI renders with the same
`DashboardDefinitionRenderer`). If assistant-ui is adopted for chat, do it
as its own project with its own justification.

### C3. assistant-ui as the definition renderer buys little and costs a lot

Under this plan Sero owns: the serialisable schema language, `compileToZod`,
the expression/condition/collection grammars, the data runtime, the action
runtime, all registries, versioning, migrations, validation, fixtures, and
the Studio. What remains for `@assistant-ui/react-generative-ui` is the
smallest part: recursively rendering a validated JSON tree against a
component map — roughly a few hundred lines to own outright.

Meanwhile the plan's own requirements strain against a third-party library:

- Dynamic vocabulary reconstruction on install/disable (spike item 1–2)
- Multiple pinned revisions of one component rendering simultaneously
  (spike item 4) — a single flat component library keyed by type name
  cannot do this without name-mangling per revision
- Spike item 5 already anticipates the answer: "one generic composite
  renderer backed by the Sero registry" — at which point assistant-ui is
  rendering a single passthrough component and contributing nothing

There is also a hidden dependency cost: Zod is only required because
assistant-ui consumes Zod schemas. With a Sero-owned renderer, validation
can interpret `SeroValueSchema` directly and the `compileToZod` step (and a
renderer-bundle Zod dependency) disappears. Note there is currently **no Zod
in any renderer/runtime package** — it exists only on the extension side.

**Recommendation:** invert the default. The `DashboardDefinitionRenderer`
should be Sero-owned; the Phase 0 spike becomes a *go/no-go evaluation* of
whether assistant-ui adds enough (e.g. streaming partial-tree rendering
during chat previews) to justify adopting it in the chat-preview path only.
The plan currently treats the spike as "prove how to make it work", which
presumes the conclusion. Also verify the package's actual name, API and
maturity before anchoring on it — the plan cites it without a version.

### C4. Agent toolkits vs AD-020 token budget

The plan proposes roughly 20 new agent tools across `componentToolkit`,
`repairToolkit`, `dashboardToolkit` and four discovery functions. AD-020
exists precisely because per-tool schemas cost 3,000–5,000 tokens per turn,
and its rule is that app/extension tools go through `pi.registerTool()` and
get bridged into `sero-cli`. The plan never mentions the bridge. Progressive
capability discovery solves the *vocabulary* token problem but not the
*tool schema* token problem.

**Recommendation:** state explicitly that all dashboard/component tools are
bridged per AD-020 (or consolidated into one `dashboard` tool with
subcommands), and include the expected token overhead in the Phase 5 design.

### C5. Persistence is unspecified and the layout migration is missing

- The current `DashboardWidgetInstance`
  (`apps/desktop/src/types/dashboard.ts`) has no `kind`, no `config`, no
  timestamps. The plan's discriminated union requires migrating existing
  `layout.json` dashboard state (existing instances → `kind: "component"`),
  but the migration infrastructure in the plan covers only *definitions*,
  not the dashboard layout state itself. `hydrate` in
  `src/stores/dashboard.ts` will need a versioned upgrade path.
- Definition, component and registry records need a named storage location.
  Given AD-022 they must live under `SERO_HOME` (profile-scoped). They must
  **not** ride `layout.json` — it is a single debounced whole-state write
  (80 ms, `persist-layout.ts`) and unsuitable for revision histories.
- Registries are mutated from at least two directions (agent installs,
  Studio edits). Atomic write strategy and single-writer ownership (main
  process owns writes, renderer goes through IPC) should be stated, matching
  the existing four-layer IPC rule.

**Recommendation:** add a "Storage layout" section: e.g.
`SERO_HOME/dashboard/definitions/`, `components/`, one JSON file per
definition with revisions, main-process-owned writes, and an explicit
`layout.json` migration step in Phase 1.

---

## Gaps (will block implementation)

### G1. There are three widget models today, not two

`useWidgetRegistration` / `widget-registry.ts` in `@sero-ai/app-runtime`
lets an app register a live React component as a widget at runtime
(`source: 'runtime'` in `WidgetMount`). No plugin uses it yet, but it is
shipped API. The plan's "two first-class models" framing should either
subsume this path under "federated" explicitly, deprecate it, or explain
how it coexists — otherwise `getAvailableWidgets` and the Add Widget
dialog have an undocumented third case.

### G2. Referenced types are never defined

`WidgetDataBinding`, `WidgetActionBinding`, `WidgetContext`,
`WidgetSubscription`, `WidgetDataError`, `ConditionExpression`,
`CollectionExpression`, `FormatName`, `DashboardWidgetTemplate` are all used
in interfaces but never specified. `WidgetDataBinding` in particular is
load-bearing: it is the entire join between a widget and its data
(`dataSources: WidgetDataBinding[]`), and `DataBoundary`'s
`"source": "cron"` string implies bindings have local aliases — none of
which is written down.

### G3. The expression language cannot compose text

Real widgets immediately need labels like "3 of 5 jobs enabled" or
"Updated 2m ago · 4 pending". The grammar has `$format` and count, but no
concatenation or interpolation. Authors will work around it by baking text
into component definitions (wrong layer) or the vocabulary will sprout it
under pressure (unplanned). Decide now: add a bounded `$concat` /
`$template` with placeholder-only substitution, or explicitly document the
limitation and the intended workaround.

### G4. `$responsive` is not part of the grammar

The node-level `{"$responsive": {...}}` example is not expressible in
`GenerativeUINode` / `GenerativeValue` / `ValueExpression` as defined — it
is a node whose only key is `$responsive`, which has no `$type`. Either add
a `ResponsiveNode` variant to the tree grammar or make responsiveness a
reserved property on nodes, but the types and the examples must agree.

### G5. Condition and collection semantics are unspecified

- What are the operand typing rules (`greaterThan` on strings? on ISO date
  strings? mixed types?)
- Null/undefined handling in comparisons and `sortBy`
- String collation and locale for sorting
- Whether `$select.where` supports nested field paths
- The `StockTicker` example uses positional-array operands
  (`"greaterThanOrEqual": [a, b]`) but the grammar section lists operator
  names only — pick one shape and specify it.

### G6. Generated settings forms need more than the schema provides

- `enum` has raw `values: JsonValue[]` but no labels — a settings dropdown
  showing `"us-east-1"` raw values is acceptable; one showing `3` for
  "refresh: 3" is not.
- "Data-source choice" and "instrument or symbol" configs need *dynamic*
  option lists (enumerate live calendars, symbols, jobs). A static enum
  cannot express this. Either add an option-provider reference (which
  reintroduces the C1 "where does it run" question) or drop dynamic-choice
  config from v1 scope.
- The secrets flow needs an install-time consent step (see S1) and a
  settings-form control that selects a credential-store entry without
  revealing it.

### G7. Update-policy conflict resolution in the shared runtime

Two instances of the same data source with `maxUpdatesPerSecond: 10` and
`mode: "interval", intervalMs: 60000` share one subscription. Presumably the
subscription runs at the fastest requested rate and slower widgets get
downsampled per-widget — but the plan doesn't say, and "host enforces
limits" needs numbers (defaults and caps).

### G8. Web remote is unaddressed

`apps/web-remote` serves Sero over Tailscale. If the dashboard renders
there, the declarative renderer, expression evaluator and data runtime must
live in a shared package (`@sero-ai/app-runtime` or a new package), not in
`apps/desktop/src`, and cannot assume the desktop `window.sero` bridge
shape. If dashboards are desktop-only, say so; if not, this changes where
most of the Phase 1 code lives. Decide before code is written — moving it
later is expensive.

### G9. Locale context has no source

`WidgetFormatContext` (locale, timeZone, defaultCurrency) has no existing
infrastructure behind it — nothing in the app currently models user locale
or workspace currency. Phase 2 quietly includes building user-level
formatting preferences, storage and settings UI. Either scope that in
explicitly or fall back to system locale for v1 and defer the context.

### G10. Action input wiring is unspecified

The `Button` example passes an action reference with no input. Real actions
need input assembled from config, bindings and literals
(`{"$action": "cron.runJob", "input": {"jobId": {"$bind": "..."}}}`?). The
input-mapping grammar, its validation against `inputSchema`, and who renders
the confirmation UI (host chrome vs inside the widget tree) are all missing.

---

## Security and trust wargame

### S1. Install-time consent must enumerate capabilities, not show pixels

The approval step renders a preview, but the dangerous parts of a definition
are invisible in a preview: which data sources it reads, which actions it
can invoke (and their risk level), which secrets it references. Threat
path: content from an external source (email, web page fetched by the
agent) prompt-injects the agent into proposing an innocent-looking widget
wired to a destructive or exfiltrating action. The human approval gate is
the mitigation — so the approval UI must present a capability manifest
("Reads: cron.jobs · Can invoke: cron.pauseScheduler (confirm) · Secrets:
market-data-api-key"), not just the rendered result. Add this to the
Phase 5 acceptance requirements.

### S2. Data-bound text can impersonate system UI

Curated components constrain layout but `Alert` + `Text` + `Button` compose
into something that looks like a Sero system prompt, with attacker-influenced
strings (data-bound values from an external feed) next to a live action
button. Consider: visually distinguishing widget-origin chrome from host
chrome, and/or marking agent-/local-origin widgets in the widget chrome.
Low likelihood, cheap mitigation, worth a line in the plan.

### S3. `$bind` has no permission model

Can any declarative widget bind to any registered data source from any
plugin? For dashboard widgets the user installs, that is probably
acceptable — but it should be an explicit decision, and the capability
snapshot / consent flow (S1) is where per-source grants would attach if
some sources are sensitive (e.g. a future credentials or email source).

### S4. Idempotency is named but not designed

Who generates `idempotencyKey`, what the dedup window is, and whether it
survives restart are unspecified. For v1, "host generates per click, dedup
in-memory per session" is fine — write it down so `execute()` implementors
know they can rely on it (or can't).

---

## Phasing

### P1. Phase 0+1 front-loads too much before any value ships

Phase 0 alone contains ~11 design deliverables including the spike, and
Phase 1 contains the chat runtime, the renderer, config forms, data states,
responsive sizing *and* the Cron POC. Recommend a thinner walking skeleton
as the first milestone:

1. Sero-owned recursive renderer + ~6 primitives (`Stack`, `Inline`,
   `Text`, `Metric`, `Badge`, `EmptyState`)
2. `DashboardWidgetDefinition` (no components, no expressions beyond
   `$bind`/`$config`/`$literal`/`$format`)
3. `$bind` resolving against the existing app-state file mechanism (C1)
4. Cron widget recreated declaratively with **live** data via its existing
   `state.json`
5. `kind` discriminator + layout.json migration (C5)

That delivers a real, data-live declarative widget with no assistant-ui, no
new plugin runtime, no registries, and no expression engine — and it
validates the renderer, the definition format and the coexistence dispatch
(`WidgetMount` switch) in one step. Everything else layers on top. The
plan's Phase 2 "convert the Cron POC to live plugin data" happens naturally
in step 4 instead of being deferred behind a data-runtime build-out.

### P2. Versioning scope for v1

Pinned revisions only. Cut "follow-latest for compatible revisions",
deprecation messaging, and revision *comparison* UI from the first pass —
pinning plus rollback covers the actual safety requirement, and follow-latest
adds a compatibility-checking subsystem (what makes a revision "compatible"?
schema-subtyping rules are a project in themselves — the plan never defines
compatibility).

### P3. Split the Studio into a named MVP and the rest

The plan itself says "a minimal Studio should exist before broad agent
authoring", but Phase 4 lists ~20 capabilities including dependency graphs,
revision diffs, and import/export. Name the MVP explicitly: list/search,
preview (with states and sizes), enable/disable, uninstall, rollback. The
rest is a backlog, not a phase gate.

### P4. Log the load-bearing decisions as ADs

The doc is titled "agreed architecture" but the repository's decision log
(`docs/decisions.md`) is where durable decisions live. At minimum:
two-permanent-widget-models, Sero-owned vs assistant-ui renderer (once C3 is
resolved), the data-source hosting model (C1), and the storage layout (C5)
deserve AD entries — the plan doc will drift; ADs won't.

---

## Minor / doc defects

- **M1.** `GenerativeUINode`'s index signature is not valid TypeScript as
  written: `children?: GenerativeChild | GenerativeChild[]` is not
  assignable to the `[property: string]: GenerativeValue` signature
  (`GenerativeValue` doesn't include `string`-child arrays or mixed arrays).
  The published types should be the ones that actually compile.
- **M2.** Limit interactions are ambiguous: `maxNodes: 100` vs
  `maxListItems: 50` — do node limits apply to the authored tree or the
  expanded tree after collection rendering (50 items × 4 nodes each = 200)?
  Specify: authored tree for `maxNodes`, rendered output bounded by
  `maxListItems × per-item node count`, or an explicit rendered-node cap.
- **M3.** `SeroValueSchema` has no union, nullable, or date/timestamp
  forms. Data-source schemas will have nullable timestamps on day one
  (cron's `nextRunAt`). Add `nullable?: true` and a `string` `format` hint
  (`"date-time"`), or document the workaround.
- **M4.** `enum`'s `default?: JsonValue` should be constrained to one of
  `values` at validation time — worth stating since unknown-property
  rejection is called out but invalid-default is not.
- **M5.** Namespacing: state explicitly that the *persisted* form of every
  `$type` is always the canonical namespaced id + pinned revision, and
  concise names exist only in the authoring UI/agent layer. "Resolution
  where unambiguous" is time-dependent — a name unambiguous at authoring
  time becomes ambiguous when a second `StockTicker` is installed, so
  persisted definitions must never depend on it.
- **M6.** The 500-LOC file rule (CLAUDE.md) will bite the validation
  pipeline and the renderer hard — plan module boundaries (one module per
  validation stage, expression evaluator separate from renderer) rather
  than discovering them at 700 lines.
- **M7.** "Preview and installed result must use the same rendering path"
  vs "preview it through assistant-ui": if C2/C3 are accepted these
  collapse into one statement; if not, the plan needs to explain how the
  assistant-ui chat preview and the dashboard renderer are literally the
  same path.

---

## Questions to answer before Phase 0 starts

1. Where does data-source `subscribe()` run — or is v1 data app-state-file
   based? (C1)
2. Where does action `execute()` run? (C1)
3. Is the renderer Sero-owned with assistant-ui optional, or
   assistant-ui-based with a fallback? What is the go/no-go criterion for
   the spike? (C3)
4. Does the dashboard (and therefore the declarative renderer) need to work
   in web-remote? (G8)
5. Where do definitions/registries live on disk, and which process owns
   writes? (C5)
6. Are the agent tools bridged per AD-020, and what is the accepted token
   overhead? (C4)
7. What happens to the existing `useWidgetRegistration` runtime-widget
   path? (G1)
8. Does v1 include text composition in expressions? (G3)
