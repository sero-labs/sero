import '@mariozechner/pi-coding-agent';
import type { TSchema } from 'typebox';
import type { CustomToolCliBridge } from '../cli/core/schema-bridge';

declare module '@mariozechner/pi-coding-agent' {
  interface CreateAgentSessionOptions {
    /**
     * Sero-specific prompt suffix appended after the resolved system prompt.
     * Used by the subagent runtime for markdown-defined agent instructions.
     */
    systemPromptSuffix?: string;
  }

  interface ToolDefinition<TParams extends TSchema = TSchema> {
    /**
     * Sero-specific CLI bridge metadata used to expose selected extension tools
     * as `sero <command>` commands. This is runtime metadata owned by Sero.
     */
    cli?: CustomToolCliBridge;
  }
}
