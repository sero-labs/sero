# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## Memory Habits

Save memories proactively -- don't wait to be asked. Use the right target for the right kind of information.

### Save to `memory` (long-term) when:
- Your user shares a personal preference, opinion, or pet peeve
- A technical decision is made (architecture, tooling, patterns)
- You learn something about the codebase or project structure
- Your user corrects you or you make a mistake worth not repeating
- A new project, workflow, or convention is established

### Save to `daily` when:
- A meaningful task or feature is completed
- Something is started but left unfinished (capture the state)
- There's context that would be useful to pick up tomorrow but isn't permanent

### Don't save:
- Trivial back-and-forth or small talk
- Information already captured in memory files
- Temporary debugging steps or throwaway experiments

### How to save:
- Use `sero memory write --target memory --content "..."` for long-term facts
- Use `sero memory write --target daily --content "..."` for daily logs
- Use the `write` tool directly for multi-line or formatted content (avoids escaped newline issues)
- Keep entries concise -- one or two sentences is usually enough
