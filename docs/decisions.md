# Architecture Decisions

## AD-001: Shell + Mountable Apps

The main sidebar selects which app fills the main area. CodingWorkspace is one
app; Calendar, Todos, etc. are future apps. Each app is a self-contained
component — the shell doesn't know about project tabs or file explorers.

## AD-002: CodingWorkspace Owns Its Layout

Project tabs, activity bar, and sidebar are internal to the coding app. State
is local (`useState`) until we need persistence, then we'll add a dedicated
store.

## AD-003: Global Resizable Chat Panel

The agent chat is shell-level, not per-app. It persists across app switches.
Collapsible via PanelRight toggle in TitleBar. When collapsed, the
`ResizablePanelGroup` is replaced with a plain flex container.

**react-resizable-panels v4 gotchas:**
- Use string percentages: `defaultSize="30%"`, `minSize="300px"`, `maxSize="50%"`
- Override Group's inline `width: 100%` when it's a flex child:
  `style={{ flex: '1 1 0%', minWidth: 0, width: 'auto' }}`

## AD-004: Electron Window

```typescript
titleBarStyle: 'hiddenInset',
trafficLightPosition: { x: 12, y: 12 },
backgroundColor: '#0a0a0b',
```

Custom TitleBar provides drag region (`-webkit-app-region: drag`). Interactive
elements opt out with `no-drag`. 78px left spacer for traffic lights.

## AD-005: Theme System

Dark-first. `<html class="dark">` toggles dark/light. Two layers of CSS
variables in `global.css`:
- **Sero tokens** (`--bg-base`, `--bg-surface`, `--text-primary`, etc.)
- **shadcn/ui tokens** (`--background`, `--foreground`, `--primary`, etc.)

Zustand store manages state and applies the class.

## AD-006: ai-elements for Chat UI

Source lives in `src/components/ai-elements/` (not node_modules). Depends on
shadcn primitives. Currently using Conversation, Message, PromptInput.
Will integrate with Pi agent session via Vercel AI SDK `useChat` hook.

## AD-007: Build Pipeline

| Target   | Tool    | Entry                | Output                    | Format |
| -------- | ------- | -------------------- | ------------------------- | ------ |
| Renderer | Vite 6  | `src/main.tsx`       | `dist/renderer/`          | ESM    |
| Main     | esbuild | `electron/main.ts`   | `dist/electron/main.mjs`  | ESM    |
| Preload  | esbuild | `electron/preload.ts`| `dist/electron/preload.js`| CJS    |

Preload must be CJS. `electron`, `node-pty`, `@mariozechner/*` are external.
`scripts/dev.sh` starts Vite first, waits for :5173, then launches Electron.

## AD-008: Preload API (`window.sero`)

Minimal — exposes `platform: string`. All IPC via `contextBridge` with
`contextIsolation: true` and `nodeIntegration: false`. Will expand for
filesystem, PTY, container lifecycle, and agent session bridge.

## AD-009: Incremental Development

Components start as named placeholders. Get layout and data flow right first,
fill in real functionality one piece at a time.
