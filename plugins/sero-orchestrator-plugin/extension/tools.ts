// The `orchestrator` control-plane tool (Pi-safe extension surface).
//
// One tool, seven actions (create/list/show/pause/resume/stop/run_next). Every
// path — the structured tool (agent / useAppTools), the bridged `sero
// orchestrator …` CLI, and the `/orchestrator` slash command — funnels into the
// coordinator via `requestAction`. The extension never touches state or runs
// work itself; it only resolves the workspace coordinator from the registry and
// forwards the request (D-01). With no Sero runtime (Pi CLI, or a closed
// workspace) the registry is empty and we report that plainly.

import { StringEnum } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import { getOrchestratorRegistry, type OrchestratorCoordinator } from '../shared/registry';
import type {
  ExecutionMode,
  LoopGoal,
  OrchestratorAction,
  OrchestratorActionResult,
} from '../shared/types';

const NOT_READY =
  'Orchestrator is not running for this workspace. Open the workspace in Sero and try again.';

const WORKER_FILTERED =
  'The orchestrator CLI is not available to orchestrator worker sessions.';

const EXECUTION_MODES: readonly ExecutionMode[] = [
  'background-worker',
  'active-session',
  'hybrid',
];

export const Params = Type.Object({
  action: StringEnum([
    'create',
    'list',
    'show',
    'edit',
    'replan',
    'health',
    'pause',
    'resume',
    'stop',
    'run_next',
  ] as const),
  loopId: Type.Optional(
    Type.String({ description: 'Goal id (for show/edit/replan/pause/resume/stop/run_next)' }),
  ),
  title: Type.Optional(Type.String({ description: 'Short title (for create/edit)' })),
  goal: Type.Optional(
    Type.String({ description: 'What the loop should achieve (for create/edit)' }),
  ),
  executionMode: Type.Optional(
    StringEnum(['background-worker', 'active-session', 'hybrid'] as const, {
      description: 'How attempts run (for create); defaults to background-worker',
    }),
  ),
  isolate: Type.Optional(
    Type.Boolean({
      description: 'create only: run attempts in an isolated worktree (background-worker)',
    }),
  ),
  openPr: Type.Optional(
    Type.Boolean({ description: 'create only: open a PR when the goal completes (implies isolate)' }),
  ),
  overrideNoProgress: Type.Optional(
    Type.Boolean({ description: 'run_next only: override a no-progress block once' }),
  ),
});

export type OrchestratorParams = {
  action: 'create' | 'list' | 'show' | 'edit' | 'replan' | 'health' | 'pause' | 'resume' | 'stop' | 'run_next';
  loopId?: string;
  title?: string;
  goal?: string;
  executionMode?: string;
  isolate?: boolean;
  openPr?: boolean;
  overrideNoProgress?: boolean;
};

export const HELP = [
  'orchestrator — manage durable workflow loops (goals)',
  '',
  'Usage:',
  '  sero orchestrator list',
  '  sero orchestrator show <id>',
  '  sero orchestrator create --title "<title>" --goal "<goal>" [--mode background-worker|active-session|hybrid] [--isolate] [--pr]',
  '  sero orchestrator edit <id> [--title "<title>"] [--goal "<goal>"]   # a goal change re-derives the plan',
  '  sero orchestrator replan <id>                                        # re-derive the plan on the same goal',
  '  sero orchestrator pause <id>',
  '  sero orchestrator resume <id>',
  '  sero orchestrator stop <id>',
  '  sero orchestrator run-next <id> [--override-no-progress]',
  '  sero orchestrator health                                             # advisory health check across all in-flight goals',
  '  sero orchestrator diagnose-session',
].join('\n');

// ── Coordinator resolution ──────────────────────────────────────────────────

export function resolveCoordinator(key: string | undefined): OrchestratorCoordinator | null {
  if (!key) return null;
  return getOrchestratorRegistry().resolve(key);
}

// ── Action building ─────────────────────────────────────────────────────────

type ActionOrError = OrchestratorAction | { error: string };

function isError(value: ActionOrError): value is { error: string } {
  return 'error' in value;
}

function normalizeMode(mode: string | undefined): ExecutionMode | undefined {
  if (!mode) return undefined;
  return EXECUTION_MODES.includes(mode as ExecutionMode) ? (mode as ExecutionMode) : undefined;
}

/** Build an action from structured tool params (agent / useAppTools / UI). */
export function actionFromParams(params: OrchestratorParams): ActionOrError {
  switch (params.action) {
    case 'list':
      return { kind: 'list' };
    case 'health':
      return { kind: 'health' };
    case 'create':
      if (!params.title?.trim() || !params.goal?.trim()) {
        return { error: 'create needs a title and a goal.' };
      }
      return {
        kind: 'create',
        input: {
          title: params.title,
          goal: params.goal,
          executionMode: normalizeMode(params.executionMode),
          isolation: params.isolate || params.openPr ? 'worktree' : undefined,
          prPolicy: params.openPr ? { openOnComplete: true } : undefined,
        },
      };
    case 'edit':
      if (!params.loopId?.trim()) return { error: 'edit needs a goal id.' };
      if (params.title === undefined && params.goal === undefined) {
        return { error: 'edit needs a new title or goal.' };
      }
      return { kind: 'edit', loopId: params.loopId, title: params.title, goal: params.goal };
    case 'replan':
      if (!params.loopId?.trim()) return { error: 'replan needs a goal id.' };
      return { kind: 'replan', loopId: params.loopId };
    case 'show':
    case 'pause':
    case 'resume':
    case 'stop':
      if (!params.loopId?.trim()) return { error: `${params.action} needs a goal id.` };
      return { kind: params.action, loopId: params.loopId };
    case 'run_next':
      if (!params.loopId?.trim()) return { error: 'run_next needs a goal id.' };
      return {
        kind: 'run_next',
        loopId: params.loopId,
        overrideNoProgress: params.overrideNoProgress,
      };
  }
}

/** Build an action from a tokenized CLI / slash-command line. */
export function actionFromCli(argv: string[]): ActionOrError {
  const { positionals, flags } = parseFlags(argv);
  const sub = (positionals[0] ?? 'list').toLowerCase();
  const id = positionals[1];

  switch (sub) {
    case 'list':
      return { kind: 'list' };
    case 'health':
      return { kind: 'health' };
    case 'create':
      return actionFromParams({
        action: 'create',
        title: flags.get('title'),
        goal: flags.get('goal'),
        executionMode: flags.get('mode') ?? flags.get('executionMode'),
        isolate: flags.has('isolate') || flags.has('worktree'),
        openPr: flags.has('pr') || flags.has('open-pr'),
      });
    case 'edit':
      if (!id) return { error: 'edit needs a goal id.' };
      return actionFromParams({
        action: 'edit',
        loopId: id,
        title: flags.get('title'),
        goal: flags.get('goal'),
      });
    case 'replan':
    case 're-plan':
      if (!id) return { error: 'replan needs a goal id.' };
      return { kind: 'replan', loopId: id };
    case 'show':
    case 'pause':
    case 'resume':
    case 'stop':
      if (!id) return { error: `${sub} needs a goal id.` };
      return { kind: sub, loopId: id };
    case 'run-next':
    case 'run_next':
      if (!id) return { error: 'run-next needs a goal id.' };
      return {
        kind: 'run_next',
        loopId: id,
        overrideNoProgress: flags.has('override-no-progress'),
      };
    case 'diagnose-session':
    case 'diagnose_session':
      return { kind: 'diagnose_session' };
    case 'help':
      return { error: HELP };
    default:
      return { error: `Unknown subcommand "${sub}".\n\n${HELP}` };
  }
}

// ── Result formatting (plain English) ───────────────────────────────────────

export function formatResult(result: OrchestratorActionResult): string {
  if (!result.ok) return result.error ?? 'Something went wrong.';
  if (result.loops) return renderLoopList(result.loops);
  if (result.loop) return `${result.message ? `${result.message}\n\n` : ''}${renderLoop(result.loop)}`;
  return result.message ?? 'Done.';
}

function renderLoopList(loops: LoopGoal[]): string {
  if (loops.length === 0) return 'No goals yet.';
  return loops
    .map((loop) => `• ${loop.title} — ${loop.status}  (${loop.id})`)
    .join('\n');
}

function renderLoop(loop: LoopGoal): string {
  const mode = loop.isolation === 'worktree' ? `${loop.executionMode} · worktree` : loop.executionMode;
  // A loop with an LLM-authored plan reports its criteria; legacy loops, checks.
  const verification = loop.verificationPlan
    ? `${loop.verificationPlan.criteria.length} criteria`
    : `${loop.checks.length} checks`;
  const lines = [
    `${loop.title} — ${loop.status}`,
    `id: ${loop.id}`,
    `goal: ${loop.goal}`,
    `mode: ${mode}`,
    `${verification} · attempts: ${loop.attempts.length}`,
  ];
  if (loop.pullRequest) lines.push(`PR: #${loop.pullRequest.number} (${loop.pullRequest.state}) ${loop.pullRequest.url}`);
  if (loop.statusReason) lines.push(`reason: ${loop.statusReason}`);
  return lines.join('\n');
}

// ── Tiny arg parser (Pi-safe, no host imports) ──────────────────────────────

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string>;
}

function parseFlags(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(body, next);
          i++;
        } else {
          flags.set(body, 'true');
        }
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

/** Split a raw command-line string into argv, respecting simple quotes. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

// ── Tool definition ─────────────────────────────────────────────────────────

interface SeroCliContext {
  workspaceId?: string;
  cwd?: string;
  // The bridged CLI context carries the invoking session; the coordinator uses
  // it to reject worker-sourced control requests (D-16 recursion guard).
  invocation?: { sessionId?: string | null };
}

interface SeroCliResult {
  output: string;
  exitCode: number;
}

interface SeroToolCli {
  summary: string;
  help: string;
  group: string;
  execute(args: readonly string[], context: SeroCliContext): Promise<SeroCliResult>;
}

type SeroCliTool<T> = T & { cli: SeroToolCli };

function toolResult(text: string, ok: boolean) {
  return { content: [{ type: 'text' as const, text }], details: { ok } };
}

export function createOrchestratorTool(): SeroCliTool<ToolDefinition<typeof Params>> {
  return {
    name: 'orchestrator',
    label: 'Sero Orchestrator',
    description:
      'Manage durable workflow loops (goals). Actions: list, show (id), create (title+goal), edit (id, title?/goal?), replan (id), health, pause (id), resume (id), stop (id), run_next (id).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const coordinator = resolveCoordinator(ctx?.cwd);
      if (!coordinator) return toolResult(NOT_READY, false);
      const action = actionFromParams(params as OrchestratorParams);
      if (isError(action)) return toolResult(action.error, false);
      const result = await coordinator.requestAction(action);
      return toolResult(formatResult(result), result.ok);
    },

    renderResult(result, _options, theme) {
      const first = result.content[0];
      const msg = first?.type === 'text' ? first.text : '';
      const ok = !msg.startsWith('Orchestrator is not') && !msg.startsWith('Unknown');
      return new Text(ok ? theme.fg('muted', msg) : theme.fg('error', msg), 0, 0);
    },

    cli: {
      summary: 'Manage orchestrator goals from the CLI',
      help: HELP,
      group: 'Apps',
      async execute(args, context) {
        const coordinator = resolveCoordinator(context.workspaceId ?? context.cwd);
        if (!coordinator) return { output: NOT_READY, exitCode: 1 };
        // Defense-in-depth (D-16): hide the whole orchestrator CLI from worker
        // sessions, one layer earlier than — and broader than — the coordinator's
        // control-action rejection (which still allows read-only list/show). A
        // worker has no business reaching the orchestrator at all.
        if (coordinator.isWorkerSession(context.invocation?.sessionId)) {
          return { output: WORKER_FILTERED, exitCode: 1 };
        }
        const action = actionFromCli([...args]);
        if (isError(action)) return { output: action.error, exitCode: 1 };
        const result = await coordinator.requestAction(action, {
          sessionId: context.invocation?.sessionId,
        });
        return { output: formatResult(result), exitCode: result.ok ? 0 : 1 };
      },
    },
  };
}
