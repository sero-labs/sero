# Memory

Sero Memory is a built-in plugin (`@sero-ai/plugin-memory`) that lets the chat
agent keep important or surprising facts about you and your projects across
sessions. A fact reaches the agent only when it applies, so memory changes
behaviour without filling every turn with old context. See the
[Plugin Catalog](/plugins/catalog) for the built-in plugin inventory.

Treat memory as helpful context, not as perfect recall or an audit log.

## Chat sessions only

Memory exists only in chat sessions. Subagents, orchestrator workflow steps,
Architect and Rooms sessions, and plugin app agents get no memory in their
prompt and no memory tools. When a chat starts a subagent, pass it the facts it
needs in the task.

## What the agent sees

At the start of a chat session, the agent's system prompt receives:

- **Identity** — `IDENTITY.md`: the agent's name, style and behaviour rules.
- **User** — `USER.md`: your role, stack, coding style and preferences.
- **Pinned memories** — facts that apply to most tasks, for all workspaces and
  for this workspace.
- **Unsorted memories** — memories converted from an older Sero version that
  the tidy-up has not sorted yet.
- **Open scratchpad items** for this workspace.

This part of the prompt stays the same for the whole session. A memory saved
mid-session enters the prompt at the next session or after the session
compacts.

Other memories are **on-match**. Before each new message, Sero searches them
with your message and adds the ones that apply to that turn, after your
message. Each memory is added at most once per session between compactions. A
message sent while the agent is still running does not trigger a search.

In the chat, recalled memories show as one line, **Recalled N memories**, under
your message. Select it to see each memory: the fact, its behaviour and its id.
When the agent saves, replaces or removes a memory, the chat shows one line at
that point, for example **Saved:** followed by the fact.

## Memories

Each memory has:

| Field | Values |
| --- | --- |
| Type | `preference`, `decision`, `lesson` or `reference` |
| Scope | `global` (every workspace) or `workspace` (only the workspace where it was saved) |
| Delivery | `pinned` (always in the prompt) or `on-match` (added when a message matches) |
| Behaviour | How the fact changes what the agent does |
| Terms | The words a future task would use |

Pinned memories have a cap for each scope: 10 global and 5 for each workspace.
When a scope is full, a new pinned memory is saved as on-match, and a pin is
refused with the current pinned list so the agent can unpin or replace one.

### Saving

Ask in chat, for example:

```text
Remember that this demo project uses pnpm, never npm.
```

The agent also saves on its own when you correct it, state a preference, make
a decision with a reason, or when something surprising happens. Before it
writes a new memory, Sero checks for a close existing one in the same scope.
The agent then replaces the old memory or confirms the new one is different.

The agent uses the bridged `sero memory` command:

```bash
sero memory save --content "Demo project uses pnpm." \
  --behaviour "Run pnpm, never npm, to add or install packages." \
  --type preference --scope workspace --delivery on-match \
  --terms "pnpm, package manager, dependency"
sero memory list
sero memory replace --id mem-1a2b3c4d --content "..." --behaviour "..." --terms "..."
sero memory pin --id mem-1a2b3c4d
sero memory unpin --id mem-1a2b3c4d
```

### Forgetting

```text
Forget that this demo project uses pnpm.
```

`sero memory remove --id <id> --reason "..."` moves the memory to trash with
its full content. `sero memory restore --id <id>` puts it back with the same
scope and delivery.

### Profiles

The agent reads and rewrites the identity and user profiles with
`sero memory read --target identity|user` and
`sero memory write --target identity|user --content "..."`. A write replaces
the whole profile, up to 2,000 characters. For example, ask the agent to be
more concise from now on, and it updates the identity profile.

## Scratchpad

Each workspace has a checklist of open items with no expiry, for work that
spans sessions:

```bash
sero scratchpad add --text "Migrate the auth tests"
sero scratchpad done --item 1
sero scratchpad list
```

Open items are in the prompt of every chat session in that workspace. A
finished item leaves the prompt at the next session or compaction.

## Tidy-up

When a chat session starts, Sero runs a tidy-up in the background for each
scope when the last one was more than 7 days ago, or when unsorted memories
exist. It uses the chat's model and needs no review from you. It:

- merges duplicates into one memory,
- sorts unsorted memories into pinned or on-match, within the pinned caps,
- removes a workspace memory only when a file it names inside that workspace no
  longer exists.

It never removes a memory because of age or opinion, and never removes a global
memory because a file is missing. Every change is logged with its evidence, and
every removed memory can be restored.

## Upgrading from an older version

On the first chat session after the update, Sero converts the old `MEMORY.md`
once, without a model call. Each fact becomes a global, unsorted memory, so it
stays in the prompt until the tidy-up sorts it. Sero checks that every fact was
converted before it renames the file to `MEMORY.md.v2-backup`. If the check
fails, `MEMORY.md` stays in place and its content stays in the prompt.

Old daily logs and session transcripts are left on disk untouched. Sero no
longer writes them, and they are not searched.

## Where the data lives

```text
<SERO_HOME>/workspaces/global/IDENTITY.md
<SERO_HOME>/workspaces/global/USER.md
<SERO_HOME>/workspaces/global/memory/entries/{pinned,on-match,unsorted}/
<SERO_HOME>/workspaces/global/memory/trash/
<workspace>/.sero/apps/memory/entries/{pinned,on-match}/
<workspace>/.sero/apps/memory/trash/
<workspace>/.sero/apps/memory/scratchpad.md
```

Each memory is one markdown file. Agent tools cannot read or write these
folders directly; the agent must use `sero memory` and `sero scratchpad`.

Workspace memory stays out of Git. Before the first workspace-memory write in
each app run, Sero adds `.sero/` to the repository's local exclude rules. If
Git already tracks a file in the workspace memory folder, Sero refuses
workspace-memory writes and tells the agent why.

The search index lives in `<agent dir>/cache/qmd/memory.sqlite`. The embedding
model is shared by all profiles on the machine and loads in the background;
until it is ready, search matches on the memory's terms only.

`<SERO_HOME>` is profile-resolved. For the default profile it is usually
`~/.sero-ui/`. For the canonical storage map, see
[State and Folders](/reference/state-and-folders).

## Privacy and safety

- Memory content may be sent to whichever model handles a turn, including the
  tidy-up.
- Do not store passwords, API keys, recovery codes, financial data or private
  third-party data in memory. Sero blocks content that looks like a secret.
- Before you share screenshots or profile folders, remove memory content that
  should stay private.

## Troubleshooting

### A fact was not used

Recall is selective. If a fact matters, mention it in the message, or ask the
agent to list its memories. If the memory has weak terms, ask the agent to
replace it with the words you would use.

### A fact is out of date

Ask the agent to replace it, for example:

```text
Update memory: this demo project now uses npm instead of pnpm.
```

## More detail

The
[`sero-memory-plugin`](https://github.com/sero-labs/sero/tree/main/plugins/sero-memory-plugin)
source contains the implementation details.
