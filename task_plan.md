# Kanban Restart Recovery — Task Plan

## Goal
Cards stuck in active columns (planning, in-progress, review) after an app
restart should be recoverable via a manual `retry` action. The orchestrator
should detect cards with `agent-working` status that aren't currently being
processed and trigger the appropriate phase handler.

## Implementation — `complete`

### 1. Orchestrator retry detection
- [x] Added `isRetryableColumn()` helper (planning, in-progress, review)
- [x] Added `isCurrentlyProcessing()` check (all three `*InProgress` sets)
- [x] Extended `onStateChange` with third branch: same column + `agent-working` + not processing → trigger handler
- [x] This covers both manual retry AND automatic restart recovery (if status was left as `agent-working`)

### 2. Extension `retry` action
- [x] Added `retry` to tool actions enum + description
- [x] Validates: card in active column, not already `agent-working`
- [x] Sets `status: 'agent-working'`, clears `error`, writes state
- [x] Orchestrator picks up the state change and triggers the phase

### 3. UI Retry button
- [x] Added `handleRetry` callback in CardDetail
- [x] Shows "Retry" / "Resume {Column}" button for failed/idle cards in active columns
- [x] Includes explanatory helper text

### 4. Refactoring (500 LOC compliance)
- [x] Extracted `extension/state-io.ts` (I/O + formatting helpers)
- [x] Extracted `PlanApprovalPanel.tsx` (plan approval UI)
- [x] All files ≤ 500 LOC ✓

### 5. Typecheck
- [x] apps/desktop: tsc --noEmit ✓
- [x] packages/pi-kanban-extension ui: tsc --noEmit ✓

## Flow

```
User clicks "Resume Review" (or runs `kanban retry 1`)
  → state.json: card.status = 'agent-working', card.error = undefined
  → appStateManager detects file change
  → orchestrator.onStateChange() fires
  → card.column === prevColumn (no transition)
  → card.status === 'agent-working' && isRetryable && !processing
  → handleTransition(card, 'review', 'review')
  → runReviewPhase() starts
```

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| TS2345: `includes()` narrowing | 1 | Used explicit `===` comparisons instead of `as const` array |
| extension/index.ts 508 LOC | 1 | Extracted `state-io.ts` (I/O + formatters) |
| CardDetail.tsx 532 LOC | 1 | Extracted `PlanApprovalPanel.tsx` |
