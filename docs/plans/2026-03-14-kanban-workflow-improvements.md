# Kanban Workflow Improvements — High-Level Plan

## Goal

Transform the Kanban from a simple card-tracking board into a structured, end-to-end development workflow where ideas are brainstormed into well-formed cards, each stage has defined input/output contracts, and execution flows automatically through quality-gated phases with human checkpoints.

---

## How Things Work Today

Three distinct mechanisms drive the kanban automation. All enhancements in this plan build on them — no new loading systems or parallel abstractions.

### 1. Agent Templates (`packages/templates/agents/*.md`)

Define **subagent personas** — model, thinking level, tools, and a system prompt body. Installed to `~/.sero-ui/agent/agents/` at runtime and discovered by `SubagentManager.resolveAgent()` → `discoverAgents()`.

```
packages/templates/agents/
├── analyst.md        # Codebase analysis — used by planning-executor
├── scout.md          # Fast recon — used by planning-executor
├── implementer.md    # Subtask execution — used by subtask-executor
├── planner.md        # Plan generation — EXISTS but NOT used (see §0)
├── reviewer.md       # Code review — EXISTS but NOT used (see §0)
├── test-writer.md    # Test generation — not yet used by kanban
└── ...
```

**How they're consumed:** `subagentManager.runSingle({ agent: 'analyst', task: '...' })` — the subagent system resolves the `.md` file, reads frontmatter (model/thinking/tools) and body (system prompt), then creates a transient `AgentSession`.

### 2. Prompt Builder Functions (`electron/kanban/prompts.ts`)

Construct the **user message** (the `task` parameter) sent to subagents. These contain dynamic card context — title, description, acceptance criteria, analysis results, diffs.

- `buildPlanningPrompt(card)` — card context for analyst/scout
- `buildSubtaskGenerationPrompt(card, analysis)` — card + analysis for planner
- `buildSubtaskPrompt(card, subtaskId)` — card + subtask context for implementer
- `buildReviewPrompt(card, diff, fileSummary)` — card + diff for reviewer

Also contains two **inline system prompts** that bypass agent templates:
- `PLANNER_SYSTEM_PROMPT` — used instead of `planner.md` template ← **bug, fixed in §0**
- `REVIEWER_SYSTEM_PROMPT` — used instead of `reviewer.md` template ← **bug, fixed in §0**

### 3. PI SDK Primitives

| Primitive | What it is | Where it lives | How it's loaded |
|-----------|-----------|----------------|-----------------|
| **Agent Templates** | Subagent persona (model, thinking, system prompt body) | `~/.sero-ui/agent/agents/*.md` | `discoverAgents()` in `subagent/discovery.ts` |
| **Prompt Templates** | User-facing `/slash` commands that expand into user messages | `~/.pi/agent/prompts/`, `.pi/prompts/` | `ResourceLoader.getPrompts()` |
| **Skills** | On-demand capability packages loaded by the agent when tasks match | `~/.pi/agent/skills/`, `.pi/skills/` | `ResourceLoader.getSkills()` |
| **Extensions** | Register tools, commands, events via `pi.registerTool()` | `~/.pi/agent/extensions/`, `.pi/extensions/` | `ResourceLoader.getExtensions()` |
| **Context Files** | `AGENTS.md` project instructions injected into system prompt | Walking up from `cwd` | `ResourceLoader.getAgentsFiles()` |

**Key rule:** subagent system prompts are defined in **agent templates**. Task-specific context with dynamic data is constructed by **prompt builder functions** in TypeScript. User-facing conversational flows use **PI SDK Prompt Templates** loaded via `ResourceLoader`. This plan does not introduce any new loading or resolution mechanisms.

---

## Current State

The kanban already has:
- 5 columns: **Backlog → Planning → In-Progress → Review → Done**
- An orchestrator (`electron/kanban/`) that drives automation via subagents
- Git worktree isolation per card, wave-based subtask execution
- Progress tracking with live activity feeds in the UI
- Human approval gates at planning→impl and review→done

**What's missing:**
- No brainstorming → card creation pipeline (cards are created manually with minimal structure)
- No defined contracts for what each stage requires as input or produces as output
- No quality gates between subtasks (no TDD enforcement, no spec review, no verification step)
- The orchestrator agent instructions are basic — no structured plan format, no two-stage review
- No card-to-card dependencies (only subtask dependencies within a card)
- Skills like brainstorming, writing-plans, subagent-driven-development, verification-before-completion are not integrated
- Planner and reviewer agent templates exist but are bypassed by hardcoded inline prompts

---

## Plan Overview — Four Workstreams

### Phase 0: Fix Agent Template Bypass (prerequisite)
### Workstream 1: Brainstorm → Cards Pipeline
### Workstream 2: Stage Contracts & Quality Gates
### Workstream 3: Enhanced Orchestrator

Phase 0 is a prerequisite — it fixes an existing inconsistency. Workstreams 1–3 are ordered by dependency: contracts must be defined before the orchestrator can enforce them, and the brainstorm pipeline produces cards that conform to the contracts.

---

## Phase 0: Fix Agent Template Bypass

**Problem:** The kanban orchestrator uses named agent templates for `analyst`, `scout`, and `implementer`, but bypasses the existing `planner.md` and `reviewer.md` templates with hardcoded inline system prompts (`PLANNER_SYSTEM_PROMPT` and `REVIEWER_SYSTEM_PROMPT` in `prompts.ts`).

```typescript
// Uses agent template ✅
subagentManager.runParallel({ tasks: [{ agent: 'analyst', ... }, { agent: 'scout', ... }] })

// Bypasses agent template ❌ — should use agent: 'planner'
subagentManager.runSingle({ task: ..., systemPrompt: PLANNER_SYSTEM_PROMPT })

// Bypasses agent template ❌ — should use agent: 'reviewer'
subagentManager.runSingle({ task: ..., systemPrompt: REVIEWER_SYSTEM_PROMPT })
```

**Fix:**
1. Merge the richer instructions from `PLANNER_SYSTEM_PROMPT` and `REVIEWER_SYSTEM_PROMPT` into the body of `packages/templates/agents/planner.md` and `packages/templates/agents/reviewer.md`
2. Switch `planning-executor.ts` to use `agent: 'planner'` instead of `systemPrompt: PLANNER_SYSTEM_PROMPT`
3. Switch `review-executor.ts` to use `agent: 'reviewer'` instead of `systemPrompt: REVIEWER_SYSTEM_PROMPT`
4. Remove `PLANNER_SYSTEM_PROMPT` and `REVIEWER_SYSTEM_PROMPT` from `prompts.ts`

After this, all five kanban subagents (analyst, scout, planner, implementer, reviewer) consistently use agent templates. This is the foundation for all enhancements in Workstreams 1–3.

---

## Workstream 1: Brainstorm → Cards Pipeline

**Problem:** Today, cards are created ad-hoc via `kanban add "title"` or the inline form — no structured process to refine ideas into well-scoped, implementable cards.

**Approach:** Add a `kanban brainstorm` tool action that launches a conversational brainstorming flow, inspired by the `brainstorming` skill but adapted for Sero's architecture.

### 1A. New `brainstorm` tool action

Add a `brainstorm` action to the kanban extension tool. This triggers a **conversational brainstorming flow** in the ChatPanel (decision D1).

When invoked, the agent follows the brainstorm prompt template:
1. **Read workspace context** — recent commits, project structure, existing cards on the board
2. **Probe the idea** — ask questions one at a time (prefer multiple choice), focus on purpose, constraints, success criteria, scope
3. **Propose approaches** — present 2-3 options with trade-offs, lead with recommendation
4. **Validate incrementally** — present the design in 200-300 word sections, check after each section
5. **Generate cards** — once the design is validated, output a structured set of cards

The output format is a JSON array of card specs:
```json
[
  {
    "title": "...",
    "description": "...",
    "acceptance": ["...", "..."],
    "priority": "medium",
    "blockedBy": ["card-ref"]
  }
]
```

The tool action creates all cards in Backlog and sets up any inter-card `blockedBy` relationships (see §2D). The brainstorming conversation is preserved in the chat session for reference.

### 1B. Brainstorm prompt template (PI SDK Prompt Template)

Brainstorming happens in the **main chat session** (ChatPanel), not a subagent. The brainstorm instructions are a **PI SDK Prompt Template** — a `.md` file discoverable via `ResourceLoader` and invocable as a `/brainstorm` slash command.

**Location:** Ship `brainstorm.md` inside the kanban extension package's `prompts/` directory so it's auto-discovered by `ResourceLoader` when the extension loads.

**Content codifies:**
- Read the workspace context first (recent commits, project structure, existing kanban cards)
- Ask questions one at a time, prefer multiple choice
- Propose 2-3 approaches with trade-offs
- Validate incrementally (present design in sections)
- YAGNI — don't over-engineer the card scope
- Output structured cards with acceptance criteria
- Use the `kanban` tool to create the cards at the end

**Invocation:** The `kanban brainstorm` tool action triggers the flow via `pi.sendUserMessage()` with the expanded template content. Users can also invoke `/brainstorm` directly from the chat editor.

### 1C. UI: Brainstorm entry point

Add a "Brainstorm" action to the Kanban header or empty state that sends a `kanban brainstorm` command into the active chat session (via `useAgentPrompt`). The brainstorming conversation happens in the ChatPanel — the kanban board updates as cards are created.

Optionally: a "Brainstorm" button on the CardDetail for an individual card that needs refinement before starting.

---

## Workstream 2: Stage Contracts & Quality Gates

**Problem:** There's no definition of what a card must contain before entering a stage, what a stage produces, or what validation must pass before advancing.

**Approach:** Define a `StageContract` schema for each column transition. These contracts codify required inputs, expected outputs, and validation rules. They live as structured data so the orchestrator can enforce them.

### 2A. Stage contract schema

The `StageContract` is pure application logic — kanban-specific validation that lives in the orchestrator. It does **not** reference prompt templates or agent system prompts (those are handled separately by agent templates and prompt builders).

```typescript
interface StageContract {
  /** Which column transition this contract governs */
  transition: `${Column}->${Column}`;

  /** Fields that must be populated on the card before entering */
  requiredInputs: {
    field: keyof Card;
    validation: 'non-empty' | 'min-items' | 'custom';
    message: string;  // Error shown if validation fails
  }[];

  /** What this stage produces (documentation + validation) */
  expectedOutputs: {
    field: keyof Card;
    description: string;
  }[];

  /** Quality gates that must pass before the card advances */
  qualityGates: QualityGate[];
}

interface QualityGate {
  name: string;
  type: 'agent-review' | 'command' | 'field-check';
  /** For 'command': shell command to run (e.g., 'pnpm typecheck') */
  command?: string;
  /** For 'agent-review': which agent template to dispatch */
  agent?: string;
  /** For 'field-check': card field that must be truthy */
  field?: string;
  /** Whether failure blocks advancement or is advisory */
  blocking: boolean;
}
```

Note: the `QualityGate.agent` field references an **agent template name** (e.g. `'spec-reviewer'`), not a prompt file. The orchestrator dispatches it via `subagentManager.runSingle({ agent: gateName, task: ... })`.

### 2B. Contracts per transition

#### Backlog → Planning (`start`)

**Required inputs:**
- `title` — non-empty
- `description` — non-empty (at least a sentence explaining the intent)
- `acceptance` — at least 1 acceptance criterion

**Expected outputs:** (produced by the planning phase)
- `plan` — prose implementation approach
- `subtasks` — decomposed work items with dependency graph

**Quality gates:** None (human initiates this transition)

**Agents used:** `analyst` + `scout` (parallel reconnaissance), then `planner` (plan generation). All three are existing agent templates enhanced with richer instructions (see §3A):
- Plans include TDD scenario designation per subtask
- Plans include exact file paths (create/modify/test)
- Plans include dependency ordering and wave grouping rationale
- 2-8 subtasks, each scoped to 15-30 minutes of agent work

#### Planning → In-Progress (`approve`)

**Required inputs:**
- `plan` — non-empty
- `subtasks` — at least 1 subtask
- `status` = `waiting-input` (human has reviewed)

**Expected outputs:** (produced by the implementation phase)
- All subtasks completed
- Code changes committed in worktree
- Tests passing (if applicable)

**Quality gates:**
- Per-subtask (opt-in): spec compliance review via `spec-reviewer` agent template
- Per-subtask (opt-in): code quality review via `quality-reviewer` agent template
- Per-wave: verification command (configurable — e.g., `pnpm typecheck`)

**Agent used:** `implementer` (enhanced with TDD instructions and self-review checklist — see §3B)

#### In-Progress → Review (automatic)

**Required inputs:**
- All subtasks `completed`
- Non-empty diff in worktree

**Expected outputs:**
- Code review result (issues categorised as critical/important/minor)
- PR with structured description (summary, changes, testing sections)
- `prUrl` and `prNumber` set

**Quality gates:**
- Verification command runs before review (e.g., tests, typecheck)
- `reviewer` agent approval (blocking if critical issues found)
- Branch pushed, PR created

**Agent used:** `reviewer` (enhanced with structured issue categories and assessment verdict — see §3C)

#### Review → Done (`complete`)

**Required inputs:**
- `prUrl` — non-empty (PR exists)
- `status` = `waiting-input` (human has merged/reviewed)

**Expected outputs:**
- `completedAt` timestamp
- Worktree cleaned up

**Quality gates:** None beyond human confirmation

### 2C. Validation enforcement

Add a `validateTransition(card, targetColumn)` function to the orchestrator that checks the relevant `StageContract.requiredInputs` before allowing a column change. The `kanban` tool actions (`start`, `approve`, `complete`, `move`) call this function and return a clear error message listing what's missing.

The UI can also call validation to show readiness indicators on cards (e.g., a green/amber/red dot showing whether a card is ready for the next stage).

### 2D. Card-to-card dependencies

**(Decision D3: Full dependency tracking)**

Add a `blockedBy: string[]` field to the `Card` interface — an array of card IDs that must be in `done` before this card can be started.

**Orchestrator enforcement:**
- `validateTransition(card, 'planning')` checks that all `blockedBy` cards are in `done`
- The `start` tool action returns a clear error listing which blocking cards aren't done yet
- Auto-execution: when a card moves to `done`, the orchestrator checks if any blocked cards are now unblocked and can auto-start (if `autoAdvance` is enabled)

**Tool actions:**
- `kanban add` — accepts optional `blockedBy` parameter
- `kanban update` — can set/clear `blockedBy`
- `kanban brainstorm` — sets `blockedBy` when creating a batch of related cards

**UI:**
- Cards in Backlog with unmet dependencies show a blocked indicator (lock icon + "Blocked by #X, #Y")
- CardDetail shows dependency section with links to blocking cards
- Column counts distinguish between "ready" and "blocked" cards in backlog

---

## Workstream 3: Enhanced Orchestrator

**Problem:** The current orchestrator has basic agent instructions and no quality gates between subtasks. The external skills define a much more rigorous process (two-stage review, TDD enforcement, verification before completion) that isn't leveraged.

**Approach:** Enhance the orchestrator's three phases by improving existing agent templates and prompt builders. No new loading systems — all changes go into `packages/templates/agents/*.md` (agent persona/instructions) and `electron/kanban/prompts.ts` (dynamic task context).

### 3A. Enhanced planning phase

**Current:** analyst + scout (parallel) → planner → wait for approval.

**Enhanced:**
1. **Analyst + Scout** (parallel, unchanged) — codebase reconnaissance
2. **Planner** — enhance the `planner.md` agent template to produce:
   - Prose plan (2-4 paragraphs)
   - Subtasks with: TDD scenario designation, file paths (create/modify/test), dependency graph, estimated complexity
   - The plan format matches `writing-plans` patterns but without step-by-step granularity (the implementer handles that)
3. **Plan validation** — automated check that the plan has valid structure (subtasks with IDs, dependencies reference valid IDs, no orphaned dependencies)
4. **Human approval** (unchanged) — but now the UI shows a richer plan with file paths and TDD designations

**What changes where:**
- `packages/templates/agents/planner.md` — enhanced system prompt body with structured output instructions
- `prompts.ts` → `buildSubtaskGenerationPrompt()` — enhanced to include TDD designation instructions and file path requirements in the task message
- `prompts.ts` → `parsePlanResult()` — updated to parse new fields (TDD designation, file paths)

### 3B. Enhanced implementation phase — configurable review rigour

**(Decision D2: Configurable — default wave-level, opt-in per-subtask)**

**Current:** Implementer subagent per subtask → checkpoint → next wave. No review between subtasks.

**Enhanced — two tiers:**

#### Default: Wave-level review

For each subtask in the wave:
1. **`implementer` agent** — enhance `implementer.md` to include:
   - TDD instructions (three-scenario model from `test-driven-development`)
   - Self-review checklist
   - Context from completed subtasks (summaries, file paths produced)
   - Explicit constraint: "Focus ONLY on this subtask"
2. **Checkpoint** — git commit after each subtask

After all subtasks in the wave complete:
3. **Wave-level verification** — auto-detected commands (typecheck, tests — see §3E)
4. **Combined review** — `reviewer` agent reviews all changes in the wave together:
   - Structured issue categories (Critical / Important / Minor)
   - If Critical issues → dispatch fix subagent → re-review (max 2 retries)
   - Important issues are logged but don't block advancement

#### Opt-in: Per-subtask two-stage review

Enabled via `KanbanSettings.reviewLevel: 'per-subtask'` (default: `'per-wave'`):

For each subtask:
1. **`implementer` agent** (same as above)
2. **`spec-reviewer` agent** (new agent template) — compares implementation against subtask spec:
   - Missing items? Extra items? Misunderstood requirements?
   - If issues found → implementer fixes → re-review (max 2 retries)
3. **`quality-reviewer` agent** (new agent template) — only after spec compliance passes
4. **Checkpoint** — git commit only after both reviews pass

After each wave:
5. **Wave-level verification** — auto-detected commands

**New agent templates to create:**
- `packages/templates/agents/spec-reviewer.md` — system prompt for spec compliance review
- `packages/templates/agents/quality-reviewer.md` — system prompt for code quality review

**New settings fields:**
```typescript
interface KanbanSettings {
  // ... existing fields ...
  reviewLevel: 'per-wave' | 'per-subtask';  // default: 'per-wave'
  testingEnabled: boolean;                   // default: true (see §3F)
}
```

**State tracking:** Add review status to the `Subtask` type:
```typescript
interface Subtask {
  // ... existing fields ...
  specReviewStatus?: 'pending' | 'passed' | 'failed';
  qualityReviewStatus?: 'pending' | 'passed' | 'failed';
}
```

**Progress tracking:** The existing `ImplementationProgressTracker` already tracks agents and tools. Extend it to show the current phase per subtask (implementing → spec review → quality review → complete).

### 3C. Enhanced review phase — verification before PR

**Current:** Diff → reviewer subagent → push → create PR.

**Enhanced (incorporating `verification-before-completion` and `finishing-a-development-branch` patterns):**

1. **Pre-review verification** — run verification commands in the worktree before the review:
   - Configurable per-workspace (default: test suite if detected, typecheck if detected)
   - If verification fails → card goes to `failed` with clear error message
2. **`reviewer` agent** — enhance `reviewer.md` template with:
   - Structured issue categories (Critical / Important / Minor)
   - Explicit assessment: "Ready to merge? Yes / No / With fixes"
   - If reviewer finds Critical issues → implementation retry (re-enter in-progress phase with specific fix instructions)
3. **Push + PR creation** (unchanged)
4. **PR description** follows the structured template from `requesting-code-review`:
   - Summary, Changes (per subtask), Testing sections

**What changes where:**
- `packages/templates/agents/reviewer.md` — enhanced system prompt body with structured review output format
- `prompts.ts` → `buildReviewPrompt()` — enhanced task message with structured output instructions
- `prompts.ts` → `parseReviewResult()` — updated to parse issue categories and assessment verdict

### 3D. Enhanced agent templates and prompt builders

**(Decision D4: Enhance existing primitives, no new loading system)**

All orchestrator improvements in §3A–3C are delivered by enhancing the existing mechanisms:

**Agent templates** (`packages/templates/agents/*.md`) — enhanced system prompt bodies:

| Template | Enhancement |
|----------|-------------|
| `planner.md` | Structured plan output with TDD designations, file paths, dependency rationale |
| `implementer.md` | TDD instructions, self-review checklist, subtask-scoping directive |
| `reviewer.md` | Structured issue categories, assessment verdict, PR description format |
| `spec-reviewer.md` **(new)** | Spec compliance review — compares implementation against subtask spec |
| `quality-reviewer.md` **(new)** | Code quality review — style, patterns, performance, maintainability |

**Prompt builder functions** (`electron/kanban/prompts.ts`) — enhanced task messages:

| Builder | Enhancement |
|---------|-------------|
| `buildSubtaskGenerationPrompt()` | TDD fields, file path requirements, complexity estimates |
| `buildSubtaskPrompt()` | Context from completed subtasks, TDD scenario from plan |
| `buildReviewPrompt()` | Structured output instructions, issue category schema |
| `buildSpecReviewPrompt()` **(new)** | Subtask spec + implementation diff for compliance review |
| `buildQualityReviewPrompt()` **(new)** | Implementation diff for quality review |

**PI SDK Prompt Templates** (for user-facing flows, loaded via `ResourceLoader`):

| Template | Purpose |
|----------|---------|
| `brainstorm.md` **(new)** | `/brainstorm` slash command for conversational card creation |
| `card-enhance.md` **(new)** | `/card-enhance` for refining an existing card's description |

These ship in the kanban extension's `prompts/` directory and are auto-discovered by `ResourceLoader`.

**Testing mode propagation (§3F):** The orchestrator reads `settings.testingEnabled` and conditionally includes/excludes TDD instructions when calling prompt builder functions. This is a code-level conditional in the orchestrator, not a template engine feature.

### 3E. Auto-detected verification commands

**(Decision D5: Auto-detect from project, zero-config)**

The orchestrator auto-detects verification commands from the workspace:

```typescript
function detectVerificationCommands(workspacePath: string): string[] {
  const commands: string[] = [];

  // TypeScript project → typecheck
  if (exists(join(workspacePath, 'tsconfig.json'))) {
    commands.push(detectPackageManager(workspacePath) + ' typecheck');
  }

  // Test script in package.json → test suite
  const pkg = readPackageJson(workspacePath);
  if (pkg?.scripts?.test) {
    commands.push(detectPackageManager(workspacePath) + ' test');
  }

  // Cargo project → cargo check + cargo test
  if (exists(join(workspacePath, 'Cargo.toml'))) {
    commands.push('cargo check', 'cargo test');
  }

  // Python project with pytest
  if (exists(join(workspacePath, 'pyproject.toml')) || exists(join(workspacePath, 'setup.py'))) {
    commands.push('pytest');
  }

  return commands;
}
```

These run at:
- **Wave boundaries** — between implementation waves to catch integration issues early
- **Before review phase** — verification must pass before the reviewer agent is dispatched
- **Failure handling** — if verification fails, the card status is set to `failed` with the command output as the error message. The user can fix and retry.

### 3F. Testing mode toggle (POC vs Production)

**(Decision D6: Per-workspace toggle)**

A `testingEnabled` boolean in `KanbanSettings` (default: `true`) that controls whether testing is part of the workflow. This lets users work in "POC mode" for fast iteration, then flip to "production mode" when they want to harden the code.

**When `testingEnabled: false` (POC mode):**

| Area | Behaviour |
|------|-----------|
| **Planning** | `buildSubtaskGenerationPrompt()` omits TDD designation instructions and "write tests" subtask guidance |
| **Implementation** | `buildSubtaskPrompt()` omits TDD instructions. Tells implementer "tests are not required for this task" |
| **Verification** | Test suite commands are excluded from auto-detected verification. Typecheck still runs (correctness, not testing) |
| **Review** | `buildReviewPrompt()` tells reviewer not to flag missing test coverage |
| **Spec review** | `buildSpecReviewPrompt()` doesn't check for test presence |

**When `testingEnabled: true` (Production mode — default):**

Everything works as described in the rest of this plan: TDD instructions in implementer prompts, "write tests" subtasks in plans, test suite in verification commands, reviewer flags missing coverage.

**Switching mid-flight:** Flipping the toggle only affects *future* card phases. A card already in `in-progress` continues with whatever context it was started with. A card still in `backlog` or `planning` will pick up the new setting when its phase starts.

**How it propagates:** The orchestrator reads `settings.testingEnabled` from the kanban state when calling prompt builder functions. The builders conditionally include/exclude TDD-related content based on this flag. This is a code-level conditional — not a template engine.

---

## What We're NOT Changing

- **Architecture:** File-based state bridge stays. No new IPC protocols, no WebSocket between extension and UI.
- **Column structure:** Still 5 columns (backlog → planning → in-progress → review → done). No new columns.
- **Extension registration:** Same `pi.registerTool()` pattern, same sero.app manifest. New actions are added to the existing `kanban` tool.
- **UI framework:** Same React + Tailwind + Motion stack. New UI is additive (new panels, enhanced cards).
- **Session model:** Subagents are still transient, orchestrator still lives in the Electron host.
- **Loading systems:** No new prompt/template loading mechanisms. Agent templates are discovered via `discoverAgents()`. PI SDK Prompt Templates are discovered via `ResourceLoader`. Dynamic task context is built by prompt builder functions in `prompts.ts`.

---

## Implementation Order (suggested)

| Phase | Section | What | Why this order |
|-------|---------|------|----------------|
| 0 | §0 | Fix planner/reviewer template bypass | Prerequisite — all subsequent work assumes consistent agent template usage |
| 1 | §2A-2C | Stage contracts & validation | Foundation — defines the contracts everything else depends on |
| 2 | §2D | Card-to-card dependencies | Data model change — add `blockedBy` to Card, validation logic, orchestrator enforcement |
| 3 | §3A | Enhanced planning phase | Enhance `planner.md` template + prompt builders → better plans → better subtasks |
| 4 | §3E | Auto-detected verification commands | Needed by phases 5 and 6 for wave-level and pre-review verification gates |
| 5 | §3B | Configurable review + new agent templates | The biggest quality improvement — wave-level review + optional per-subtask. Creates `spec-reviewer.md` and `quality-reviewer.md` |
| 6 | §3C | Enhanced review phase | Quality gates before PR creation. Uses verification commands from phase 4 |
| 7 | §1A-1B | Brainstorm tool action + PI SDK Prompt Template | Now that contracts define card requirements and card deps exist, brainstorm can produce well-formed, linked cards |
| 8 | §1C | Brainstorm UI entry point | Polish — the workflow works via chat first, UI adds discoverability |

---

## Design Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| D1 | Brainstorming UX | **Conversational in ChatPanel** | Full back-and-forth dialogue — agent probes the idea, validates sections, then creates cards at the end. Richer output than one-shot. |
| D2 | Review rigour | **Configurable** | Default to wave-level review (single combined review after each wave). Users can upgrade to per-subtask two-stage review via `KanbanSettings`. Balances speed vs thoroughness. |
| D3 | Card dependencies | **Full dependency tracking** | Cards can block other cards. Orchestrator respects this for auto-execution ordering. UI shows dependency indicators. Brainstorm pipeline can set these. |
| D4 | Agent instructions | **Enhance existing agent templates + prompt builders** | Agent system prompts live in `packages/templates/agents/*.md`. Dynamic task context is built by prompt builder functions in `prompts.ts`. New reviewer variants are new agent templates (`spec-reviewer.md`, `quality-reviewer.md`). User-facing flows are PI SDK Prompt Templates loaded via `ResourceLoader`. No custom loading system. |
| D5 | Verification commands | **Auto-detect from project** | Detect `tsconfig.json` → typecheck, `package.json` test script → tests, etc. No user config needed. Keep it zero-config. |
| D6 | Testing mode | **Per-workspace toggle** | `testingEnabled` setting controls whether TDD is enforced, test-writing subtasks are generated, and test verification commands run. Off = POC mode (fast iteration), On = production mode (full TDD). Can be flipped at any time — existing cards aren't retroactively affected. |

---

## Appendix: Primitive Usage Map

| Need | Primitive | Location |
|------|-----------|----------|
| Define subagent persona (model, thinking, system prompt) | **Agent Template** `.md` | `packages/templates/agents/planner.md` etc. |
| Construct task-specific context with dynamic card data | **Prompt builder function** | `electron/kanban/prompts.ts` |
| User-facing conversational flow in main chat | **PI SDK Prompt Template** | Extension's `prompts/` dir, loaded via `ResourceLoader` |
| Kanban-specific validation and workflow rules | **Application code** in orchestrator | `validateTransition()`, quality gates |
| Project-level instructions for all agents | **Context file** (`AGENTS.md`) | Walking up from workspace `cwd` |
