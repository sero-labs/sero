# @sero-ai/app-runtime

Shared runtime hooks for Sero federated app modules.

This package provides the React hooks and context used by Sero apps:

- `useAppState`
- `useAppNavigation`
- `useAppInfo`
- `useAgentPrompt`
- `useAI`
- `useAvailableModels`
- `useTheme`
- `AppProvider`

`useAppNavigation` lets a full app publish stable sub-view IDs. The host uses
them for reload restoration and shell back/forward navigation. Keep the ID
derived from static app data, such as `rooms/<room-id>?view=timeline`.

`useAppState` also returns `ready`. Use it when an initial write must wait until
the state file has been read.

## Development

Inside the Sero monorepo, workspace packages consume the source entrypoint.

## Publishing

This package intentionally publishes its TypeScript source directly under the
`@sero-ai` npm scope.

```bash
cd packages/app-runtime
npm publish --access public
```

## Consumption

Inside the Sero monorepo and exported plugin source repos, consumers keep
importing `@sero-ai/app-runtime`. Package manifests map that import name to the
published package via npm aliasing (`npm:@sero-ai/app-runtime@<version>`).
