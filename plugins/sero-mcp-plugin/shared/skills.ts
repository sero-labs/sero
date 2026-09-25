/** One remote skill for the MCP app, from `mcp_manager` `list_skills`. */
export interface McpRemoteSkillSummary {
  serverName: string;
  uri: string;
  name: string;
  description: string;
  enabled: boolean;
  /** The file list changed, or a read failed its check. Sero asks again before code runs. */
  changed: boolean;
  /** The server cannot publish digests for this skill, so Sero does not load it. */
  dynamic: boolean;
  /** The user allowed code to run for the current file list. */
  approved: boolean;
  refreshedAt: string;
}
