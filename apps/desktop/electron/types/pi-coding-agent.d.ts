import '@mariozechner/pi-coding-agent';

declare module '@mariozechner/pi-coding-agent' {
  interface CreateAgentSessionOptions {
    /**
     * Sero-specific prompt suffix appended after the resolved system prompt.
     * Used by the subagent runtime for markdown-defined agent instructions.
     */
    systemPromptSuffix?: string;
  }
}
