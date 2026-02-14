# Task: Add Attachments to ChatPanel

## Goal
Add file attachment support to the ChatPanel using ai-elements components (prompt-input attachments, Attachments). Support multiple files with drag-and-drop, paste, and file picker.

## Phases

### Phase 1: Update IPC types — `complete`
- Added `ChatAttachment` type with id, filename, mediaType, url
- Added optional `attachments` field to `ChatUserMessage`

### Phase 2: Update agent store — `complete`
- Updated `sendPrompt` signature to accept optional `ChatAttachment[]`
- Optimistically adds user message with attachments to conversation

### Phase 3: Create ChatAttachments display component — `complete`
- New file: `src/components/layout/ChatAttachments.tsx` (73 lines)
- `PromptAttachmentsBar` — inline badges in prompt input header
- `MessageAttachments` — grid thumbnails in user messages

### Phase 4: Update ChatPanel — `complete`
- Enabled `multiple` + `globalDrop` on PromptInput
- Added `PromptInputHeader` with `PromptAttachmentsBar`
- Added `PromptInputActionMenu` with `PromptInputActionAddAttachments` in tools
- Updated `handleSubmit` to use `PromptInputMessage` with files conversion
- Render `MessageAttachments` in user messages
- All typechecks pass ✓

## Files Modified
- `apps/desktop/src/types/ipc.ts` — added ChatAttachment type
- `apps/desktop/src/stores/agent.ts` — updated sendPrompt with attachments
- `apps/desktop/src/components/layout/ChatAttachments.tsx` — NEW (73 lines)
- `apps/desktop/src/components/layout/ChatPanel.tsx` — updated (304 lines)

## Line Count Check ✓
All files under 500 LOC limit.
