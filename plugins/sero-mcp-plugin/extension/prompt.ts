/**
 * MCP system prompt block — injected into Sero sessions.
 *
 * Keeps the MCP routing rule explicit so the agent reaches for `mcp`
 * for normal discovery/use and reserves `mcp_manager` for setup,
 * auth, diagnostics, and viewer management.
 */
export function buildMcpPromptBlock(): string {
  return `

## MCP usage

Use \`mcp\` for almost all MCP work.
If the user says “use context7/github/etc. MCP”, start with \`mcp\`, not \`mcp_manager\`.

Preferred flow:
- If you already know the server and exact tool, call \`mcp\` directly.
- If the exact tool name or arguments are unclear, use \`mcp tools <server>\` or \`mcp describe <server> <tool>\` first.
- Use \`mcp call <server> <tool> [jsonArgs]\` for MCP tool execution and \`mcp read <server> <resourceUri>\` for resource reads.
- The CLI also accepts action-style aliases like \`list_tools\`, \`describe_tool\`, \`call_tool\`, \`list_resources\`, and \`read_resource\` if they are more natural in context.
- Live MCP reads and tool calls auto-connect enabled servers when needed, so do not waste turns on \`mcp_manager\` status/config checks first.

Use \`mcp_manager\` only for management work:
- add/edit/remove/enable/disable servers
- connect/reconnect/auth flows
- raw config / diagnostics
- MCP viewer or tool UI actions

Do NOT use \`mcp_manager\` for normal MCP status, discovery, docs lookup, resource reads, or tool execution.
`;
}
