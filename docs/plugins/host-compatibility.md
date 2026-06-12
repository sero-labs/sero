# Plugin host compatibility and bridged CLI migration

This guide explains the host-side contract that Sero now enforces for external
plugins, plus what plugin authors need to change downstream.

## What changed

Sero now treats plugin compatibility as a real runtime contract instead of
best-effort metadata.

Two platform seams are now explicit and enforced:

- **Host version compatibility** via `sero.plugin.minSeroVersion`
- **Host capability compatibility** via `sero.plugin.requiredHostCapabilities`

Sero also hardened plugin CLI bridging so hot updates are truthful:

- bridged app/plugin CLI commands are now replaced when a plugin session reloads
- custom `tool.cli.execute` handlers are resolved from the **live** tool
  definition at execution time
- uninstalling or tearing down a session removes its bridged commands cleanly

## Why this matters

Before this change, a plugin could:

- install on an older host that did not actually provide the APIs it needed
- appear to hot-update while still serving stale CLI help or execution logic
- remain partially active after its host assumptions stopped being true

Now Sero fails closed:

- **new incompatible installs are rejected**
- **already-installed incompatible plugins stay on disk but are removed from the
  active package list**
- **discovery/App Store UI can still show the plugin and explain why it is
  unsupported**

## New manifest contract

Plugin manifests still declare metadata under `package.json -> sero.plugin`.

### Supported fields

```json
{
  "sero": {
    "plugin": {
      "category": "integrations",
      "tags": ["google", "mail"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"],
      "bridgeTools": ["google"]
    }
  }
}
```

### Supported host capabilities today

These values are currently recognized by the host:

- `appAgent.invokeTool`
- `tool.cli`
- `appRuntime.background`

Unknown capability strings are treated as unmet host requirements, so older
hosts fail closed instead of partially loading the plugin. Downstream plugins
should still prefer the canonical values above unless they intentionally depend
on a newer host seam.

## When to declare each capability

### `appAgent.invokeTool`

Declare this when your federated UI or app-runtime code depends on the host's
app-agent tool bridge, for example when you call:

- `window.sero.appAgent.invokeTool(...)`
- `useAppTools().run(...)`

### `tool.cli`

Declare this when your extension depends on tool-level CLI bridging, including:

- manifest-driven `bridgeTools`
- custom `definition.cli` metadata
- custom raw-args handlers via `definition.cli.execute`
- builtin override behavior such as replacing `sero google ...`

### `appRuntime.background`

Declare this when your plugin ships a background runtime (`sero.app.runtime`).
The runtime receives the `ctx.host` capability surface typed by
`@sero-ai/common` (`app-runtime-background.ts`), including
`host.subagents.runStructured(...)`.

#### Subagent run options and result metadata (2026-06)

`host.subagents.runStructured(...)` accepts three additive options:

- `platformTools?: 'all' | 'readOnly' | 'none'` — platform tool surface for the
  session. `'all'` (default) grants bash, read, write, edit, sero-cli, and
  browser; `'readOnly'` grants the read tool only; `'none'` grants no platform
  tools — the session is restricted to your `customTools` via a tool allowlist
  (extension-registered tools are excluded too) and skips workspace-runtime
  startup, so tool-less runs work without a container runtime. Use `'none'`
  when the plugin owns its full tool envelope (e.g. read-only planning agents).
- `signal?: AbortSignal` — external cancellation. Aborting resolves the call
  (never throws) with an `error` beginning with `'Aborted'` — `'Aborted'` for
  an in-flight run, `'Aborted before start'` for one that never started. Runs
  still queued for a concurrency slot resolve promptly without taking a slot.

The result includes optional metadata when available: `modelId` and
`providerId` (the concrete model that ran — provider-qualified, since model ids
are not globally unique), `durationMs`, and `usage` (`inputTokens`,
`outputTokens`, `totalTokens`). Metadata is best-effort on failure paths too.
Record the resolved identity rather than the requested model when you need
honest provenance — tier aliases resolve at run time.

## Compatibility behavior

### Install time

If a plugin's host contract is not satisfied, install fails with an actionable
error.

Examples:

- `Requires Sero 0.2.0 or newer (current host: 0.1.0).`
- `Requires host capability \`tool.cli\`, which this Sero build does not provide.`

### Startup / reload time

Sero reconciles installed plugin activation against the current host build.

That means an incompatible plugin can remain installed under:

```text
~/.sero-ui/agent/plugins/<plugin-id>
```

but it will be removed from the active `settings.json` package list until the
host becomes compatible again.

### UI behavior

Unsupported plugins remain discoverable/browseable in the App Store, but they
show an unsupported-host state and are not activatable.

## Quick do / don't guide

| Situation | Do | Don't |
|-----------|----|-------|
| UI button needs to sign in, refresh, sync, or fetch data | Register a normal plugin tool and call it with `useAppTools().run(...)` | Ask the host for a custom API like `window.sero.myPlugin.signIn()` |
| Plugin tool should also work as `sero mytool ...` | Use `sero.plugin.bridgeTools` | Add special host-side command wiring for that plugin |
| Plugin CLI needs custom subcommands/help/raw args | Put that logic on the tool's `cli` field | Build a second parallel CLI implementation in the host |
| Plugin needs host support for direct UI->tool calls | Declare `requiredHostCapabilities: ["appAgent.invokeTool"]` | Assume every host supports it without declaring it |
| Plugin needs bridged CLI behavior | Declare `requiredHostCapabilities: ["tool.cli"]` | Rely on unstated host behavior |
| Extracting a built-in plugin to external | Move plugin-specific logic into the plugin | Leave plugin-specific preload/IPC/types in the Sero host |

## Mini examples

### Example 1: UI button triggers plugin auth

Use this when a React button should start a plugin-owned action.

```tsx
import { useAppTools } from '@sero-ai/app-runtime';

export function MyApp() {
  const { run } = useAppTools();

  async function handleSignIn() {
    await run('myapp_auth', { action: 'login' });
  }

  return <button onClick={handleSignIn}>Sign in</button>;
}
```

Manifest requirement:

```json
{
  "sero": {
    "plugin": {
      "requiredHostCapabilities": ["appAgent.invokeTool"]
    }
  }
}
```

### Example 2: Plugin exposes `sero myapp ...`

Use this when a plugin tool should be available as a normal Sero CLI command.

```json
{
  "sero": {
    "plugin": {
      "bridgeTools": ["myapp"]
    }
  }
}
```

```ts
pi.registerTool({
  name: 'myapp',
  label: 'My App',
  description: 'Manage My App data',
  parameters: Params,
  async execute() {
    return {
      content: [{ type: 'text', text: 'Done' }],
      details: {},
    };
  },
});
```

Result: users and the agent can invoke the bridged command as `sero myapp ...`.

### Example 3: Plugin replaces a builtin command intentionally

Use this only when the plugin is deliberately taking over an existing command name.

```ts
pi.registerTool({
  name: 'google',
  label: 'Google',
  description: 'Google integration',
  parameters: Params,
  async execute() {
    return {
      content: [{ type: 'text', text: 'Done' }],
      details: {},
    };
  },
  cli: {
    summary: 'Google tools',
    help: 'sero google <subcommand>',
    overrideBuiltin: true,
    async execute(args, ctx) {
      return {
        output: `Handled: ${args.join(' ')}`,
        exitCode: 0,
      };
    },
  },
});
```

Manifest requirement:

```json
{
  "sero": {
    "plugin": {
      "bridgeTools": ["google"],
      "requiredHostCapabilities": ["tool.cli"]
    }
  }
}
```
## Downstream migration checklist

Use this checklist when updating an external plugin.

### 1. Audit host dependencies

Identify whether the plugin depends on:

- app-agent tool execution from UI/runtime code
- bridged CLI commands
- custom `tool.cli` help/summary/group/execute behavior
- builtin command override behavior

### 2. Update `package.json`

Add or tighten the host contract in `sero.plugin`:

```json
{
  "sero": {
    "plugin": {
      "category": "integrations",
      "tags": ["google", "mail"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"]
    }
  }
}
```

Only declare capabilities your plugin actually needs.

### 3. Move UI tool calls onto the generic host seam

If your UI still relies on a bespoke preload bridge, migrate it to the generic
app-agent bridge:

```ts
import { useAppTools } from '@sero-ai/app-runtime';

const { run } = useAppTools();
const result = await run('my_tool', { ...input });
```

or:

```ts
await window.sero.appAgent.invokeTool(appId, workspaceId, 'my_tool', { ...input });
```

### 4. Keep CLI behavior plugin-owned

If the plugin exposes CLI parity through bridged tools:

- keep the command metadata on the tool definition
- prefer `definition.cli` for custom summary/help/group/execute behavior
- keep `bridgeTools` aligned with the tool names you expect Sero to bridge

### 5. Test update/reinstall behavior

Confirm that reinstalling the plugin or reloading the active session updates:

- `sero help <command>`
- command summary/help text
- raw command execution behavior

without restarting Sero.

## Recommended manifest patterns

### UI tool bridge only

```json
{
  "sero": {
    "plugin": {
      "category": "utilities",
      "tags": ["example"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool"]
    }
  }
}
```

### CLI bridge only

```json
{
  "sero": {
    "plugin": {
      "category": "developer-tools",
      "tags": ["cli"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["tool.cli"],
      "bridgeTools": ["my_command"]
    }
  }
}
```

### UI + CLI bridge

```json
{
  "sero": {
    "plugin": {
      "category": "integrations",
      "tags": ["mail"],
      "minSeroVersion": "0.1.0",
      "requiredHostCapabilities": ["appAgent.invokeTool", "tool.cli"],
      "bridgeTools": ["google"]
    }
  }
}
```

## Manual downstream verification checklist

After updating a plugin, verify all of the following against a host build that
contains this PR:

1. Fresh install succeeds when the host satisfies the plugin contract.
2. Fresh install fails with a clear error when `minSeroVersion` is too high.
3. Fresh install fails with a clear error when a required capability is missing.
4. Already-installed incompatible plugins remain on disk but are not activated.
5. App Store UI shows incompatible plugins as unsupported instead of loading
   them normally.
6. Reinstalling/updating a bridged CLI plugin refreshes help/summary/execution
   without restarting Sero.
7. Uninstalling the plugin removes its bridged CLI commands cleanly.

## Troubleshooting

### My plugin installs but does not show in the active app list

Check the plugin's `hostCompatibility` status in discovery/App Store UI or
inspect the install/load error. The plugin is likely installed on disk but not
active because its host contract is unsatisfied.

### My custom CLI handler still seems stale

Make sure the command is coming from a bridged tool definition and that the
session/plugin was actually reloaded. The host now refreshes session-owned app
commands on reload, so stale behavior usually means the updated tool definition
never reached the session.

### Which version should I put in `minSeroVersion`?

Use the first Sero release that includes the host seam your plugin now depends
on. If your plugin depends on both the generic app-tool bridge and tool-level
CLI bridging, set the minimum version to the first release that contains both.
