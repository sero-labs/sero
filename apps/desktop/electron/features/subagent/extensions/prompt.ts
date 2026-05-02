/**
 * Subagent system prompt block — injected into main sessions only.
 *
 * Provides concise guidance on when and how to use the `subagent` tool.
 */

export function buildSubagentPromptBlock(): string {
  return `

## Subagents

Use the \`subagent\` tool to delegate substantial independent work to specialist agents.
Each subagent gets a fresh context window and full workspace access.

Use subagents when:
- work can be split into independent parallel pieces
- you want specialist analysis, review, or testing
- a subtask would benefit from a clean context window

Do NOT use subagents for:
- quick file reads or simple lookups
- tasks that require back-and-forth with the user
- work that would take fewer than ~5 tool calls

Prefer named agents for recurring roles and inline \`systemPrompt\` for one-off tasks.
Subagents cannot spawn further subagents or call \`create_agent\`.
When running tasks in parallel, give each one independent file scope to avoid races.
`;
}
