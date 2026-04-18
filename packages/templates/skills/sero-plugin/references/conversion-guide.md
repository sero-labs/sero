# Converting an Existing Pi Extension

Read this only when converting an existing Pi extension into a Sero plugin.

## The rule: copy, don't import

All extension code must live inside the plugin directory. Never `import` from,
`require`, or list an external Pi extension as a dependency. Sero plugins are
self-contained units.

**Why:**
- Pi's TypeScript loader can't reliably handle transitive TS imports from node_modules
- External packages couple your plugin to the original author's release schedule
- You need to modify the code for Sero state file integration
- Plugins should work in isolation without a separate `pi install` step

## Step-by-step conversion

### 1. Read and understand the source

Read the original extension's `package.json` to find:
- **Entry point:** `pi.extensions` (usually `["./index.ts"]`)
- **Dependencies:** direct `dependencies` (add to your plugin)
- **Peer dependencies:** Pi SDK packages (list as `peerDependencies`)

### 2. Copy source files into extension/

Copy all `.ts` files into your plugin's `extension/` directory. Keep them flat
so relative imports continue working.

```bash
SRC=/path/to/pi-some-extension
DEST=plugins/sero-some-plugin/extension

for f in "$SRC"/*.ts; do
  cp "$f" "$DEST/$(basename "$f")"
done
```

### 3. Split files over 500 lines

```bash
wc -l plugins/sero-some-plugin/extension/*.ts | sort -rn | head
```

Split strategies:

| Original pattern | Split into |
|------------------|------------|
| Monolithic index.ts with multiple tools | `index.ts` + `tools-<name>.ts` per group |
| Large provider file (API + MCP) | `provider.ts` + `provider-mcp.ts` |
| Extractor with HTTP + specialized logic | `extract.ts` + `http-extract.ts` |
| Content generation (trees, formatting) | Main file + `<name>-content.ts` |

Keep original public exports stable when splitting.

### 4. Add Sero state sync

The original likely uses in-memory storage or Pi session entries, neither
visible to the Sero web UI. Add write-through to the state file.

**Pattern — write-through to state.json:**

```typescript
storeResult(id, data);                        // original in-memory store
pi.appendEntry("my-results", data);           // original session persistence
syncEntryToState(statePath, data).catch(noop); // NEW: write to state.json
```

Create a `state-sync.ts` module that handles:
- Resolving state file path from `ctx.cwd`
- Atomic read/write of state JSON
- Converting internal data format to lighter UI-facing state shape

**Rewrite hardcoded paths:** If the original reads/writes under `~/.pi` or
`~/.pi/agent`, rewrite for Sero:
- App config/caches: `process.env.SERO_HOME` (`~/.sero-ui/apps/<id>/...`)
- Pi SDK resources: `process.env.PI_CODING_AGENT_DIR`
- Fall back to `~/.pi` only when env vars are unset (Pi CLI mode)

**Do not preserve bespoke host bridges:** If the original Sero-integrated UI
called a dedicated preload/IPC API (for example `window.sero.<something>`),
rebase that interaction onto plugin-owned tools via `useAppTools()` or
`window.sero.appAgent.invokeTool(...)` instead. When you depend on that seam,
declare `sero.plugin.requiredHostCapabilities: ["appAgent.invokeTool"]`.

**Pattern — sync on session start:**

```typescript
pi.on('session_start', async (_event, ctx) => {
  statePath = resolveStatePath(ctx.cwd);
  const branch = ctx.sessionManager.getBranch();
  await syncFromSession(statePath, branch);
  await updateProviderInfo(statePath, { ... });
});
```

### 5. Replace TUI-specific features

| TUI feature | Sero replacement |
|-------------|-----------------|
| `pi.registerShortcut()` | Remove or map to a command |
| `ctx.ui.setWidget()` | Use Sero web UI dashboard widget |
| `ctx.ui.select()` / `ctx.ui.confirm()` | Remove — use web UI |
| `ctx.ui.notify()` | Use `pi.events.emit('sero:notify', { message })` |
| Glimpse windows / `open()` | Remove — Sero web UI replaces them |
| Curator / interactive browser UIs | Remove HTTP server + HTML; build React UI |
| Activity monitor (TUI widget) | Track in state file, display in web UI |

For tools with interactive workflows (e.g. curator browser), simplify to the
non-interactive path. The Sero web UI provides the review experience instead.

### 6. Add direct dependencies

Original extension's npm packages go directly in your plugin's `dependencies`:

```json
{
  "dependencies": {
    "@sinclair/typebox": "catalog:",
    "@mozilla/readability": "^0.5.0",
    "linkedom": "^0.16.0",
    "turndown": "^7.2.0"
  }
}
```

**Built-in plugin packaging rule:** every runtime npm package must be declared
in the plugin's own `dependencies` and installable as a plugin-local
`node_modules/` tree. Don't rely on monorepo hoisting.

### 7. Design the UI-facing state shape

Optimise for the UI — lighter than the agent-facing internal data:

```typescript
// Original (agent-facing, potentially huge):
interface StoredSearchData {
  id: string;
  queries: Array<{
    query: string;
    answer: string;  // potentially huge
    results: Array<{ title: string; url: string; snippet: string }>;
  }>;
}

// Sero state (UI-facing, compact):
interface WebEntry {
  id: string;
  type: 'search' | 'fetch';
  timestamp: number;
  queries?: Array<{
    query: string;
    resultCount: number;  // just the count
    sources: Array<{ title: string; url: string }>;
  }>;
}
```

Strip large text content, base64 images, anything the UI doesn't render.

## Conversion checklist

- [ ] All extension `.ts` files copied into `extension/`
- [ ] No `import` from the original package anywhere
- [ ] Original package removed from `dependencies`
- [ ] Original's npm deps added directly
- [ ] Every source file under 500 LOC
- [ ] State sync added: tool results -> state.json
- [ ] Hardcoded `~/.pi` paths rewritten for `SERO_HOME` / `PI_CODING_AGENT_DIR`
- [ ] Session restore: existing entries synced to state on session start
- [ ] TUI-specific code removed (shortcuts, widgets, interactive prompts, Glimpse)
- [ ] Web UI built to replace removed TUI features
- [ ] `pnpm install && pnpm build && pnpm typecheck` all pass

## Reference: Web Access plugin

The Web Access plugin (`plugins/sero-web-plugin/`) is the canonical conversion
reference. Study these files:

| File | What it demonstrates |
|------|---------------------|
| `extension/index.ts` | Entry point with session handlers, state sync, delegated tools |
| `extension/tools-search.ts` | Extracted tool registration as standalone module |
| `extension/state-sync.ts` | Atomic writes and session-entry conversion |
| `ui/WebApp.tsx` | Web UI replacing TUI widgets |
