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

Build the npm artifact from the monorepo package directory:

```bash
cd packages/app-runtime
pnpm run build:npm
cd dist/npm
npm publish --access public
```
