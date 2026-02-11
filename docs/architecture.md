# Architecture

## Shell Layout

```
┌─────────────────────────────────────────────────────────────┐
│  TitleBar (⊞ sidebar toggle … app name … ⌘K … ⊟ chat)     │
├──────────┬──────────────────────────────┬─┬─────────────────┤
│  Main    │                              │║│                 │
│  Sidebar │     Active App               │║│  Chat Panel     │
│  (apps   │     (CodingWorkspace / etc.) │║│  (global agent) │
│  + chats)│                              │║│                 │
├──────────┴──────────────────────────────┴─┴─────────────────┤
│  StatusBar                                                   │
└─────────────────────────────────────────────────────────────┘
```

The shell is always present: TitleBar, StatusBar. The MainSidebar (left) and
ChatPanel (right) are independently collapsible via toggle buttons in the
TitleBar.

The active app and ChatPanel sit inside a `ResizablePanelGroup` in `App.tsx`.
When the chat is collapsed, the panel group is replaced with a plain flex
container so the app fills the full width.

## CodingWorkspace

```
┌──────────────────────────────────────────────┐
│  ProjectBar (project tabs: Project 1, 2, +)  │
├────┬──────┬──────────────────────────────────┤
│ A  │ Side │                                  │
│ c  │ bar  │     Editor area (Dockview)       │
│ t  │      │     (empty placeholder)          │
│ .  │      │                                  │
└────┴──────┴──────────────────────────────────┘
```

Self-contained. Has its own ActivityBar (Explorer, Search, Source Control),
CodingSidebar, and ProjectBar. State is local (`useState`) — will extract to
a Zustand store when real functionality requires it.

## ChatPanel

Shell-level — persists across all apps. Uses ai-elements:
- `Conversation` + `ConversationContent` — auto-scrolling message container
- `Message` + `MessageContent` + `MessageResponse` — markdown + code blocks
- `PromptInput` + `PromptInputTextarea` + `PromptInputSubmit` — chat input

Currently dummy data. Will wire to Pi agent session later.

## Component Map

```
src/
  App.tsx                    Shell — ResizablePanelGroup(ActiveApp, ChatPanel)

  components/
    layout/
      TitleBar.tsx           Drag region, sidebar toggle (left), chat toggle (right)
      MainSidebar.tsx        Apps list + chat sessions with search
      ChatPanel.tsx          Global agent chat (ai-elements)
      StatusBar.tsx          Bottom info bar

    apps/coding/
      CodingWorkspace.tsx    Self-contained coding app
      ProjectBar.tsx         Project tabs
      ActivityBar.tsx        Icon strip (Explorer, Search, Git)
      CodingSidebar.tsx      Panel content per activity

    ai-elements/             Vercel ai-elements (48 components, source in project)
    ui/                      shadcn/ui primitives (57 components)

  stores/
    app.ts                   Shell-level Zustand store

electron/
  main.ts                    Electron main process
  preload.ts                 Preload script (window.sero)
```

## State Management

### Shell (Zustand: `src/stores/app.ts`)

| State             | Type             | Description                           |
| ----------------- | ---------------- | ------------------------------------- |
| `mainSidebarOpen` | `boolean`        | MainSidebar visibility                |
| `chatPanelOpen`   | `boolean`        | ChatPanel visibility                  |
| `activeApp`       | `AppId`          | Which app is mounted in the main area |
| `chatSearch`      | `string`         | Filter for chat session list          |
| `theme`           | `'dark'|'light'` | Theme, synced to `<html>` class       |

### CodingWorkspace (local `useState`)

| State          | Type          | Description                         |
| -------------- | ------------- | ----------------------------------- |
| `activePanel`  | `CodingPanel` | Which activity bar item is selected |
| `sidebarOpen`  | `boolean`     | CodingSidebar visibility            |

Will migrate to a dedicated Zustand store when we need persistence or
cross-component access.
