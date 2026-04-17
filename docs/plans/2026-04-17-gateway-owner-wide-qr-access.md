---
title: Gateway Owner-Wide QR Access Plan
date: 2026-04-17
status: proposed
author: OpenAI
related:
  - apps/desktop/electron/features/gateway
  - apps/desktop/electron/ipc/gateway
  - apps/desktop/src/components/layout/device
  - docs/deslopify/apps/desktop/electron/features/gateway/facts.md
  - docs/deslopify/apps/desktop/electron/features/gateway/plan.md
---

# Gateway Owner-Wide QR Access Plan

## Goal

Change the device-pairing / QR-login flow from **single-workspace web tokens** to **profile-wide owner access** so a paired remote device can access:

- all current workspaces
- future workspaces created after pairing

without requiring the user to generate a new QR code from the host machine.

## Product decision

Sero gateway pairing is an **owner remote-access** flow, not a delegated workspace-sharing flow.

That means:

- **Connect Device** should grant profile-wide remote access for that profile
- the paired token should still be a **web token**, not a master token
- the token should remain **expiring** and **revocable**
- token-management/admin behavior should remain distinct from master-token behavior
- optional limited workspace-sharing can be added later as a separate flow, not by overloading the default pairing UX

## Current problem

Today, `ConnectDeviceDialog` calls `getQrLoginData(workspaceId, expiryDays)`, and the main process creates a web token scoped to `[workspaceId]`.

That means a paired device:

- can access only the workspace that was active when the QR code was generated
- cannot access newly created workspaces
- needs a new token/QR code to switch to another workspace

This is stronger than necessary for the owner-access use case and harms the gateway's core remote-work usability.

## Desired end state

The QR/device-pairing flow should mint a web token with **all-workspace access**.

Recommended semantic model:

- **Master token**
  - unrestricted workspace access
  - can manage/revoke/create tokens
- **Owner web token**
  - unrestricted workspace access
  - can use remote workspace/session/file/artifact operations
  - cannot perform master-only token management actions
- **Future scoped share token**
  - optional later feature for restricted workspace sharing

Implementation-wise, the cleanest shape is to allow web tokens to carry either:

- an explicit `workspaceIds: string[]`, or
- an unrestricted scope marker (for example `workspaceIds: null`)

so the connection auth path can distinguish:

- unrestricted web token
- scoped web token
- master token

without collapsing owner web tokens into master auth.

## Progress checklist

### Design and scope model
- [x] Confirm the wire/storage representation for unrestricted web-token scope
  - [x] Decide on `workspaceIds: null` for unrestricted owner-wide web tokens
  - [x] Preserve backward compatibility for existing scoped tokens and legacy no-`workspaceIds` tokens where practical
- [x] Keep master-only operations master-only
  - [x] `create_web_token`
  - [x] `list_web_tokens`
  - [x] `revoke_web_token`

### Gateway auth and authorization
- [x] Update web-token storage/normalization to support unrestricted owner tokens
- [x] Update gateway auth validation to return unrestricted workspace access for owner web tokens
- [x] Verify request authorization still works correctly for:
  - [x] `list_workspaces`
  - [x] `list_sessions`
  - [x] `create_session`
  - [x] `prompt`
  - [x] `list_files`
  - [x] `read_file`
  - [x] `get_session_history`
  - [x] session/artifact event fan-out
- [x] Ensure future workspaces automatically appear to already-paired owner devices

### QR / IPC / desktop UX
- [ ] Change QR login generation to mint owner-wide web tokens instead of single-workspace tokens
- [ ] Update renderer/preload/API contract if `workspaceId` is no longer needed for QR generation
- [ ] Update `ConnectDeviceDialog` copy so it clearly says the paired device can access the whole profile / all workspaces
- [ ] Remove now-misleading single-workspace wording from the pairing flow

### Regression coverage
- [x] Add focused tests for unrestricted owner web tokens
  - [x] owner web token can list all workspaces
  - [x] owner web token can access a workspace created after token issuance
  - [x] owner web token is still blocked from master-only token management routes
  - [x] existing scoped-token behavior still works if retained
- [x] Update any affected gateway protocol / auth / IPC tests

### Documentation sync
- [ ] Update `docs/deslopify/apps/desktop/electron/features/gateway/facts.md`
  - [ ] replace the “QR pairing creates workspace-scoped tokens” statements with the new owner-wide behavior
  - [ ] note whether scoped tokens still exist for non-QR use cases
- [ ] Update `docs/deslopify/apps/desktop/electron/features/gateway/plan.md`
  - [ ] record the product-direction correction from workspace-scoped QR pairing to owner-wide pairing
  - [ ] note any remaining follow-up work for optional limited-share tokens
- [ ] Add a brief execution summary to `docs/deslop.md` if this lands as a tracked cleanup/refinement

### Validation
- [x] Run targeted gateway tests
- [ ] Run any targeted renderer/web-remote tests touched by the API change
- [x] Run `pnpm typecheck`

## Likely files

### Gateway auth / server
- `apps/desktop/electron/features/gateway/bridge/web-tokens.ts`
- `apps/desktop/electron/features/gateway/security/auth.ts`
- `apps/desktop/electron/features/gateway/server/access-control.ts`
- `apps/desktop/electron/features/gateway/server/request-handler.ts`
- `apps/desktop/electron/features/gateway/server/extended-handlers.ts`
- `apps/desktop/electron/features/gateway/index.ts`

### IPC / preload / renderer
- `apps/desktop/electron/ipc/gateway/gateway.ts`
- `apps/desktop/electron/preload/platform/host-services.ts`
- `apps/desktop/src/types/electron-services.d.ts`
- `apps/desktop/src/types/gateway.ts`
- `apps/desktop/src/components/layout/device/ConnectDeviceDialog.tsx`

### Tests
- `apps/desktop/electron/__tests__/features/gateway/*`
- possibly any renderer tests affected by the pairing contract

### Docs
- `docs/deslopify/apps/desktop/electron/features/gateway/facts.md`
- `docs/deslopify/apps/desktop/electron/features/gateway/plan.md`
- `docs/deslop.md`

## Risks / watch-outs

- Do **not** accidentally make owner web tokens equivalent to master tokens.
- Avoid baking single-workspace assumptions into the web remote UI after this change.
- If token storage format changes, preserve compatibility with already-issued tokens where reasonable.
- Make sure unrestricted web tokens naturally include future workspaces rather than snapshotting the workspace list at issuance time.

## Acceptance criteria

- Pairing a device from `Connect Device` grants access to all current and future workspaces in the profile.
- The paired device does not need a new QR code just because a different workspace is opened or created later.
- The token remains revocable/expiring and is still not allowed to perform master-only token-management operations.
- Existing authorization provenance for sessions/artifacts remains intact.
- `facts.md` and `plan.md` under `docs/deslopify/.../gateway/` are updated to reflect the new behavior.
