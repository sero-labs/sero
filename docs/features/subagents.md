# Subagents — User Guide

Subagents let the main Sero agent delegate tasks to specialist agents that run
in isolated sessions. Each subagent gets a fresh context window and full access
to the workspace — files, terminal, and container — then returns its results to
the main agent.

You don't call subagents directly. The main agent decides when to use them
based on what you ask. You can also ask it explicitly:
*"Use the scout subagent to scan the project"* or *"Review auth.ts with the
reviewer subagent"*.

---

## Built-In Agents

Sero ships with four agents, copied to `~/.sero-ui/agent/agents/` on first
launch. You can edit or delete them freely.

| Agent | Model | Thinking | What it does |
|-------|-------|----------|-------------|
| **scout** | claude-haiku-4-5 | off | Fast reconnaissance — scans structure, reports findings as bullet points. Cheap and quick. |
| **analyst** | claude-sonnet-4-6 | medium | Deep codebase analysis — maps structure, identifies patterns, produces structured reports. |
| **reviewer** | claude-sonnet-4-6 | high | Code review — finds correctness, performance, security, and maintainability issues with severity ratings. |
| **test-writer** | claude-sonnet-4-6 | medium | Test generation — reads source files and writes comprehensive vitest unit tests. |

### When the agent picks each one

- **Scout** is used for quick scans where speed matters more than depth (uses
  Haiku, no thinking — fast and cheap).
- **Analyst** is used when you need a structured understanding of a codebase or
  module.
- **Reviewer** is used when you ask for a code review or want issues identified.
- **Test-writer** is used when you ask for tests to be written for a file or
  module.

---

## Execution Modes

### Single

One agent, one task. The simplest mode.

```
You: "Use the scout subagent to map the src/ directory"
```

The agent calls:
```json
{
  "agent": "scout",
  "task": "Map the src/ directory structure and list key files"
}
```

### Parallel

Multiple independent tasks run concurrently. Use when work can be split into
pieces that don't depend on each other.

```
You: "Review auth.ts, api.ts, and database.ts in parallel"
```

The agent calls:
```json
{
  "tasks": [
    { "agent": "reviewer", "task": "Review auth.ts for security issues" },
    { "agent": "reviewer", "task": "Review api.ts for correctness" },
    { "agent": "reviewer", "task": "Review database.ts for performance" }
  ]
}
```

Results come back as labelled markdown sections:
```
## Result 1: reviewer — "Review auth.ts for security issues"
[full review output]

## Result 2: reviewer — "Review api.ts for correctness"
[full review output]

## Result 3: reviewer — "Review database.ts for performance"
[full review output]
```

Parallel runs are bounded by `maxConcurrent` (default: 4 per call) and
`maxTotal` (default: 8 globally). Extra tasks queue until a slot opens.

> **Important:** Parallel subagents share the same container. Give each task
> independent file scope — don't have two parallel subagents writing to the
> same file.

### Chain

Sequential pipeline where each step feeds into the next. Use `{previous}` in a
task to inject the prior step's full output.

```
You: "First scout the project, then have the analyst produce a report based on
      the scout's findings"
```

The agent calls:
```json
{
  "chain": [
    { "agent": "scout", "task": "Scan the entire project structure" },
    { "agent": "analyst", "task": "Based on these findings, produce a full analysis report:\n\n{previous}" }
  ]
}
```

Step 2 waits for Step 1 to finish. `{previous}` is replaced with the scout's
full output before the analyst runs.

### Ad-hoc (Inline)

For one-off tasks that don't need a named agent. Pass a `systemPrompt` directly
instead of an agent name.

```
You: "Use a subagent to count the lines of code in each source file. It should
      be a specialist that only reports numbers."
```

The agent calls:
```json
{
  "task": "Count lines of code in every .ts file under src/",
  "systemPrompt": "You are a line-counting specialist. Report only file paths and line counts in a table. No commentary."
}
```

Ad-hoc agents show as **"ad-hoc"** in the orchestration panel.

---

## Creating Custom Agents

### Via the agent

Ask the main agent to create one:

```
You: "Create a new agent called 'migrator' that specialises in database
      migration scripts"
```

The agent uses the `create_agent` tool to write a `.md` file to
`~/.sero-ui/agent/agents/migrator.md`. The new agent is available immediately —
no restart needed.

### By hand

Create a `.md` file in `~/.sero-ui/agent/agents/` with JSON frontmatter:

```markdown
​```json
{
  "name": "migrator",
  "description": "Database migration specialist",
  "model": "claude-sonnet-4-6",
  "thinking": "medium"
}
​```

You are a database migration specialist. You write safe, reversible migration
scripts that handle edge cases like partial failures and data validation.

Always include a rollback step. Test migrations against a copy of the schema
before applying.
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique identifier. Lowercase letters, numbers, hyphens only. |
| `description` | ✅ | Short description of what the agent does. |
| `model` | | Default model (e.g. `"claude-sonnet-4-6"`, `"claude-haiku-4-5"`). Falls back to your session default. |
| `thinking` | | Thinking level: `"off"`, `"low"`, `"medium"`, `"high"`. |
| `timeoutMs` | | Timeout in milliseconds. Default: 600000 (10 minutes). |
| `tools` | | Tool names (parsed but not enforced in v1 — all agents get full tool access). |

The markdown body after the frontmatter becomes the agent's **system prompt**.
Write it like you would any system prompt — role, instructions, constraints,
output format.

### Tips for good agent prompts

- **Be specific about output format.** "Output a markdown table" is better than
  "give me the results".
- **Constrain scope.** An agent that does one thing well is better than one that
  tries to do everything.
- **Use Haiku for fast/cheap tasks.** Set `"model": "claude-haiku-4-5"` and
  `"thinking": "off"` for scouts and simple processors.
- **Use Sonnet with thinking for complex tasks.** Reviews, analysis, and code
  generation benefit from reasoning.

---

## Orchestration Panel

The orchestration panel shows live subagent activity for the current workspace.

### Opening it

Click the **Network icon** (⬡) in the explorer workspace activity bar — the
narrow icon strip on the far left, between Source Control and Terminal.

### What you see

Each subagent run appears as a card:

```
🔄 reviewer — "Review auth.ts for security issues"
   claude-sonnet-4-6 · 12s · 2.4k tokens · $0.03

✅ scout — "Map the project structure"
   claude-haiku-4-5 · 3s · 800 tokens · $0.001
   ▼ Output

❌ test-writer — "Write tests for database.ts"
   timed out after 600s
   ▼ Error
```

- **🔄** Running (animated pulse)
- **✅** Completed
- **❌** Failed
- **⏸** Aborted (you clicked Stop)
- **⏰** Timed out

Running entries sort to the top. Click **▼ Output** or **▼ Error** to expand
the full response or error details. There's a copy button in the expanded view.

### Summary bar

At the bottom of the panel:

```
4 runs · $0.08 · 8.3k tokens · 45s
```

Aggregate cost, tokens, and duration for all runs in the current workspace.

### Workspace scoping

The panel only shows runs for the active workspace. Switch workspaces and the
panel re-hydrates with that workspace's history.

---

## Overrides & Configuration

### Per-call overrides

The agent can override model, thinking, and timeout on any call:

```json
{
  "agent": "scout",
  "task": "Quick scan",
  "model": "claude-haiku-4-5",
  "thinking": "off",
  "timeoutMs": 30000
}
```

### Per-task overrides (parallel/chain)

Each task in a parallel or chain call can have its own overrides:

```json
{
  "tasks": [
    { "agent": "scout", "task": "Fast scan", "model": "claude-haiku-4-5" },
    { "agent": "reviewer", "task": "Deep review", "model": "claude-sonnet-4-6", "thinking": "high" }
  ]
}
```

### Global settings

In `~/.sero-ui/agent/settings.json`, add a `"subagent"` key:

```json
{
  "subagent": {
    "maxConcurrent": 4,
    "maxTotal": 8,
    "timeoutMs": 600000,
    "model": null,
    "thinking": null
  }
}
```

| Setting | Default | What it controls |
|---------|---------|-----------------|
| `maxConcurrent` | 4 | Max parallel subagents per tool call |
| `maxTotal` | 8 | Max total active subagents across all sessions |
| `timeoutMs` | 600000 | Default timeout (10 minutes) |
| `model` | null | Default model override (null = use session default) |
| `thinking` | null | Default thinking level override |

### Resolution order

When determining the model, thinking level, or timeout for a run, the system
checks in this order (first non-null wins):

1. Per-task override (`tasks[i].model`)
2. Top-level call override (`model` on the `subagent` call)
3. Agent frontmatter (`model` in the `.md` file)
4. Global subagent settings (`settings.json`)
5. Session / app defaults

---

## Aborting

**Stop button / Escape** — aborting the main session cascades to all running
subagents. They're terminated immediately and marked as "aborted" in the
orchestration panel.

Already-completed subagents are unaffected — their results stay in the tracker.

---

## Debugging

### Debug log

Enable debug logging (toggle in the app debug menu), then:

```bash
tail -f ~/.sero-ui/agent/debug.jsonl | grep subagent
```

Subagent sessions log with IDs prefixed `subagent-`. Each run logs:
- `turn_context` — full system prompt, model, tools, and messages sent to the
  LLM
- All session events — tool calls, text deltas, completions

### Orchestration panel

Expand any card's **▼ Output** to see the full response text. Failed cards show
**▼ Error** with the error message.

### Electron log

Check `/tmp/sero-electron.log` for `[subagent/...]` prefixed warnings — agent
discovery issues, container errors, template copy failures.

---

## Constraints & Limitations

- **No recursion.** Subagents cannot spawn further subagents.
- **No agent management in children.** Subagents cannot call `create_agent`.
- **Shared container.** Parallel subagents share one container — avoid
  concurrent writes to the same file.
- **No tool filtering.** The `tools` field in agent frontmatter is parsed but
  not enforced. All subagents get the full workspace tool set.
- **No cost budgets.** Costs are displayed in the UI but not limited. Watch the
  summary bar if you're running many parallel tasks.
- **In-memory sessions.** Subagent sessions are not persisted to disk. Only the
  final response is captured in the tracker (and visible in the orchestration
  panel). Enable debug logging for full session traces.
- **No extension packages.** Subagent sessions don't load external extension
  packages. They get workspace tools + container access only.

---

## Examples

### "Review my PR"

```
You: "Review all the files I changed in this PR. Use parallel subagents."
```

The agent will `git diff` to find changed files, then fan out reviewer
subagents — one per file — in parallel.

### "Analyse then refactor"

```
You: "First analyse the auth module for issues, then refactor based on the
      findings. Use a chain."
```

Chain: analyst scans → reviewer identifies issues → main agent refactors using
both outputs.

### "Quick recon on an unfamiliar codebase"

```
You: "Scout the project — I just cloned it and want to know what I'm working
      with."
```

Scout runs with Haiku (fast/cheap), reports back in bullet points, main agent
summarises.

### "Write tests for everything"

```
You: "Write unit tests for all files in src/utils/. Use parallel subagents."
```

The agent lists files, spawns a test-writer per file in parallel, each writes
and runs tests independently.
