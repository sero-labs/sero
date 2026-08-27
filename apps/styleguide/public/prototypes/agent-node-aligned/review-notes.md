# Agent Node UX review

## Review question

Can an Agent Node use the same workspace, session, chat, and model-selection
patterns as a local Sero workspace without showing unsupported actions?

## Problems in the current UI

- Node workspaces and sessions use a second tree style. Row spacing, icons,
  selection, metadata, and actions differ from local workspaces.
- A new remote session requires a dialog. Local workspaces create and select a
  session immediately.
- The remote model control is a long select list. It has no search, provider
  groups, or useful keyboard navigation.
- Approval and tool-count controls add a second toolbar above the conversation.
  The local chat does not use this pattern.
- The node address, engine, model, and age compete for space in each session
  row, although the tree already provides most of this context.
- Connected sessions show permanent remote-only chrome instead of showing node
  status only when it needs attention.

## Direction shown in the prototype

- Keep **Nodes** as a separate source, but use the local workspace and session
  row patterns inside each node.
- Put **New session** on each remote workspace. Create and select the session
  immediately. Do not show a dialog.
- Use the node's last selected model for a new session. Keep model selection in
  the chat composer.
- Use the same searchable, provider-grouped model popover as local chat.
- Put the supported approval control in the composer footer. Do not show local
  memory, context, attachment, or voice controls.
- Keep the normal Agent header. Show a small node identity badge at the end.
- Show a status strip only for reconnecting or offline states.
- Keep node addresses and detailed health information in Node settings.

## Decisions needed before implementation

1. Confirm that each node should remember its last selected model and use it
   for new sessions.
2. Confirm that command approval belongs in the composer footer.
3. Confirm that the sidebar should show the node's friendly name and keep its
   address in settings.
