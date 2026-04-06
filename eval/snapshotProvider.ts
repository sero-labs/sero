/**
 * Snapshot-only Promptfoo provider — captures session setup state
 * WITHOUT sending any prompts or making API calls.
 *
 * Used for prompt-caching stability evals: verifying that the system
 * prompt, tool list, and tool ordering remain stable across releases.
 * These evals are fast (no LLM calls) and deterministic.
 *
 * Returns the session snapshot as the output, with full metadata for
 * assertions to compare against known-good baselines.
 */
import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { setupTempDir, teardownTempDir } from './setup';
import { captureSessionSnapshot } from './helpers/sessionSnapshot';

const DEFAULT_AGENT_DIR =
  process.env.SERO_AGENT_DIR ?? `${process.env.HOME}/.sero-ui/agent`;

interface SnapshotProviderConfig {
  agentDir?: string;
}

export default class SnapshotProvider implements ApiProvider {
  private config: SnapshotProviderConfig;

  constructor(opts: { config?: SnapshotProviderConfig; id?: string } = {}) {
    this.config = opts.config ?? {};
  }

  id(): string {
    return 'sero:snapshot';
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const agentDir = this.config.agentDir ?? DEFAULT_AGENT_DIR;
    const tmpDir = await setupTempDir();

    try {
      const sdk = await import('@mariozechner/pi-coding-agent');

      const authStorage = sdk.AuthStorage.create(`${agentDir}/auth.json`);
      const modelRegistry = new sdk.ModelRegistry(
        authStorage,
        `${agentDir}/models.json`,
      );
      const settingsManager = sdk.SettingsManager.create(agentDir, agentDir);

      const loader = new sdk.DefaultResourceLoader({
        cwd: tmpDir,
        agentDir,
        settingsManager,
      });
      await loader.reload();

      const { session } = await sdk.createAgentSession({
        cwd: tmpDir,
        agentDir,
        authStorage,
        modelRegistry,
        tools: [],
        customTools: [],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
      });

      // The SDK loads tools lazily on the first prompt. To capture the
      // full tool list, trigger the before_agent_start event which is
      // where extensions inject prompts and the SDK finalises tools.
      // We do this by accessing the internal agent state after a
      // resource reload.
      //
      // In a headless session (no extensions), tools come from the
      // resource loader's discovered skills and the `tools`/`customTools`
      // arrays. The SDK core tools (bash, read, write, edit) are only
      // materialised when a prompt triggers the agent loop.

      const snapshot = captureSessionSnapshot(session);

      // Return snapshot summary as output, full data as metadata
      const toolSummary = snapshot.toolNames.join(', ');
      const output = [
        `System prompt: ${snapshot.systemPromptLength} chars (hash: ${snapshot.systemPromptHash.slice(0, 12)})`,
        `Tools (${snapshot.toolNames.length}): ${toolSummary}`,
        `Tool list hash: ${snapshot.toolListHash.slice(0, 12)}`,
      ].join('\n');

      return {
        output,
        metadata: {
          snapshot,
          systemPrompt: snapshot.systemPrompt,
          toolNames: snapshot.toolNames,
          toolCount: snapshot.toolNames.length,
          systemPromptLength: snapshot.systemPromptLength,
          systemPromptHash: snapshot.systemPromptHash,
          toolListHash: snapshot.toolListHash,
        },
      };
    } catch (err: any) {
      return { error: `Snapshot error: ${err.message}` };
    } finally {
      await teardownTempDir(tmpDir);
    }
  }
}
