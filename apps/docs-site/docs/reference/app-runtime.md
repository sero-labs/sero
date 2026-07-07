# App Runtime Reference

`@sero-ai/app-runtime` is the renderer-side bridge for Sero plugin app UIs. It is intended for React modules loaded inside the Sero shell, not for standalone browser apps.

## Hook and API table

| Hook/API | Use it for | Requires app context? | Host/bridge caveat | Source |
| --- | --- | --- | --- | --- |
| `AppProvider` / `AppContext` | Provide app/workspace identity to hooks | yes | Mounted by Sero for federated app modules | `packages/app-runtime/src/app-context.tsx` |
| `useAppInfo()` | Read `appId`, `workspaceId`, and `workspacePath` | yes | Throws/degrades if used outside provider | `packages/app-runtime/src/use-app-info.ts` |
| `useAppState(defaultState)` | Read/write reactive plugin app state JSON | yes | Persists through host app-state bridge; do not use browser storage | `packages/app-runtime/src/use-app-state.ts` |
| `useAgentPrompt()` | Send text to the active user agent session | yes | Requires host bridge; prompts may be dropped/unavailable outside Sero | `packages/app-runtime/src/use-agent-prompt.ts` |
| `useAI()` | Use app-scoped `prompt()` / `promptStream()` | yes | Requires app/workspace context and app-agent bridge | `packages/app-runtime/src/use-ai.ts` |
| `useAppTools()` | Invoke plugin/app tools from UI | yes | `run(toolName, params?)` throws if bridge is unavailable | `packages/app-runtime/src/use-app-tools.ts` |
| `useAvailableModels()` | Read available model groups exposed by host | no app-specific state | Availability depends on configured providers | `packages/app-runtime/src/use-available-models.ts` |
| `useTheme()` | Read effective Sero theme mode/preset | no app-specific state | Treat as host-provided presentation data | `packages/app-runtime/src/use-theme.ts` |
| `registerWidget()` | Register a runtime dashboard widget imperatively | no | Runtime registration lasts for the renderer session | `packages/app-runtime/src/widget-registry.ts` |
| `getRuntimeWidgets()` | Inspect current runtime widget registrations | no | Mainly useful for host/dashboard integration | `packages/app-runtime/src/widget-registry.ts` |
| `onWidgetRegistryChange()` | Subscribe to runtime widget registry changes | no | Unsubscribe on cleanup | `packages/app-runtime/src/widget-registry.ts` |
| `useWidgetRegistration()` | Register runtime dashboard widgets from React | yes for app identity | Sticky for the current renderer session | `packages/app-runtime/src/use-widget-registration.ts` |
| `getSeroApi()` | Raw `window.sero` bridge accessor | no | Prefer hooks unless writing low-level adapter code | `packages/app-runtime/src/sero-bridge.ts` |

## State rule

Use `useAppState()` for plugin UI state that should persist with Sero's profile/workspace model. Do **not** use `localStorage` or `sessionStorage` for durable plugin state.

`sero.app.scope` decides which path is used (`stateFile` is a hint, not an
override):

- global app state: `<SERO_HOME>/apps/<app-id>/state.json`
- workspace app state: `<workspace>/.sero/apps/<app-id>/state.json`

If your Pi extension reads or writes the same state, it must resolve this same
file by scope — see the resolution snippet in
[Plugin Author Quick Path](/reference/plugin-author-quick-path#file-backed-state).
See [State and Folders](/reference/state-and-folders) for the broader storage map.

## Minimal example

```tsx
import { useAppInfo, useAppState, useAppTools } from '@sero-ai/app-runtime';

type CounterState = { count: number };

export function CounterApp() {
  const { appId } = useAppInfo();
  const [state, setState] = useAppState<CounterState>({ count: 0 });
  const { run } = useAppTools();

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
