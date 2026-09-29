/**
 * MCP system prompt block — injected into Sero sessions.
 *
 * Keeps the MCP routing rule explicit so the agent reaches for `sero mcp`
 * for normal discovery/use and reserves `sero mcp_manager` for setup,
 * auth, diagnostics, and viewer management. Both are `sero-cli` commands.
 */
export function buildMcpPromptBlock(): string {
  return `

## MCP usage

MCP (Model Context Protocol) servers give Sero extra tools and data, and they are \`sero-cli\` commands. Run \`sero mcp\` for status, discovery, tool calls and resource reads, and start there when the user names a server such as context7 or github.
Run \`sero mcp_manager\` only to add, remove, connect or authenticate servers, or to read config and diagnostics.
`;
}
