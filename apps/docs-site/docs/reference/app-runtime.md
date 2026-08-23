# App Runtime Reference

`@sero-ai/app-runtime` connects a plugin's React UI to the Sero host. Use it
only in modules that Sero loads. It is not an API for standalone browser apps.

## Hook and API table

| Hook/API | Use it for | Requires app context? | Host/bridge caveat | Source |
| --- | --- | --- | --- | --- |
| `AppProvider` / `AppContext` | Provide app and workspace identity to hooks | yes | Sero mounts the provider for federated modules | `packages/app-runtime/src/context.ts` |
| `useAppInfo()` | Read `appId`, `workspaceId`, and `workspacePath` | yes | Throws if the provider is not present | `packages/app-runtime/src/use-app-info.ts` |
| `useAppState(defaultState)` | Read and write reactive plugin state | yes | Returns `[state, updateState, ready]`; do not use browser storage | `packages/app-runtime/src/use-app-state.ts` |
| `useAgentPrompt()` | Send text to the active agent session | yes | Drops the prompt and writes a warning if no session prompt function is available | `packages/app-runtime/src/use-agent-prompt.ts` |
| `useAI()` | Use app-scoped `prompt()` / `promptStream()` | yes | Requires app/workspace context and app-agent bridge | `packages/app-runtime/src/use-ai.ts` |
| `useAppTools()` | Invoke plugin/app tools from UI | yes | `run(toolName, params?)` throws if bridge is unavailable | `packages/app-runtime/src/use-app-tools.ts` |
| `useAvailableModels()` | Read available model groups exposed by host | no app-specific state | Availability depends on configured providers | `packages/app-runtime/src/use-available-models.ts` |
| `useTheme()` | Read effective Sero theme mode/preset | no app-specific state | Treat as host-provided presentation data | `packages/app-runtime/src/use-theme.ts` |
| `registerWidget()` | Register a runtime dashboard widget imperatively | no | Runtime registration lasts for the renderer session | `packages/app-runtime/src/widget-registry.ts` |
| `getRuntimeWidgets()` | Inspect current runtime widget registrations | no | Mainly useful for host/dashboard integration | `packages/app-runtime/src/widget-registry.ts` |
| `onWidgetRegistryChange()` | Subscribe to runtime widget registry changes | no | Unsubscribe on cleanup | `packages/app-runtime/src/widget-registry.ts` |
| `useWidgetRegistration()` | Register runtime dashboard widgets from React | yes for app identity | Registration stays active for the current renderer session | `packages/app-runtime/src/use-widget-registration.ts` |
| `getSeroApi()` | Raw `window.sero` bridge accessor | no | Prefer hooks unless writing low-level adapter code | `packages/app-runtime/src/sero-bridge.ts` |

## State rule

Use `useAppState()` for plugin UI state that should persist with Sero's profile/workspace model. Do **not** use `localStorage` or `sessionStorage` for durable plugin state.

The hook returns the default state while Sero reads the state file. Its third
value becomes `true` when that first read finishes, including when the read
fails. Use this `ready` value when the UI must distinguish default values from
loaded values.

Current public storage model:

- global app state: `<SERO_HOME>/apps/<app-id>/state.json`
- workspace app state: `<workspace>/.sero/apps/<app-id>/state.json`

## Concurrent writers

A state file can have three writers: the plugin UI, the plugin runtime, and the
plugin extension. The host serialises them:

- Every host-side mutation runs under a cross-process lock (`<stateFile>.lock`).
- `useAppState` writes carry an etag. When another writer changed the file
  first, the hook re-applies your updater on top of the new content and writes
  again. Keep updaters pure functions of `prev` — an updater that closes over
  older state re-applies stale values.
- An extension that writes a state file directly must hold the same lock. Use
  `withStateLock(stateFile, fn)` from `@sero-ai/extension-runtime` around each
  read-modify-write.

See [State and Folders](/reference/state-and-folders) for the broader storage map.

## Minimal example

```tsx
import { useAppInfo, useAppState, useAppTools } from '@sero-ai/app-runtime';

type CounterState = { count: number };

export function CounterApp() {
  const { appId } = useAppInfo();
  const [state, setState, ready] = useAppState<CounterState>({ count: 0 });
  const { run } = useAppTools();

  if (!ready) return <p>Loading…</p>;

  return (
    <button
      onClick={() => {
        setState((prev) => ({ count: prev.count + 1 }));
        void run('counter_updated', { count: state.count + 1 });
      }}
    >
      {appId}: {state.count}
    </button>
  );
}
```

Declare host capabilities such as `appAgent.invokeTool`, `tool.cli`, or `appRuntime.background` only when the plugin actually needs them.

## Related docs

- [Plugin Author Quick Path](/reference/plugin-author-quick-path)
- [Plugins Reference](/reference/plugins)
- [Plugins and Apps](/guide/plugins-and-apps)
- [Dashboard and Widgets](/guide/dashboard-widgets)
