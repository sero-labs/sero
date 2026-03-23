# @sero/app-runtime

Shared runtime hooks for Sero federated app modules.

This package provides the React hooks and context used by Sero apps:

- `useAppState`
- `useAppInfo`
- `useAgentPrompt`
- `useAI`
- `useAvailableModels`
- `useTheme`
- `AppProvider`

## Development

Inside the Sero monorepo, workspace packages consume the source entrypoint.

## Publishing

This package intentionally publishes its TypeScript source directly.

```bash
cd packages/app-runtime
npm publish --access public
```
