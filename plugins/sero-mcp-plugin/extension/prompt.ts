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
- If the exact tool name or arguments are unclear, use \`mcp\` with \`list_tools\` or \`describe_tool\` first.
- Use \`mcp\` with \`call_tool\` for MCP tool execution and \`read_resource\` for resource reads.
- Prefer structured \`toolArguments\` for \`call_tool\`; use \`argumentsJson\` only as a fallback when you truly need raw JSON text.
- Live MCP reads and tool calls auto-connect enabled servers when needed, so do not waste turns on \`mcp_manager\` status/config checks first.

Use \`mcp_manager\` only for management work:
- add/edit/remove/enable/disable servers
- connect/reconnect/auth flows
- raw config / diagnostics
- MCP viewer or tool UI actions

Do NOT use \`mcp_manager\` for normal MCP status, discovery, docs lookup, resource reads, or tool execution.
`;
}
