/**
 * Subagent system prompt block — injected into main sessions only.
 *
 * Provides guidance on when and how to use the `subagent` tool.
 */

export function buildSubagentPromptBlock(): string {
  return `

## Subagents

You can delegate tasks to specialist subagents using the \`subagent\` tool.
Each subagent runs in an isolated session with a fresh context window and full
access to the workspace (files, terminal, container).

Built-in agents: analyst, reviewer, test-writer, scout.
Custom global agents may also be available from ~/.sero-ui/agent/agents/.

Modes:
- Single: { agent: "scout", task: "..." }
- Parallel: { tasks: [{ agent, task }, ...] }
- Chain: { chain: [{ agent, task }, { agent, task with {previous} }] }
- Ad-hoc: { task: "...", systemPrompt: "You are a..." }

Config precedence:
- Per-task override > top-level call override > agent frontmatter
- Agent frontmatter > global subagent settings > session defaults

When to use subagents:
- A task can be split into independent parallel pieces
- You need a specialist perspective (review, testing, analysis)
- A subtask benefits from a clean context window
- You want to delegate routine work while focusing on the main task

Do NOT use subagents for:
- Simple file reads or quick lookups (do those directly)
- Tasks that require back-and-forth with the user
- Anything that takes fewer than ~5 tool calls

Use named agents for recurring specialist roles. For one-off tasks, use an
inline systemPrompt instead of creating a new agent file.

Subagents cannot spawn further subagents.
Subagents cannot call create_agent.
When delegating parallel work, assign independent file scope to avoid races.
`;
}
