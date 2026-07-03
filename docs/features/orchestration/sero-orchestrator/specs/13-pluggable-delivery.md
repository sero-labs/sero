# 13 — Pluggable Delivery Destinations

Status: **draft — direction approved, decisions confirmed 2026-07-01**.

Today "delivery" is not modeled anywhere: it is two hardcoded prompt strings
selected by `useManagedWorktree` (`planner-prompt.ts` — worktree mode tells the
planner to add commit/push/`gh pr create` steps; root mode says leave files in
the tree), the agent does the delivering, and nothing verifies anything was
actually delivered. That is repo-only and unverified. This spec makes the
destination a first-class, user-chosen loop setting with an enforced proof of
delivery — so the same loop engine can ship to a PR, an inbox draft, a chat
channel, a saved report, or a webhook.

Example loops this enables:

```text
Every weekday at 8am, research competitor moves and post a digest to #market-intel.
When a customer email asks for status, gather project state and draft a reply for approval.
Weekly, summarize loop activity into a saved report.
```

## Decisions (confirmed)

1. **Delivery stays agent-authored.** The orchestrator never performs sends
   itself — no per-destination host APIs, no second execution layer (the
   architecture's standing rule). The agent delivers through the tools it
   already has: `gh` for PRs, the Google plugin's tools for Gmail, the `mcp`
   proxy tool for chat/trackers, plain file writes for artifacts.
2. **Enforcement is a structured contract, not trust.** A loop that declares a
   destination completes only when its final step returns a valid
   `DeliveryReceipt` (the URL/id of what landed). A completion claim without a
   receipt is downgraded to `needs-revision` — the same defence-in-depth
   pattern as the route contract. This closes the existing hollow-delivery
   gap (today even `pr` delivery is taken on the agent's word).
3. **The destination is a user-level loop setting**, chosen at create time and
   editable later — never planner-chosen, exactly like worktree placement. The
   planner's job is authoring the steps that implement it.
4. **Externally visible destinations always gate behind approval in v1.**
   Sending email, posting to chat, and posting to webhooks are visible to
   other people; drafts and saved artifacts are not. The gate uses the
   existing human-input machinery and is mechanically enforced (below), not
   just prompted.
5. **v1 destinations:** `pr` and `workspace-files` (the two existing implicit
   behaviors, now first-class), `saved-artifact`, `email-draft`,
   `email-send`, `chat-post` (Slack/Discord/etc. via whichever MCP server is
   connected), `webhook-post`.
6. **Delivery and placement are orthogonal.** Worktree vs workspace-root
   remains the file-isolation setting; destination is where results ship. A
   research loop can be workspace-root + `chat-post`; a code loop stays
   worktree + `pr`.

## Data model

```ts
type DeliveryDestinationId =
  | 'pr'
  | 'workspace-files'
  | 'saved-artifact'
  | 'email-draft'
  | 'email-send'
  | 'chat-post'
  | 'webhook-post';

interface LoopDeliverySettings {
  destination: DeliveryDestinationId;
  /** Destination-specific params: channel, recipients, url, report name… */
  params?: Record<string, unknown>;
}

interface Loop {
  // …existing fields…
  delivery: LoopDeliverySettings;
}
```

Migration/back-compat: loops without `delivery` behave as today —
`useManagedWorktree ? 'pr' : 'workspace-files'` is the derived default.

`delivery` **is** part of `SharedLoopDefinition` (unlike workspace settings):
the destination kind is definitional ("this loop posts a digest to chat"),
while concrete params get adapted per workspace on load/install. Optional
field — `schemaVersion` stays 1.

Proof of delivery:

```ts
interface DeliveryReceipt {
  destination: DeliveryDestinationId;
  /** Where it landed: PR url, message permalink, draft id, artifact path,
   *  webhook response status + url. */
  ref: string;
  summary: string;
  deliveredAt: string;
}
```

`CompletionSignal` gains `receipt?: DeliveryReceipt`. Delivered receipts
accumulate on `runtime.deliveries: DeliveryReceipt[]` (the same pattern as
`runtime.pullRequests`) and are fed into future run context so recurring loops
know what they already shipped.

## Destination registry (in-plugin, static v1)

The current two-string ternary generalizes into a table the planner and engine
both read:

```ts
interface DeliveryDestinationSpec {
  id: DeliveryDestinationId;
  label: string;
  /** Planner guidance injected in place of today's hardcoded delivery rule. */
  plannerRules: string;
  /** Tool names (matched against the live tool catalog) the destination
   *  needs, e.g. the mcp proxy for chat-post. Empty for pr/workspace-files/
   *  saved-artifact. */
  requiredTools: string[];
  /** Externally visible ⇒ final send is approval-gated in v1. */
  external: boolean;
  /** Documented receipt shape, injected into the final step contract. */
  receiptHint: string;
}
```

`external: true` for `email-send`, `chat-post`, `webhook-post`. Adding a
future destination (Notion page, Jira ticket, spreadsheet row) is one registry
entry plus its planner rules — no engine change — as long as a tool for it
exists in the catalog.

## Availability (fail-soft, no new gates)

- **At activation and at each run start**, the destination's `requiredTools`
  are checked against the live catalog; missing tools record a
  `delivery-tool-missing` `LoopWarning` (same lifecycle as
  `model-unavailable`: re-evaluated each run, cleared when resolved). The loop
  still activates — MCP servers connect dynamically and may appear later.
- If the tool is still missing when the delivery step runs, the step fails
  with a clear outcome and routes through **normal recovery** — no bespoke
  blocking path.

## Enforcement (the no-hollow-success layer)

Mirroring `enforceRouteContract`, a new `enforceDeliveryContract` wraps final
step outcomes:

1. Loop declares a destination other than `workspace-files` + final step
   claims `complete` **without** a structurally valid receipt → outcome
   downgraded to `needs-revision` with an in-session repair prompt (same
   bounded-repair machinery as route/outcome repair).
2. **External destinations additionally require a named approval token.** The
   planner is instructed to put a human-input approval step (existing 07
   machinery: draft attached, user approves/rejects) before the send. The
   mechanical backstop binds the token, not just its existence: a receipt for
   an `external` destination is accepted only when its `approvalId` names an
   open approval that (a) was asked by a step still in the plan with
   `gate: "approval"`, (b) carries the approved content verbatim as the
   question's `attachment`, and (c) has not been consumed by an earlier send.
   Exactly that token is consumed on acceptance (one approval, one send), and
   changing the delivery destination voids open approvals. The gate cannot be
   bypassed by an agent that "forgot" to ask, and a stale approval for other
   content cannot be re-used (the durable mechanism is the only path).

   Scope, stated honestly: this governs what the loop ACCEPTS as a completed
   delivery. A background-agent step keeps its normal shell, so a physically
   possible side effect (e.g. a `webhook-post` via curl) cannot be prevented
   mechanically — an unapproved send is refused completion and lands in
   recovery, never blessed. True prevention needs runtime-mediated sending,
   which stays out of scope for v1 (below).
3. **Verify-back where a read API is free:** for `pr`, the receipt is
   cross-checked against the existing `listPullRequests` reconcile; for
   `saved-artifact`, the artifact path must exist. Other destinations rely on
   the receipt contract in v1 (verify-back per destination can be added
   incrementally).

## Planner changes

- The `WORKTREE_DELIVERY` / `WORKSPACE_ROOT_DELIVERY` ternary is replaced by
  the declared destination's `plannerRules` block plus its `receiptHint`.
- Placement rules (commit hygiene in a worktree, leave-in-tree at root) remain
  separate and apply only when steps modify repo files.
- For external destinations, `plannerRules` require the draft → approval →
  send step shape; validation confirms plans for external destinations contain
  a human-input approval step before the final step.

## UI

- **Create flow + loop detail:** a destination picker beside the existing
  workspace setting; destination params edited inline (channel, recipients,
  webhook url). Self-explanatory, no sub-labels.
- **Run summary:** delivered receipts render as links ("Posted to #market-intel",
  "Draft created", "PR #124"); the outcome notification includes the ref.
- **Approval:** external sends surface through the existing human-input answer
  card with the draft attached — no new approval UI.

## Actions

```ts
| { kind: 'set_delivery'; loopId: string; delivery: LoopDeliverySettings }
```

`create` options and the `/orchestrator` command accept a destination; library
save/load round-trips `delivery`.

## Functional requirements

- **FR-D1** A loop carries a user-chosen delivery destination + params;
  planner never chooses it; existing loops default to today's behavior.
- **FR-D2** Per-destination planner rules replace the hardcoded two-string
  delivery rule; placement rules stay orthogonal.
- **FR-D3** A declared destination completes only with a structurally valid
  `DeliveryReceipt`; a completion claim without one becomes `needs-revision`
  with bounded in-session repair.
- **FR-D4** External destinations (`email-send`, `chat-post`, `webhook-post`)
  require the receipt to name (`approvalId`) an open, plan-bound,
  content-carrying approval token, consumed one-for-one on acceptance —
  mechanically enforced, not prompt-only. Enforcement scope is completion
  acceptance, not physical side-effect prevention.
- **FR-D5** Missing destination tools warn at activation, re-check each run
  start (`delivery-tool-missing`), and fail through normal recovery — never a
  silent fallback, never a bespoke block.
- **FR-D5b** Params a destination cannot deliver without (`webhook-post` →
  `url`, marked `required` on the shared param hints) block activation and
  delivery edits with a plain error — unlike tools, a missing value cannot
  "appear later", so failing soft would only move the failure mid-run. Shared
  definitions stay exempt: the values are the installing user's, never the
  author's. Declared params are injected into every step prompt (the send
  step is usually pre-final), so a library/catalog plan authored before the
  values existed still finds them.
- **FR-D6** Receipts persist on `runtime.deliveries`, feed future run context,
  render as links in the run summary, and appear in the outcome notification.
- **FR-D7** `pr` receipts are verified against the PR reconcile;
  `saved-artifact` receipts against artifact existence.
- **FR-D8** `delivery` round-trips through the Loop Library as part of the
  shared definition (optional field, schema version unchanged).

## Out of scope (v1)

- Runtime-mediated sending (the orchestrator performing sends itself) —
  rejected as a second execution layer; revisit only if receipts prove
  insufficient in practice.
- First-class ids for Notion/Jira/Linear/sheets/calendar — reachable later as
  registry entries over MCP tools once connectors are proven.
- Verify-back for chat/email/webhook destinations; per-destination retry
  policies.
- Any autonomy policy beyond the fixed v1 rule "external ⇒ approval"
  (Graduated Autonomy is a separate, deselected feature).
