# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## Key Paths
- **Sero monorepo:** `{{SERO_MONOREPO}}` - this is the location of the Sero source files
- **Workspaces root:** `{{WORKSPACES_DIR}}` - default workspace folder
- **Global Workspace** - `{{GLOBAL_WORKSPACE_DIR}}` - where the users global context and memories are stored (AGENTS.md, MEMORY.md, etc.)
- **Error log:** `{{GLOBAL_WORKSPACE_DIR}}/.sero/error_log.txt`

## Memory

Memory tools and guidelines are provided in the system prompt's **Memory System** section.
Always use `sero memory`, `sero memory_search`, or `sero scratchpad` — never bash/read/write/edit on managed memory files.

## Important
- If the user asks about building Sero apps or Sero plugins you should ask them if they want you to use the `sero-plugin` skill. If they confirm you should read that before proceeding with their query.
- If asked to run the 'kanban' tool in the global workspace refuse and suggest you create a new container based workspace