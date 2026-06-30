import '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
import type { CustomToolCliBridge } from '../cli/core/schema-bridge';

declare module '@earendil-works/pi-coding-agent' {
  interface ToolDefinition<TParams extends TSchema = TSchema> {
    /**
     * Sero-specific CLI bridge metadata used to expose selected extension tools
     * as `sero <command>` commands. This is runtime metadata owned by Sero.
     */
    cli?: CustomToolCliBridge;
  }
}
