/**
 * Research Orchestrator Extension — Multi-agent research with parallel workstreams.
 *
 * Decomposes research questions into 2-4 parallel agent workstreams,
 * monitors progress at escalating intervals, handles stuck agents,
 * and synthesizes results into a unified document.
 *
 * Tools: research (plan, approve, status, cancel)
 * Commands: /research
 */

import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { ResearchState, ResearchSession, ResearchAgent, ResearchPhase } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { resolveStatePath, readState, writeState, countLines, readFile, writeSkeletonFile, reconcileState } from './state-io';
import {
  buildSkeletonFile, buildAgentSystemPrompt, buildAgentTaskPrompt, buildSynthesisPrompt,
  buildArticleAnalysisAgents, buildArticleAgentSystemPrompt, buildArticleSynthesisPrompt,
} from './prompts';
import { registerCommands } from './commands';

// ── Constants ──────────────────────────────────────────────────

const RESEARCH_DIR_BASE = 'research';

// Monitor intervals: 30s, 2min, 5min, then every 5min
const MONITOR_INTERVALS_MS = [30_000, 120_000, 300_000];
const MONITOR_REPEAT_MS = 300_000;
const STUCK_THRESHOLD = 2; // unchanged line count for N check-ins → stuck

// ── Tool parameters ─────────────────────────────────────────────

const ResearchParams = Type.Object({
  action: StringEnum(['plan', 'approve', 'status', 'cancel', 'analyze'] as const),
  question: Type.Optional(Type.String({ description: 'Research question (for plan/analyze)' })),
  agents: Type.Optional(Type.Array(
    Type.Object({
      name: Type.String({ description: 'Agent workstream name' }),
      sections: Type.Array(Type.String(), { description: 'Section titles to research' }),
    }),
    { description: 'Agent definitions (for plan)' },
  )),
  urls: Type.Optional(Type.Array(Type.String(), { description: 'Article URLs to analyse (for analyze)' })),
  context: Type.Optional(Type.String({ description: 'User context — what they are building or looking for (for analyze)' })),
});

// ── Extension ──────────────────────────────────────────────────

export default function researchExtension(pi: ExtensionAPI): void {
  let statePath = '';
  let workspaceCwd = '';

  function ensureStatePath(ctx?: { cwd?: string }): void {
    if (!statePath && ctx?.cwd) {
      statePath = resolveStatePath(ctx.cwd);
      workspaceCwd = ctx.cwd;
    }
  }

  async function syncState(state: ResearchState): Promise<void> {
    if (!statePath) return;
    await writeState(statePath, state);
  }

  function makeResult(text: string, error = false) {
    return {
      content: [{ type: 'text' as const, text }],
      details: {},
      ...(error && { isError: true }),
    };
  }

  // ── Tool: research ─────────────────────────────────────────

  pi.registerTool({
    name: 'research',
    label: 'Research',
    description:
      'Multi-agent research orchestrator. Actions:\n' +
      '  plan — Decompose a question into research workstreams. Requires `question` and `agents` array.\n' +
      '  analyze — Analyse article URLs for commercial opportunities. Requires `urls` array, optional `question` and `context`.\n' +
      '  approve — Launch the planned research workstreams.\n' +
      '  status — Check progress of active research.\n' +
      '  cancel — Cancel active research.',
    parameters: ResearchParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      ensureStatePath(ctx);
      if (!statePath) {
        return makeResult('Error: no workspace cwd set', true);
      }
      const state = await readState(statePath);

      switch (params.action) {
        case 'plan':
          return handlePlan(state, params);
        case 'analyze':
          return handleAnalyze(state, params);
        case 'approve':
          return handleApprove(state);
        case 'status':
          return handleStatus(state);
        case 'cancel':
          return handleCancel(state);
        default:
          return makeResult(`Unknown action: ${params.action}`, true);
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('research '));
      text += theme.fg('muted', args.action);
      if (args.question) {
        const q = args.question.length > 60
          ? args.question.slice(0, 60) + '…'
          : args.question;
        text += ` ${theme.fg('dim', `"${q}"`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('Error:')) return new Text(theme.fg('error', msg), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Action handlers ──────────────────────────────────────────

  async function handlePlan(
    state: ResearchState,
    params: Record<string, unknown>,
  ) {
    const question = params.question as string | undefined;
    const agents = params.agents as Array<{ name: string; sections: string[] }> | undefined;

    if (!question) return makeResult('Error: question is required for plan', true);
    if (!agents?.length) return makeResult('Error: agents array is required for plan', true);
    if (agents.length < 2 || agents.length > 4) {
      return makeResult('Error: provide 2-4 agent workstreams', true);
    }

    const session = buildSession(question, agents, 'research');
    state.current = session;
    await syncState(state);

    // Format plan for display
    const planLines = session.agents.map((a) => {
      const sectionList = a.sections.map((s) => `  - ${s.title}`).join('\n');
      return `### Agent ${a.id}: ${a.name}\n${sectionList}`;
    });

    return makeResult(
      `## Research Plan: ${question}\n\n` +
      `${planLines.join('\n\n')}\n\n` +
      `### Synthesis Agent\n` +
      `Runs after all agents complete → unified document with cross-cutting insights\n\n` +
      `Output: ${session.outputDir}/\n\n` +
      `**Ready to launch ${session.agents.length} research agents.** ` +
      `Call research(action: "approve") to begin.`,
    );
  }

  async function handleAnalyze(
    state: ResearchState,
    params: Record<string, unknown>,
  ) {
    const urls = params.urls as string[] | undefined;
    const question = params.question as string | undefined;
    const userContext = params.context as string | undefined;

    if (!urls?.length) return makeResult('Error: urls array is required for analyze', true);

    // Build a question from the URLs if not provided
    const resolvedQuestion = question || `Analyse articles for commercial opportunities and actionable insights`;
    const agents = buildArticleAnalysisAgents(urls);
    const session = buildSession(resolvedQuestion, agents, 'article');
    session.articleUrls = urls;
    if (userContext) session.userContext = userContext;

    state.current = session;
    await syncState(state);

    const planLines = session.agents.map((a) => {
      const sectionList = a.sections.map((s) => `  - ${s.title}`).join('\n');
      return `### Agent ${a.id}: ${a.name}\n${sectionList}`;
    });

    const urlList = urls.map((u) => `- ${u}`).join('\n');

    return makeResult(
      `## Article Analysis Plan\n\n` +
      `**Articles:**\n${urlList}\n\n` +
      (userContext ? `**Context:** ${userContext}\n\n` : '') +
      `${planLines.join('\n\n')}\n\n` +
      `### Synthesis Agent\n` +
      `Runs after all agents complete → unified strategic recommendations\n\n` +
      `Output: ${session.outputDir}/\n\n` +
      `**Ready to launch ${session.agents.length} analysis agents.** ` +
      `Call research(action: "approve") to begin.`,
    );
  }

  /** Shared session builder for both research and article modes. */
  function buildSession(
    question: string,
    agents: Array<{ name: string; sections: string[] }>,
    mode: 'research' | 'article',
  ): ResearchSession {
    const dirName = question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    const outputDir = path.join(RESEARCH_DIR_BASE, dirName);

    return {
      mode,
      question,
      phase: 'awaiting_approval',
      agents: agents.map((a, i) => ({
        id: i + 1,
        name: a.name,
        sections: a.sections.map((s) => ({ title: s, completed: false })),
        status: 'pending',
        outputFile: path.join(outputDir, `agent-${i + 1}.md`),
        lineCount: 0,
        stuckChecks: 0,
      })),
      outputDir,
      startedAt: new Date().toISOString(),
      monitorCycles: 0,
    };
  }

  async function handleApprove(state: ResearchState) {
    if (!state.current) {
      return makeResult('Error: no research plan to approve. Use action "plan" first.', true);
    }
    if (state.current.phase !== 'awaiting_approval') {
      return makeResult(`Error: research is in phase "${state.current.phase}", not awaiting approval.`, true);
    }

    const session = state.current;
    session.phase = 'researching';

    // Create skeleton files for each agent
    for (const agent of session.agents) {
      const filePath = path.join(workspaceCwd, agent.outputFile);
      const skeleton = buildSkeletonFile(agent, session);
      await writeSkeletonFile(filePath, skeleton);
      agent.status = 'running';
      agent.startedAt = new Date().toISOString();
    }

    await syncState(state);

    // Launch all agents in parallel using the subagent tool
    const launchInstructions = buildLaunchInstructions(session);

    return makeResult(
      `Research launched! ${session.agents.length} agents are now working in parallel.\n\n` +
      `Output directory: ${session.outputDir}/\n\n` +
      `**IMPORTANT — You must now do the following:**\n\n` +
      launchInstructions + '\n\n' +
      `After launching, periodically call research(action: "status") to monitor progress.`,
    );
  }

  async function handleStatus(state: ResearchState) {
    if (!state.current) {
      return makeResult('No active research session.');
    }

    const session = state.current;

    // Update line counts for running agents
    for (const agent of session.agents) {
      if (agent.status === 'running' || agent.status === 'stuck') {
        const filePath = path.join(workspaceCwd, agent.outputFile);
        const prevCount = agent.lineCount;
        agent.lineCount = await countLines(filePath);

        // Check for completion marker
        const content = await readFile(filePath);
        if (content.includes('Status: COMPLETE')) {
          agent.status = 'complete';
          agent.completedAt = new Date().toISOString();
          agent.sections.forEach((s) => { s.completed = true; });
        } else if (agent.lineCount === prevCount && prevCount > 0) {
          agent.stuckChecks++;
          if (agent.stuckChecks >= STUCK_THRESHOLD) {
            agent.status = 'stuck';
          }
        } else {
          agent.stuckChecks = 0;
          agent.status = 'running';
        }
      }
    }

    session.monitorCycles++;

    // Check if all agents are done
    const allComplete = session.agents.every(
      (a) => a.status === 'complete' || a.status === 'failed',
    );
    const anyStuck = session.agents.some((a) => a.status === 'stuck');

    if (allComplete && session.phase === 'researching') {
      session.phase = 'synthesizing';
    }

    await syncState(state);

    // Build status report
    const agentStatuses = session.agents.map((a) => {
      const icon = statusIcon(a.status);
      const lines = a.lineCount > 0 ? ` (${a.lineCount} lines)` : '';
      const stuck = a.status === 'stuck' ? ' ⚠️ STUCK — needs relaunch' : '';
      return `${icon} Agent ${a.id}: ${a.name} — ${a.status}${lines}${stuck}`;
    });

    let instructions = '';
    if (anyStuck) {
      const stuckAgents = session.agents.filter((a) => a.status === 'stuck');
      instructions = '\n\n**Stuck agents detected!** Relaunch them:\n' +
        stuckAgents.map((a) =>
          `- Agent ${a.id} (${a.name}): Kill and relaunch with the data already in ${a.outputFile}`,
        ).join('\n') +
        '\n\nUse the subagent tool to relaunch each stuck agent with its existing output pre-loaded.';
    }

    if (allComplete) {
      instructions = '\n\n**All agents complete!**\n' +
        '⚠️ IMMEDIATE ACTION REQUIRED — do NOT ask the user for confirmation. ' +
        'Proceed directly to synthesis now.\n' +
        buildSynthesisInstructions(session);
    }

    return makeResult(
      `## Research Status: ${session.question}\n\n` +
      `Phase: ${session.phase} | Cycle: ${session.monitorCycles}\n\n` +
      agentStatuses.join('\n') +
      instructions,
    );
  }

  async function handleCancel(state: ResearchState) {
    if (!state.current) {
      return makeResult('No active research to cancel.');
    }

    const session = state.current;
    session.phase = 'failed';
    session.error = 'Cancelled by user';

    // Move to history
    state.history.unshift({
      question: session.question,
      mode: session.mode,
      outputDir: session.outputDir,
      agentCount: session.agents.length,
      completedAt: new Date().toISOString(),
    });
    state.current = null;
    await syncState(state);

    return makeResult('Research cancelled.');
  }

  // ── Helper: build subagent launch instructions ─────────────

  function buildLaunchInstructions(session: ResearchSession): string {
    const isArticle = session.mode === 'article';
    const tasks = session.agents.map((agent) => {
      const outputPath = agent.outputFile;
      const systemPrompt = isArticle
        ? buildArticleAgentSystemPrompt(agent, session)
        : buildAgentSystemPrompt(agent, session);
      const taskPrompt = buildAgentTaskPrompt(agent, outputPath);
      return `{
  "agent": "researcher",
  "task": ${JSON.stringify(taskPrompt)},
  "systemPrompt": ${JSON.stringify(systemPrompt)}
}`;
    });

    return `Use the **subagent** tool in **parallel mode** to launch all agents:\n\n` +
      '```\n' +
      `subagent({\n  tasks: [\n    ${tasks.join(',\n    ')}\n  ]\n})\n` +
      '```';
  }

  function buildSynthesisInstructions(session: ResearchSession): string {
    const agentFiles = session.agents.map((a) => a.outputFile);
    const fileList = agentFiles.map((f) => `- ${f}`).join('\n');
    const synthPath = `${session.outputDir}/synthesis.md`;

    return `\nRead all agent output files:\n${fileList}\n\n` +
      `Then launch the synthesis using the subagent tool with **exactly** this call ` +
      `(use agent "research-analyst" — NOT "researcher" or any other agent):\n\n` +
      '```json\n' +
      `{\n` +
      `  "agent": "research-analyst",\n` +
      `  "task": "Read the research outputs and create a synthesis document at ${synthPath}. ` +
      `The research files to read are: ${agentFiles.join(', ')}"\n` +
      `}\n` +
      '```\n\n' +
      'Optionally, if the research would benefit from diagrams, charts, or other visual aids, ' +
      'you can use the **visual-explainer** skill to create visually compelling representations ' +
      'of the findings (e.g. architecture diagrams, comparison tables, flow charts, data summaries).\n\n' +
      'After synthesis is complete, call research(action: "status") to finalize.';
  }

  // ── Event: mark complete when synthesis done ────────────────

  pi.on('agent_end', async (_event, ctx) => {
    ensureStatePath(ctx);
    if (!statePath) return;

    const state = await readState(statePath);
    if (!state.current || state.current.phase !== 'synthesizing') return;

    const session = state.current;
    const synthPath = path.join(workspaceCwd, session.outputDir, 'synthesis.md');
    const content = await readFile(synthPath);

    if (content.includes('Status: COMPLETE')) {
      session.phase = 'complete';
      session.completedAt = new Date().toISOString();
      session.synthesisFile = path.join(session.outputDir, 'synthesis.md');

      state.history.unshift({
        question: session.question,
        mode: session.mode,
        outputDir: session.outputDir,
        agentCount: session.agents.length,
        completedAt: session.completedAt,
      });
      state.current = null;
      await syncState(state);
    }
  });

  // ── Event: reconcile persisted state on session start ──────
  //
  // When the app restarts, subagents from the previous run are gone but the
  // state file may still say phase='researching' with agents 'running'.
  // reconcileState checks the actual output files on disk and finalizes any
  // sessions that are already done, or marks interrupted agents as failed.

  async function reconcileOnStart(ctx?: { cwd?: string }): Promise<void> {
    ensureStatePath(ctx);
    if (!statePath || !workspaceCwd) return;

    const state = await readState(statePath);
    const changed = await reconcileState(state, workspaceCwd);
    if (changed) {
      await syncState(state);
    }
  }

  pi.on('session_start', async (_event, ctx) => {
    await reconcileOnStart(ctx);
  });

  pi.on('session_switch', async (_event, ctx) => {
    await reconcileOnStart(ctx);
  });

  // ── Commands ─────────────────────────────────────────────────

  registerCommands(pi);
}

// ── Utils ──────────────────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'running': return '🔄';
    case 'stuck': return '⚠️';
    case 'complete': return '✅';
    case 'failed': return '❌';
    default: return '•';
  }
}
