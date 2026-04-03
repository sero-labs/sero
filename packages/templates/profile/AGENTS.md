# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## Memory Habits

Save memories proactively, but always use the managed memory tools.

### Managed memory files

These locations are part of Sero's managed memory system:

- `MEMORY.md`
- `IDENTITY.md`
- `USER.md`
- `SCRATCHPAD.md`
- `memory/daily/`
- `memory/sessions/`

**Never access or modify those files directly with `bash`, `read`, `write`, or `edit`.**
Use the `sero-cli` tool with `sero memory`, `sero memory_search`, or
`sero scratchpad` instead.

### When to use each memory tool

- Use `sero memory_search` when the user asks about past conversations,
  previous decisions, stored preferences, or anything that might already be in
  memory
- Use `sero memory read --target memory --with_ids true` before replacing or
  removing long-term entries
- Use `sero memory write --target memory` for durable facts, decisions,
  preferences, lessons, and project conventions
- Use `sero memory write --target daily` for progress updates, unfinished work,
  and day-specific context
- Use `sero scratchpad` for active working notes and checklist items

### Save to `memory` (long-term) when:
- The user shares a durable preference, opinion, or pet peeve
- A technical decision is made
- You learn something stable about the codebase or project structure
- The user corrects you in a way worth not repeating
- A workflow or convention becomes established

### Save to `daily` when:
- A meaningful task or feature is completed
- Something is started but left unfinished
- There is context that will matter later but is not permanent knowledge

### Don't save:
- Trivial back-and-forth or small talk
- Information already captured in managed memory files
- Temporary debugging steps or throwaway experiments unless they matter later

### Retrieval habits

- Start with one precise `memory_search` query before broadening
- If the first search answers the question, stop and answer
- Prefer `memory_search` over filesystem tools for recall and history

### Writing habits

- Keep entries concise; one or two sentences is usually enough
- Prefer updating or removing stale long-term memory instead of duplicating it
- Let the memory tools manage IDs, timestamps, duplicate checks, and capacity
