/**
 * The tools a chat uses to run other code and other agents: `codemode`,
 * `subagent` and `create_agent`. A subagent's session is answered here, by
 * its task text, so the result proves the run reached a model and came back.
 */
import fs from 'node:fs';
import type { StubReply, StubRequest } from '../../stub-model';
import { firstUserText } from '../driver';
import { expectText } from '../expect';
import { expectFile } from '../files';
import type { StepContext, ToolProbe } from '../types';

const AGENT = 'tc-probe-agent';
const AGENT_PROMPT = 'You are the tool check probe agent.';
let agentsCreated = 0;

/**
 * The first agent created is the one the subagent steps use. The site pass
 * runs create_agent again, and a name can be taken once, so later calls get
 * their own. Kept in the step state so `expect` checks the same name.
 */
function nextAgentName(ctx: StepContext): string {
  agentsCreated += 1;
  ctx.state.agentName = agentsCreated === 1 ? AGENT : `${AGENT}-${agentsCreated}`;
  return String(ctx.state.agentName);
}

/** Every subagent task starts with this, so the responder claims only these sessions. */
const TASK = 'tc-sub:';

/** Answers a subagent with its own task, and says when the agent file supplied the system prompt. */
function subagentReply(request: StubRequest): StubReply | undefined {
  const task = firstUserText(request);
  const at = task.indexOf(TASK);
  if (at === -1) return undefined;
  const from = request.system.includes(AGENT_PROMPT) ? ` from ${AGENT}` : '';
  return { text: `answered ${task.slice(at, at + 200).split('\n')[0]}${from}` };
}

function answerSubagents(ctx: StepContext): Promise<void> {
  if (!ctx.respondWith) throw new Error('this step needs the stub model');
  ctx.state.removeSubagentResponder = ctx.respondWith(subagentReply);
  return Promise.resolve();
}

function stopAnsweringSubagents(ctx: StepContext): void {
  const remove = ctx.state.removeSubagentResponder;
  if (typeof remove === 'function') remove();
}

export const codemodeProbe: ToolProbe = {
  tool: 'codemode',
  steps: [
    {
      action: null,
      params: {
        code: [
          "await tools.write({ path: 'tc-codemode.txt', content: 'written by a script\\n' });",
          "const read = await tools.read({ path: 'tc-codemode.txt' });",
          "const shell = await tools.bash({ command: 'echo tc-shell-$((6 * 7))' });",
          "store('tc-kept', 'kept across calls');",
          'return { read, shell: shell.output.trim() };',
        ].join('\n'),
      },
      async expect(result, ctx) {
        expectText(result, 'Script completed');
        expectText(result, 'written by a script');
        expectText(result, 'tc-shell-42');
        await expectFile(ctx, 'tc-codemode.txt', 'written by a script\n');
      },
    },
    {
      // A second script sees what the first one stored.
      action: null,
      params: { code: "return load('tc-kept');" },
      expect(result) {
        expectText(result, 'Script completed');
        expectText(result, 'kept across calls');
      },
    },
  ],
};

export const createAgentProbe: ToolProbe = {
  tool: 'create_agent',
  steps: [
    {
      action: null,
      // The site pass runs this again at other sites; an agent name can be taken once.
      params: (ctx) => ({ name: nextAgentName(ctx), description: 'Answers tool check tasks.', systemPrompt: AGENT_PROMPT, timeoutMs: 60_000 }),
      expect(result, ctx) {
        const name = String(ctx.state.agentName);
        expectText(result, `Agent '${name}' created at `);
        const file = /created at (.+\.md)$/m.exec(result.text)?.[1];
        if (!file || !fs.existsSync(file)) throw new Error(`no agent file: ${result.text}`);
        const content = fs.readFileSync(file, 'utf8');
        if (!content.includes(`"name": "${name}"`) || !content.includes(AGENT_PROMPT)) throw new Error(`the agent file holds ${content}`);
        ctx.state.agentFile = file;
      },
    },
  ],
};

export const subagentProbe: ToolProbe = {
  tool: 'subagent',
  steps: [
    {
      // Single mode with an inline system prompt.
      action: null,
      setup: answerSubagents,
      params: { task: `${TASK} single`, systemPrompt: 'You answer tool check tasks.' },
      expect: (result) => expectText(result, `answered ${TASK} single`),
    },
    {
      // Single mode with the agent create_agent wrote: its file gives the system prompt.
      action: null,
      params: { agent: AGENT, task: `${TASK} named` },
      expect: (result) => expectText(result, `answered ${TASK} named from ${AGENT}`),
    },
    {
      action: null,
      params: { tasks: [{ agent: AGENT, task: `${TASK} first` }, { agent: AGENT, task: `${TASK} second` }] },
      expect(result) {
        expectText(result, `answered ${TASK} first`);
        expectText(result, `answered ${TASK} second`);
      },
    },
    {
      // Each link of a chain gets the one before it in `{previous}`.
      action: null,
      params: { chain: [{ agent: AGENT, task: `${TASK} link-1` }, { agent: AGENT, task: `${TASK} link-2 after {previous}` }] },
      expect(result, ctx) {
        stopAnsweringSubagents(ctx);
        expectText(result, `answered ${TASK} link-2 after answered ${TASK} link-1`);
      },
    },
  ],
};
