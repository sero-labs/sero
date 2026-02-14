# Task: Implement Usage Tracking in ChatPanel

## Goal
Add a usage badge to the ChatPanel header showing token counts and cost, using the PI SDK's `AgentSession.getSessionStats()` API.

## Architecture
- PI SDK provides `session.getSessionStats()` → `SessionStats` with tokens + cost
- Add IPC channel `sero:agent:get-usage` to fetch stats for a pool entry
- Lightweight approach: fetch on-demand (on `agent_end` events), no Zustand store needed
- `UsageBadge` component with Popover showing detailed breakdown

## Phases

### Phase 1: IPC Layer `[complete]`
- [x] Add `SessionUsageStats` type + IPC channel to `ipc.ts`
- [x] Add handler in `electron/ipc/agent.ts`
- [x] Add to preload bridge
- [x] Add to `electron.d.ts` type

### Phase 2: UsageBadge Component `[complete]`
- [x] Create `apps/desktop/src/components/layout/UsageBadge.tsx`
- [x] Wire into ChatPanel header
- [x] TypeScript compiles clean

## Files Modified
- `apps/desktop/src/types/ipc.ts` — types + channel
- `apps/desktop/electron/ipc/agent.ts` — handler
- `apps/desktop/electron/preload.ts` — bridge
- `apps/desktop/src/types/electron.d.ts` — TS types
- `apps/desktop/src/components/layout/UsageBadge.tsx` — new component
- `apps/desktop/src/components/layout/ChatPanel.tsx` — integrate badge
