/**
 * The "shown means callable" probe (spec `session-tool-surface`).
 *
 * A stub model, not a real one, reads the tool list and the Sero CLI block that
 * a session sent, calls every tool and every listed command once with
 * read-only arguments, and reads back what each call returned. A call that
 * fails because the session cannot find the tool, the command, or itself is a
 * defect: the session was shown something it cannot call.
 *
 * The probe tables are data. A tool or command with no entry fails the run and
 * is named, so a new tool cannot join a session unprobed.
 */

import { STUB_MODEL_ID, STUB_PROVIDER_ID, startStubModel, type StubModelServer, type StubReply, type StubRequest } from './stub-model';

/** A file the probes read and edit. The spec creates it in the workspace. */
export const PROBE_FILE = 'probe-read.txt';
/** The file the `write` probe creates, and the `bash` follow-up reads back. */
export const PROBE_WRITE_FILE = 'probe-write.txt';
/** What the `write` probe puts in that file. Only a real write can put it in front of the read-back. */
export const PROBE_WRITE_CONTENT = 'sero-probe-write-marker';
export const PROBE_EDIT_FILE = 'probe-edit.txt';
/** The task text that marks a session as the one a `subagent` call started. */
export const SUBAGENT_TASK = 'probe-subagent';

/** Read-only or harmless arguments for each direct tool. `sero-cli` is probed per command. */
export const TOOL_PROBES: Record<string, Record<string, unknown>> = {
  read: { path: PROBE_FILE },
  write: { path: PROBE_WRITE_FILE, content: PROBE_WRITE_CONTENT },
  edit: { path: PROBE_EDIT_FILE, edits: [{ oldText: 'alpha', newText: 'alpha2' }] },
  bash: { command: 'echo probe' },
  find: { pattern: 'probe' },
  grep: { pattern: 'probe' },
  multi_grep: { patterns: ['probe'] },
  run_code: { code: 'return 1;' },
  subagent: { task: SUBAGENT_TASK, systemPrompt: 'You are a probe agent. Do what the task asks.', model: `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}` },
  automation_browser: { action: 'launch' },
  mcp: { action: 'status' },
  usage: { action: 'summary' },
  orchestrator: { action: 'list' },
  current_time: {},
};

/**
 * Plugin tools a session can receive as direct tools, with no read-only form to
 * run. Each is called with no arguments: the tool's own validation error proves
 * the session found it, and a missing tool answers "not found" instead.
 */
export const EXISTS_ONLY_TOOLS = [
  'architect', 'architect_projects', 'cron', 'reminder', 'design_library_assets', 'design_library_items',
  'design_library_analysis', 'design_library_designs', 'design_library_export', 'design_library_media',
  'design_library_gallery', 'design_library_settings', 'git_manager', 'graphify_search', 'graphify_query',
  'graphify_path', 'graphify_explain', 'graphify_status', 'graphify_index', 'graphify_configure',
  'mcp_manager', 'output_optimizer', 'question', 'questionnaire', 'interview', 'web_search', 'fetch_content',
  'get_search_content', 'code_search', 'web_bookmark', 'create_agent', 'memory', 'scratchpad',
];

/**
 * One line for each command a session's CLI block can list. A command that has
 * no read-only form runs `help <name>`, which still fails on an unknown command.
 * `helpOnly` names them, so the run output says which were not executed.
 */
export const CLI_PROBES: Record<string, string> = {
  app: 'app list',
  current_time: 'current_time',
  goal: 'goal status',
  graphify_status: 'graphify_status',
  mcp: 'mcp status',
  orchestrator: 'orchestrator --action list',
  usage: 'usage summary',
  browser: 'browser list',
  workspace: 'workspace list',
  devserver: 'devserver list',
  // Sets the probe session's own title. A session with no chat behind it cannot.
  'set-title': 'set-title --if-unnamed Probe session',
};

/** Commands probed with `help <name>` because running them changes something or needs a user. */
export const HELP_ONLY_COMMANDS = [
  'google-account', 'appstate', 'architect', 'architect_projects', 'code_search', 'create_agent', 'cron',
  'design_library_analysis', 'design_library_assets', 'design_library_designs', 'design_library_export',
  'design_library_gallery', 'design_library_items', 'design_library_media', 'design_library_settings',
  'fetch_content', 'get_search_content', 'git_manager', 'goals', 'graphify_configure', 'graphify_explain',
  'graphify_index', 'graphify_path', 'graphify_query', 'graphify_search', 'interview', 'mcp_manager',
  'memory', 'output_optimizer', 'question', 'questionnaire', 'reminder', 'room', 'rooms', 'scratchpad',
  'web_bookmark', 'web_search', 'artifacts', 'session', 'editor', 'terminal', 'git', 'vcs',
  'automation_browser',
];

export type ProbeKind =
  | 'callable'
  | 'unknown-tool'
  | 'unknown-command'
  | 'no-session'
  | 'schema'
  | 'unseen-write'
  | 'other-error'
  | 'unexpected-error'
  | 'no-result'
  | 'no-probe';

/**
 * The kinds that mean the session was shown something it cannot call. An `unexpected-error` is a
 * failure of a call that had valid arguments. `other-error` is the same text from a call that
 * had none, where an error is the expected answer, so it does not count.
 */
export const DEFECT_KINDS: ProbeKind[] = [
  'unknown-tool', 'unknown-command', 'no-session', 'schema', 'unseen-write', 'unexpected-error', 'no-result', 'no-probe',
];

export interface ProbeOutcome {
  /** `read`, or `sero-cli: app list`. */
  label: string;
  tool: string;
  command?: string;
  kind: ProbeKind;
  detail: string;
}

export function classifyResult(text: string): Exclude<ProbeKind, 'no-probe'> {
  if (/tool\s+\S+\s+not found|unknown tool/i.test(text)) return 'unknown-tool';
  if (/unknown command/i.test(text)) return 'unknown-command';
  // `sero session info` answers "No active agent session." as a normal reply, which is not this.
  if (/requires an active agent session/i.test(text)) return 'no-session';
  if (/validation failed|must have required property|invalid arguments/i.test(text)) return 'schema';
  if (/^\s*(error|usage)\b/i.test(text)) return 'other-error';
  return 'callable';
}

/** The command names in the `## Sero CLI` block of a system prompt, in listed order. */
export function cliCommandsListed(system: string): string[] {
  const start = system.indexOf('## Sero CLI');
  if (start === -1) return [];
  const rest = system.slice(start + '## Sero CLI'.length);
  const end = rest.search(/\n## /);
  const block = end === -1 ? rest : rest.slice(0, end);
  return [...block.matchAll(/^ {2}(\S+) — /gm)].map((match) => match[1]!);
}

/**
 * Commands that block on a person, or change the user's desktop, when they run
 * with no arguments. They get `help` only, and the run output reports that.
 */
export const NEVER_RUN_BARE = ['question', 'questionnaire', 'interview', 'terminal', 'editor', 'automation_browser'];

function commandLine(name: string): string | null {
  if (CLI_PROBES[name]) return CLI_PROBES[name];
  if (!HELP_ONLY_COMMANDS.includes(name)) return null;
  // `help` proves the command is registered. Running it bare, as a second line, reaches its
  // handler, which is where a command that needs a live chat session says so.
  return NEVER_RUN_BARE.includes(name) ? `help ${name}` : `help ${name}\n${name}`;
}

const READ_BACK_ID = 'probe-read-back';

interface PlannedCall {
  id: string;
  tool: string;
  command?: string;
  /** A validation error still counts as found. */
  existsOnly?: boolean;
  arguments: Record<string, unknown>;
}

function planCalls(request: StubRequest): { calls: PlannedCall[]; unprobed: ProbeOutcome[] } {
  const calls: PlannedCall[] = [];
  const unprobed: ProbeOutcome[] = [];
  for (const tool of request.tools) {
    if (tool.name === 'sero-cli') {
      for (const name of cliCommandsListed(request.system)) {
        const line = commandLine(name);
        if (!line) {
          unprobed.push({ label: `sero-cli: ${name}`, tool: 'sero-cli', command: name, kind: 'no-probe', detail: 'no probe entry' });
          continue;
        }
        calls.push({ id: `probe-cli-${name}`, tool: 'sero-cli', command: name, existsOnly: line.includes('\n'), arguments: { command: line } });
      }
      continue;
    }
    const probe = TOOL_PROBES[tool.name] ?? (EXISTS_ONLY_TOOLS.includes(tool.name) ? {} : undefined);
    if (!probe) {
      unprobed.push({ label: tool.name, tool: tool.name, kind: 'no-probe', detail: 'no probe entry' });
      continue;
    }
    calls.push({
      id: `probe-tool-${tool.name}`,
      tool: tool.name,
      arguments: probe,
      existsOnly: !TOOL_PROBES[tool.name],
    });
  }
  return { calls, unprobed };
}

/**
 * A call with no arguments to run (`existsOnly`) proves the tool exists when it answers with a
 * validation error or any other error. A call with valid arguments must run.
 */
function outcomeKind(call: PlannedCall, text: string): ProbeKind {
  const kind = classifyResult(text);
  if (!call.existsOnly) return kind === 'other-error' ? 'unexpected-error' : kind;
  return kind === 'schema' ? 'callable' : kind;
}

/** What one session showed the stub, and what its calls returned. */
export interface ProbedSession {
  /** The user message that opened the session. */
  key: string;
  system: string;
  tools: string[];
  /** Characters of the tool schemas as sent, which count toward the start-up size. */
  toolSchemaChars: number;
  commands: string[];
  outcomes: ProbeOutcome[];
  done: boolean;
  /** Set while the follow-up `bash` call that reads back the `write` probe's file is pending. */
  readBackPending?: boolean;
}

export interface ProbeStub {
  server: StubModelServer;
  sessions: Map<string, ProbedSession>;
}

function firstUserText(request: StubRequest): string {
  return request.messages.find((message) => message.role === 'user')?.text ?? '';
}

/** A call the stub makes on request, for a session that sets something up instead of being probed. */
export interface ScriptedCall {
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * A stub model that probes every session that prompts it. Sessions are told
 * apart by the text of their first user message, so a chat and the subagent it
 * starts are recorded separately. A session whose first message is a key of
 * `scripts` makes those calls and no others.
 */
export async function startProbeStub(
  scripts: Record<string, ScriptedCall[]> = {},
  /** Answers a request itself, for a session that is not a probe target (a Room planner, for example). */
  override?: (request: StubRequest) => StubReply | undefined,
): Promise<ProbeStub> {
  const sessions = new Map<string, ProbedSession>();
  const pending = new Map<string, PlannedCall[]>();

  const server = await startStubModel((request): StubReply => {
    const custom = override?.(request);
    if (custom) return custom;
    const key = firstUserText(request);
    const hasResults = request.messages.some((message) => message.role === 'tool');

    if (!hasResults) {
      const scripted = scripts[key];
      const { calls, unprobed } = scripted
        ? {
            calls: scripted.map((call, index): PlannedCall => ({ id: `script-${index}`, tool: call.tool, command: `script-${index}`, arguments: call.arguments, existsOnly: true })),
            unprobed: [],
          }
        : planCalls(request);
      sessions.set(key, {
        key,
        system: request.system,
        tools: request.tools.map((tool) => tool.name),
        toolSchemaChars: request.tools.reduce((sum, tool) => sum + JSON.stringify(tool).length, 0),
        commands: cliCommandsListed(request.system),
        outcomes: unprobed,
        done: false,
      });
      pending.set(key, calls);
      return calls.length > 0
        ? { toolCalls: calls.map((call) => ({ id: call.id, name: call.tool, arguments: call.arguments })) }
        : { text: 'nothing to probe' };
    }

    const session = sessions.get(key);
    const calls = pending.get(key) ?? [];
    if (session && !session.done) {
      if (session.readBackPending) {
        // The follow-up: a file the session wrote must be there for its own shell.
        const readBack = request.messages.find((message) => message.role === 'tool' && message.toolCallId === READ_BACK_ID);
        if (!readBack) return { text: 'probe finished' };
        session.outcomes.push({
          label: 'write then bash',
          tool: 'bash',
          kind: readBack.text.includes(PROBE_WRITE_CONTENT) && !/no such file/i.test(readBack.text) ? 'callable' : 'unseen-write',
          detail: readBack.text.slice(0, 200),
        });
        session.readBackPending = false;
        session.done = true;
        return { text: 'probe finished' };
      }
      for (const call of calls) {
        const message = request.messages.find((candidate) => candidate.role === 'tool' && candidate.toolCallId === call.id);
        const label = call.command ? `sero-cli: ${call.command}` : call.tool;
        // A call the session never answered is a defect, even when the other calls returned.
        if (!message) {
          session.outcomes.push({ label, tool: call.tool, command: call.command, kind: 'no-result', detail: 'no result came back' });
          continue;
        }
        session.outcomes.push({
          label,
          tool: call.tool,
          command: call.command,
          kind: outcomeKind(call, message.text),
          // A scripted call's caller reads the whole result.
          detail: message.text.slice(0, scripts[key] ? 4_000 : 200),
        });
      }
      if (session.tools.includes('write') && session.tools.includes('bash') && !scripts[key]) {
        session.readBackPending = true;
        return { toolCalls: [{ id: READ_BACK_ID, name: 'bash', arguments: { command: `cat ${PROBE_WRITE_FILE}` } }] };
      }
      session.done = true;
    }
    return { text: 'probe finished' };
  });

  return { server, sessions };
}
