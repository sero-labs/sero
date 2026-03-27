# Memory System Integration Analysis

## Reference: `@zhafron/pi-memory` Extension

The example extension provides four capabilities:
1. **Memory files** — `MEMORY.md`, `IDENTITY.md`, `USER.md`, `daily/YYYY-MM-DD.md`
2. **Context injection** — auto-injects memory/identity/user into the system prompt via `before_agent_start`
3. **Tool** — unified `memory` tool for read/write/search/list operations
4. **Bootstrap flow** — first-run setup that creates template files and walks the user through personalisation

---

## What Sero Already Has

The global workspace (`~/.sero-ui/workspaces/global/`) already has:
- `USER.md` — user profile (name, timezone, preferences, coding style)
- `AGENTS.md` — workspace-level agent instructions
- `.git` repo — full version history via Sero's git checkpoint system
- `.sero/apps/` — per-app state files (kanban, todo, etc.)

Key infrastructure already in place:
- **`before_agent_start` hook** — used by `sero-extension.ts` (CLI prompt, container prompt, subagent prompt) and `pi-plan-mode-extension` (plan context injection)
- **Sero CLI bridge** (AD-020) — all extension tools collapsed into `sero-cli` to save token budget
- **VCS integration** — `sero-extension-git.ts` handles checkpoints, git command blocking, bookmarks, via `vcsManager`
- **Workspace manager** — `@ws:global/path` expansion, `sero workspace list` command, cross-workspace file access in containers

---

## Recommended Architecture

### Storage Location

```
~/.sero-ui/workspaces/global/
├── MEMORY.md          # Long-term memory (facts, decisions, preferences)
├── IDENTITY.md        # Agent identity/persona rules
├── USER.md            # Already exists — user profile
├── AGENTS.md          # Already exists — workspace agent instructions
└── memory/
    └── daily/
        └── YYYY-MM-DD.md   # Daily logs
```

**Rationale:**
- Reuse the existing `USER.md` (already populated) — don't duplicate it
- `MEMORY.md` and `IDENTITY.md` are new files at the workspace root (visible, editable, git-tracked)
- Daily logs go in `memory/daily/` to keep the root clean
- Everything is git-tracked via Sero's existing checkpoint system (no separate git logic needed)
- The reference extension stores in `~/.pi/agent/memory/` — but Sero already has the global workspace as its personal knowledge base, so use that instead

### Package Structure

Create `plugins/sero-memory-plugin/` following the standard Sero extension pattern:

```
plugins/sero-memory-plugin/
├── package.json
├── extension/
│   ├── index.ts           # Extension entry — registers hooks + tool
│   ├── memory-manager.ts  # File I/O (read/write/search/list)
│   ├── context-injector.ts # System prompt injection
│   └── tsconfig.json
└── shared/
    └── types.ts           # MemoryTarget, WriteMode, etc.
```

No `ui/` directory needed initially — memory is purely agent-side. A UI could be added later (markdown viewer for memory files).

### Context Injection

The extension hooks into `before_agent_start` to inject memory context into the system prompt. This is the **same pattern** used by `pi-plan-mode-extension`.

```
systemPrompt += memoryContextBlock
```

The block includes:
- Contents of `MEMORY.md` (if non-empty)
- Contents of `IDENTITY.md` (if non-empty)
- Contents of `USER.md` (if non-empty)
- Brief instructions on how to use the `memory` CLI command

**Important:** The injection must happen in the **extension**, not in `sero-extension.ts`. The `before_agent_start` hook supports multiple listeners — the Pi SDK merges their `systemPrompt` returns. The Sero extension injects CLI/container/subagent context; the memory extension injects memory context. They compose cleanly.

### Tool → CLI Bridge

Following AD-020, the `memory` tool is:
1. Registered via `pi.registerTool()` in the extension
2. Added to `TOOLS_TO_BRIDGE` in `electron/cli/index.ts`
3. Automatically bridged into `sero-cli` by `bridgeExtensionTools()`

The agent invokes it as:
```
sero memory read --target memory
sero memory write --target daily --content "Implemented auth module"
sero memory search --query "PostgreSQL"
sero memory list
```

This is zero per-tool custom code — the schema bridge handles arg parsing, type coercion, and help generation from the TypeBox schema.

### Resolving the Workspace Path

The key difference from the reference extension: the memory directory is **not** a fixed `~/.pi/agent/memory` path. It's the global workspace path, which is dynamic.

**Approach:** Use `ctx.cwd` in `session_start`/`session_switch` events (same pattern as kanban/plan-mode), BUT with a fallback to look up the global workspace path via the environment:

```typescript
// In the extension
function resolveMemoryRoot(ctx?: { cwd?: string }): string {
  // The global workspace path is always available as an env var
  // set by Sero's workspace manager, or we can derive it
  const seroHome = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');
  return path.join(seroHome, 'workspaces', 'global');
}
```

This means memory is **always** stored in the global workspace regardless of which workspace the session is running in. The container system already mounts the global workspace at its original host path, so cross-workspace access works.

### Git Integration — Leverage Existing VCS

The reference extension has no git integration. Sero's is free:

- **Auto-checkpoints** — `sero-extension-git.ts` already creates git checkpoints after every agent turn that mutates files. Memory writes trigger `write` tool calls → `agentRunHasMutatingToolCalls = true` → checkpoint on `agent_end`. Memory changes are automatically version-controlled.
- **Mutating git blocking** — The agent can't `git commit` or `git push` directly (blocked by the git extension). All version control goes through `sero vcs checkpoint/restore/diff`.
- **Diff & restore** — `sero vcs diff` and `sero vcs restore` work on memory files like any other workspace file.
- **No separate memory versioning needed** — the reference extension doesn't version memory. Sero gets it for free.

### Bootstrap Flow

Questionnaire-driven setup using the existing `questionnaire` tool:

1. On `session_start`, check if `MEMORY.md` exists in the global workspace
2. If not, `before_agent_start` injects bootstrap instructions containing
   three pre-defined questionnaire payloads (identity, user, memory)
3. The agent calls the `questionnaire` tool for each step, collects answers,
   then writes the results to memory files via `sero memory write`
4. Existing `USER.md` content is detected — the agent confirms it with the
   user rather than re-asking
5. Once `MEMORY.md` exists, subsequent turns switch to normal context injection

### What NOT to Do

- **Don't modify `sero-extension.ts`** — the memory extension is self-contained
- **Don't modify `buildContainerPromptBlock`** — memory context is injected separately via `before_agent_start`
- **Don't add git logic to the memory extension** — Sero's git checkpoint system handles it
- **Don't use `localStorage`** — markdown files on disk, git-tracked
- **Don't create a standalone tool schema** — bridge through `sero-cli` per AD-020

---

## Implementation Checklist

1. **Create `plugins/sero-memory-plugin/`** — standard extension package structure
2. **`shared/types.ts`** — `MemoryTarget`, `WriteMode`, `MemoryAction` types
3. **`extension/memory-manager.ts`** — file I/O adapted for Sero paths (global workspace root, not `~/.pi/agent/memory/`)
4. **`extension/context-injector.ts`** — `before_agent_start` hook that reads memory files and appends to system prompt
5. **`extension/index.ts`** — wires everything together, registers the `memory` tool with TypeBox schema
6. **Add `'memory'` to `TOOLS_TO_BRIDGE`** in `electron/cli/index.ts`
7. **Bootstrap logic** — first-run detection + template creation, preserving existing `USER.md`
8. **`pnpm install`** — auto-discovers the new package (no manual registration needed per AGENTS.md)

### Token Budget Consideration

The context injection adds ~200-500 tokens per turn (memory file contents). This is comparable to what the CLI prompt block adds. For large memory files, consider truncating to the first N lines or adding a size cap with a "use `sero memory read` for full content" fallback.
