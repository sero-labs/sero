# Agent Sessions and Context

The chat panel is where you ask Sero to plan, inspect files, edit code, use tools, and explain what it is doing. This guide covers the day-to-day composer controls that help you give the agent useful context without assuming that every saved detail is included on every turn.

## Fast path: include a file and a workspace snapshot

1. Open or create a workspace session.
2. Type `@` and choose a file from the workspace.
3. Open composer actions and choose **Insert workspace snapshot**.
4. Add the current goal in plain language.
5. Check the model selector, then send.

Use snapshots for orientation, not as a replacement for asking the agent to inspect current files.

## What a session remembers

A session keeps conversation history and session-scoped settings for the current profile. History, memory, and context controls can help the agent, but they are not guarantees. If an instruction is critical, put it in the current prompt.

Good prompts usually include:

- the exact outcome you want
- files or folders to inspect
- constraints such as “docs-only” or “do not change product code”
- how much autonomy you expect
- when to stop and ask

## Composer controls

| Control | Use it for | Notes |
| --- | --- | --- |
| Prompt box | Write the current request | During streaming, a new submit may steer or queue depending on shortcut/state. |
| Model selector | Override the session model for this turn/session | Long-term defaults live in Settings/Admin. |
| Slash commands | Insert or run focused commands | Built-in `login` / `logout` are handled locally; command availability can depend on focused app/context. |
| `@` file references | Point the agent at workspace files | Use Tab/selection from the menu rather than relying on vague file names. |
| Attachments | Add files/images/context supported by the current composer | Attachments may be sent to the model/provider used for the turn. |
| Context editor | Adjust session system prompt, tools, skills, and presets | Treat this as session-scoped steering, not a global policy engine. |
| Workspace snapshot | Insert workspace name/root, open editor tabs, and open browser tabs | It intentionally omits git diff/status and terminal history. |
| Memory visibility toggle | Show/hide memory context blocks when present | Memory is selective and budgeted. Not all memories are sent. |
| Thinking visibility toggle | Show/hide thinking blocks when exposed | Availability depends on model/provider behavior. |
| Stop/abort | Stop the current turn | Use when the agent is going in the wrong direction or running too long. |
| Queued follow-ups | Send another prompt after the current stream ends | Queue items can be removed before they are sent. |
| Voice button | Transcribe microphone input into the prompt | Requires OpenAI credentials. |

## Context editor and presets

The context editor is for session-level instructions and available capabilities. It can expose:

- system prompt text for the session
- tool selection where supported
- skills and presets where available

Use it for durable guidance within a session, such as “prefer documentation-only edits” or “ask before destructive Git operations.” Do not rely on it to override every future model decision. Re-state important constraints in the prompt when the risk is high.

## Slash commands and file references

Type `/` to see slash commands relevant to the current focus. Type `@` to search workspace files. These menus help avoid ambiguous requests like “open the config” when multiple files match.

Examples:

```text
@apps/docs-site/docs/guide/models-and-providers.md summarize the provider health states.

/agent explain the current plan before editing files.
```

Exact command availability can change with focused app, installed plugins, and alpha runtime state.

## Steering, stopping, and queued follow-ups

While a turn is streaming, you can intervene:

- Stop/abort if the agent is clearly off track.
- Send a short steering message when you need to redirect the active turn.
- Queue a follow-up when you want the next prompt to run after the current response finishes.

Steering is not a fine-grained debugger. If the agent already changed files, review the diff and use source-control or undo tools when needed.

## Voice transcription

Voice input captures microphone audio locally in the renderer, sends it through Sero's voice bridge, and appends the transcript to the composer.

Requirements:

- microphone permission for the Sero/Electron app
- OpenAI credentials available to the active profile or environment
- network/provider access for transcription

Common errors:

| Symptom | What to check |
| --- | --- |
| Voice button is disabled | Add or restore OpenAI credentials. |
| Permission prompt never appears | Check macOS microphone privacy settings. |
| Transcription fails | Check provider credentials, network access, and `/tmp/sero-electron.log`. |
| Transcript is wrong | Edit the text before sending; the transcript is only a draft prompt. |

Privacy note: spoken text may be sent to the transcription provider configured for the feature. Do not dictate secrets unless you are comfortable sending that audio/text through the provider.

## Related docs

- [Workspace and Chat](/guide/workspace-and-chat)
- [Models and Providers](/guide/models-and-providers)
- [Settings and Admin](/guide/settings-models-admin)
- [Memory](/guide/memory)
- [Checkpoints and Undo](/guide/checkpoints-and-undo)
- [Security / Privacy](/reference/security-privacy)
