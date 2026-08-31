# @sero-ai/app-runtime

Shared runtime hooks for Sero federated app modules.

This package provides the React hooks and context used by Sero apps:

- `useAppState`
- `useAppNavigation`
- `useAppPreferences`
- `useAppInfo`
- `useAgentPrompt`
- `useAI`
- `useAvailableModels`
- `useAppContributionSlot`
- `useTheme`
- `AppProvider`

`useAppNavigation` lets a full app publish stable sub-view IDs. The host uses
them for reload restoration and shell back/forward navigation. Keep the ID
derived from static app data, such as `rooms/<room-id>?view=timeline`.

`useAppState` also returns `ready`. Use it when an initial write must wait until
the state file has been read.

`useAppPreferences` stores small profile-wide UI choices in the host layout.
Use it for settings that must follow the profile across workspaces. Use
`useAppState` for workspace or app data.

`useAppContributionSlot(extensionPoint)` lists safe descriptors for components
that other apps contribute to a host-owned surface. Check its explicit
`status`, then use `mount(key, fallbacks)` to keep federation URLs, manifests,
runtime context, style isolation, and error containment inside the host.

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
