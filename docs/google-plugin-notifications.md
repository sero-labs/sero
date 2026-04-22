# Google plugin notifications: correct implementation pattern

This note documents the notification architecture that now works for `../plugins/sero-google-plugin` so future changes do not repeat the same debugging loop.

## Short version

For Sero app plugins with a background runtime:

1. **Background polling + notification decisions belong in the app runtime**
   - File: `../plugins/sero-google-plugin/runtime/index.ts`
2. **Desktop delivery belongs to the host runtime bridge**
   - File: `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
3. **State shaping must normalize gog output into canonical unread state**
   - File: `../plugins/sero-google-plugin/shared/google-state.ts`
4. **UI should only control preferences and display state**
   - Files: `../plugins/sero-google-plugin/ui/**`
5. **Opening a thread must clear unread both locally and remotely**
   - File: `../plugins/sero-google-plugin/extension/index.ts`

If any one of those layers is wrong, notifications will appear broken.

---

## The working architecture

### 1) UI stores preferences in app state
The UI owns user preferences such as:

- `gmail.lastQuery`
- `gmail.autoRefreshIntervalMinutes`
- `gmail.notificationsEnabled`

Those are persisted in the Google app state file and consumed by the runtime.

### 2) Runtime polls in the background
The Google runtime should:

- start even when Mail is not the active tab
- read the saved inbox query from state
- poll on the configured interval
- write fresh inbox results back into app state
- compare **previous** and **next** state
- emit notifications for newly unread activity

This logic lives in:
- `../plugins/sero-google-plugin/runtime/index.ts`

### 3) Runtime uses the host notifications API
Background runtimes do **not** use extension-only UI notification APIs.

The correct runtime-side call is:

```ts
this.ctx.host.notifications.notify({
  message: 'New mail from Alice',
  subtitle: 'Release update',
  source: 'Google Mail',
  type: 'info',
  sound: true,
});
```

The host bridge must forward that to Electron/macOS notifications in:
- `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`

### 4) Canonical state mapping is critical
The runtime can only make correct decisions if unread state is mapped correctly.

For `gog gmail search`, unread labels may come back as:

- `thread.labels`
- `thread.labelIds`
- sometimes message-level labels in nested message objects

The canonical mapper in `shared/google-state.ts` must normalize all supported shapes into:

- `labelIds: string[]`
- `isUnread: boolean`

Current rule:

```ts
const labelIds = Array.from(new Set([
  ...getStringArray(thread.labelIds),
  ...getStringArray(thread.labels),
  ...getStringArray(firstMessage.labelIds),
  ...getStringArray(firstMessage.labels),
]));
```

and:

```ts
isUnread: labelIds.includes('UNREAD')
```

---

## The exact bugs we hit

### Bug 1: notifications were never firing
Cause:
- `gog gmail search` was returning unread info in `labels`
- the mapper was only looking at `labelIds` / stale message labels
- new inbox threads were stored as `isUnread: false`
- runtime correctly decided there was no new unread activity
- host notification bridge was never called

Fix:
- normalize `thread.labels` as part of canonical Gmail thread mapping

### Bug 2: opening a mail did not clear the unread dot
Cause:
- reading a thread fetched thread contents, but the cached inbox row stayed marked unread
- the local thread list did not immediately clear `UNREAD`
- remote Gmail unread state also was not explicitly updated from the plugin read action

Fix:
- `applyGmailThreadResult(...)` now marks the cached thread as read locally
- `gmail read_thread` now also does a best-effort:

```bash
gmail labels modify <threadId> --remove UNREAD
```

That gives:
- immediate UI feedback
- persistence on the next background sync

---

## Correct notification decision rules

The runtime should notify only when all of these are true:

1. `notificationsEnabled !== false`
2. this is **not** the first sync (`previousState.gmail.lastFetchedAt` exists)
3. a thread has **new unread activity**

Current detection logic treats a thread as new unread activity when:

- it is unread now, and
- either:
  - it did not exist before, or
  - it was previously read, or
  - `messageCount` changed, or
  - `date` changed, or
  - `snippet` changed

This is the right place to decide whether a desktop notification should fire.

Do **not** put this decision in the React UI.

---

## Correct unread/read handling

### Search results
Search results define the inbox list state.

That means `applyGmailSearchResult(...)` must produce canonical thread rows with:

- subject
- sender
- date
- snippet
- messageCount
- labelIds
- isUnread

### Reading a thread
Reading a thread should do two things:

1. populate `selectedThreadId` + `selectedMessages`
2. clear unread state for that thread in the cached inbox list

The local clear is important because it avoids waiting for the next poll before the unread dot disappears.

### Remote read state
Opening a thread should also update Gmail itself by removing `UNREAD`.

That keeps the next sync consistent with the local optimistic update.

---

## Separation of responsibilities

### React UI
Responsible for:
- rendering list/detail state
- exposing refresh interval and notification toggle
- updating app state preferences
- initiating thread reads

Not responsible for:
- long-lived polling
- background timers
- desktop notification delivery
- notification decision logic

### Extension tool layer
Responsible for:
- running `gog`
- translating tool actions into state writes
- read-thread side effects such as clearing `UNREAD`

### Shared state mapper
Responsible for:
- canonical normalization of gog JSON
- insulating the rest of the app from gog output shape differences

### Background runtime
Responsible for:
- polling
- diffing previous vs next inbox state
- emitting notifications

### Desktop host bridge
Responsible for:
- delivering runtime notifications to native desktop notifications

---

## Rules to keep going forward

1. **If a plugin needs notifications while its UI is inactive, use a background runtime.**
2. **Use `ctx.host.notifications.notify(...)` from runtimes, not extension/UI-only notification APIs.**
3. **Normalize third-party CLI output once in shared state mapping.**
4. **Never base notification logic on raw gog output scattered across the UI/runtime.**
5. **Treat unread state as canonical data, not styling-only UI state.**
6. **When a user opens a thread, clear unread locally immediately and sync the remote label change.**
7. **Skip notifications on first sync to avoid startup spam.**
8. **Keep notification preference and polling interval in app state so runtime and UI stay aligned.**

---

## Minimum test coverage for future changes

Keep tests for all of these cases:

### Shared state
- top-level `labels` maps to `isUnread: true`
- thread-level `labelIds` maps to `isUnread: true`
- stale first-message labels do not erase unread thread state
- reading a thread clears cached unread state locally

### Runtime
- startup background sync does not notify on first sync
- brand-new unread thread notifies
- existing thread with new unread activity notifies
- notifications disabled skips notify
- interval changes trigger immediate resync

### Manual smoke test
1. Set interval to `1m`
2. Enable `Notify`
3. Send a fresh unread email to the connected account
4. Verify:
   - desktop notification appears
   - unread dot appears in inbox list
5. Open the thread
6. Verify:
   - unread dot disappears immediately
   - it stays gone on next sync

---

## If notifications break again, debug in this order

1. **Does the runtime start?**
   - inspect `runtime/index.ts`
2. **Does polling happen on schedule?**
   - verify `lastFetchedAt` updates in the Google state file
3. **Does the inbox row map to `isUnread: true`?**
   - inspect `shared/google-state.ts`
4. **Does the runtime diff classify it as new unread activity?**
   - inspect `isNewUnreadActivity(...)`
5. **Does the runtime call `ctx.host.notifications.notify(...)`?**
6. **Does the desktop host bridge forward to `showNotification(...)`?**
   - inspect `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
7. **Does opening a thread remove `UNREAD` both locally and remotely?**
   - inspect `extension/index.ts` + `applyGmailThreadResult(...)`

If step 3 is wrong, everything after it looks broken even when the host notification plumbing is fine.

---

## Canonical files

- Google runtime:
  - `../plugins/sero-google-plugin/runtime/index.ts`
- Gmail state mapping:
  - `../plugins/sero-google-plugin/shared/google-state.ts`
- Gmail tool actions:
  - `../plugins/sero-google-plugin/extension/index.ts`
- Host notification bridge:
  - `apps/desktop/electron/features/apps/runtime/capabilities/create-host.ts`
- Shared runtime API contract:
  - `packages/common/src/app-runtime-background.ts`

This is the reference implementation for background Gmail notifications in Sero.