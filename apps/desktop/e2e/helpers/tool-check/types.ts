/**
 * The probe table: for every tool an agent session can be given, a real-run
 * scenario for each action, or an exemption that says why it cannot run.
 *
 * The coverage check (`electron/__tests__/tool-check/coverage.test.ts`)
 * compares this table with the inventory read from the code. The `tools`
 * Playwright project runs it.
 */

export type ToolCheckRuntime = 'host' | 'docker' | 'apple-container';

/** The places a tool runs from, in the order the action pass tries them. */
export const TOOL_CHECK_SITES = [
  'chat',
  'subagent',
  'workflow-worker',
  'architect-owner',
  'room-member',
  'codemode-chat',
  'codemode-subagent',
] as const;
export type ToolCheckSite = (typeof TOOL_CHECK_SITES)[number];

/**
 * One tool and one of its actions. `action` is null for a tool with no
 * `action` parameter. A core CLI command is named `sero <command>`, and its
 * subcommands are its actions.
 */
export interface InventoryEntry {
  tool: string;
  action: string | null;
  /** Where the tool comes from: `platform`, `inline`, `cli` or the plugin folder. */
  source: string;
}

/** A tool call's result as the session received it. */
export interface ToolCallResult {
  isError: boolean;
  /** Every text block, joined with line breaks. */
  text: string;
  images: Array<{ mimeType: string; data: string }>;
  details?: unknown;
}

/** Local stand-ins for outside systems, built once per run. */
export interface ToolCheckFixtures {
  /** A local HTTP server with test pages, as the runtime reaches it. */
  pageServerUrl: string;
  /** A bare git repository used as the push and pull remote, as the runtime sees it. */
  gitRemotePath: string;
}

export interface StepContext {
  /** The workspace folder as the test process sees it, for checking effects. */
  workspacePath: string;
  runtime: ToolCheckRuntime;
  site: ToolCheckSite;
  fixtures: ToolCheckFixtures;
  /** Values an earlier step saved for a later one, such as a created id. */
  state: Record<string, unknown>;
}

export type StepParams = Record<string, unknown>;

export interface ScenarioStep {
  /** The action this step proves. Null for a tool with no `action` parameter. */
  action: string | null;
  /**
   * The tool's parameters. For a `sero <command>` entry, `{ argv }` holds the
   * tokens after the command name.
   */
  params: StepParams | ((ctx: StepContext) => StepParams);
  /** Prepares what the step needs, from the test process. */
  setup?: (ctx: StepContext) => Promise<void>;
  /** Checks the action's effect, not only that the call returned. Throw to fail. */
  expect: (result: ToolCallResult, ctx: StepContext) => void | Promise<void>;
  /** The longest the call may take. */
  timeoutMs?: number;
}

/** The only reasons an action may go untested. "Needs setup" is not one: the scenario builds it. */
export const EXEMPTION_REASONS = ['paid outside service', 'real outside account'] as const;
export type ExemptionReason = (typeof EXEMPTION_REASONS)[number];

export interface Exemption {
  action: string | null;
  reason: ExemptionReason;
  /** Which service or account, in a sentence. */
  detail: string;
}

/** One module per tool. Steps run in order, so a mutating tool runs create, show, change, delete. */
export interface ToolProbe {
  tool: string;
  steps: ScenarioStep[];
  exemptions?: Exemption[];
}
