/**
 * The stub model's scenario mode: it runs one probe's steps as consecutive
 * turns of one session. Each turn it sends one tool call, reads that call's
 * result from the next request, runs the step's `expect` and records the
 * outcome in the ledger.
 *
 * A probe stops at its first failed step. The steps after it stay out of the
 * ledger, so the ledger comparison names them as not run.
 */
import type { StubReply, StubRequest } from '../stub-model';
import { cliCommandFor, isCoreCommand } from './command-line';
import type { LedgerWriter } from './ledger';
import type { ScenarioStep, StepContext, ToolCallResult } from './types';

export interface ScenarioRun {
  /** The first user message of the session. The driver tells sessions apart by it. */
  prompt: string;
  tool: string;
  steps: ScenarioStep[];
  /** `cli` runs each step through `sero-cli`. A core command always does. */
  via: 'direct' | 'cli';
  ctx: StepContext;
  /** The full result of a call, where the site reports one. */
  readResult?: (callId: string) => Promise<ToolCallResult | undefined>;
}

export interface RunOutcome {
  passed: number;
  /** The first failure, which stopped the run. */
  failure?: string;
}

interface RunState {
  run: ScenarioRun;
  index: number;
  callId: string | null;
  startedAt: number;
  settle: (outcome: RunOutcome) => void;
  passed: number;
  done: boolean;
}

function firstUserText(request: StubRequest): string {
  return request.messages.find((message) => message.role === 'user')?.text ?? '';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A result from what the model was sent: the tool message's text, and images Pi attached after it. */
export function resultFromRequest(request: StubRequest, callId: string): ToolCallResult | undefined {
  const index = request.messages.findIndex((message) => message.role === 'tool' && message.toolCallId === callId);
  if (index === -1) return undefined;
  const images = request.messages.slice(index + 1)
    .find((message) => message.role === 'user' && message.images.length > 0)?.images ?? [];
  return { isError: null, text: request.messages[index]!.text, images };
}

export class ScenarioDriver {
  private readonly runs = new Map<string, RunState>();

  constructor(private readonly ledger: LedgerWriter) {}

  /** Registers a run. The promise settles when its session has run every step, or stopped. */
  add(run: ScenarioRun): Promise<RunOutcome> {
    if (this.runs.has(run.prompt)) throw new Error(`A run already uses the prompt ${run.prompt}`);
    return new Promise((settle) => {
      this.runs.set(run.prompt, {
        run, index: 0, callId: null, startedAt: 0, passed: 0, done: false,
        settle: (outcome) => {
          this.runs.get(run.prompt)!.done = true;
          settle(outcome);
        },
      });
    });
  }

  /** Whether this request belongs to a registered run. */
  claims(request: StubRequest): boolean {
    return this.runs.has(firstUserText(request));
  }

  async respond(request: StubRequest): Promise<StubReply> {
    const state = this.runs.get(firstUserText(request));
    if (!state) throw new Error('respond() called for a request no run claims');
    if (state.done) return { text: 'tool check finished' };
    if (state.callId === null) return this.emit(state);

    const { run } = state;
    const step = run.steps[state.index]!;
    const ms = Date.now() - state.startedAt;
    const callId = state.callId;
    const result = (await run.readResult?.(callId)) ?? resultFromRequest(request, callId);
    if (!result) return this.stop(state, step, ms, 'no result came back for the call');
    if (step.timeoutMs !== undefined && ms > step.timeoutMs) {
      return this.stop(state, step, ms, `took ${ms} ms, over the ${step.timeoutMs} ms limit`);
    }
    try {
      await step.expect(result, run.ctx);
    } catch (error) {
      return this.stop(state, step, ms, errorText(error));
    }
    this.record(state, step, ms, 'pass');
    state.passed += 1;
    state.index += 1;
    if (state.index < run.steps.length) return this.emit(state);
    state.settle({ passed: state.passed });
    return { text: 'tool check finished' };
  }

  private async emit(state: RunState): Promise<StubReply> {
    const { run } = state;
    const step = run.steps[state.index];
    if (!step) {
      state.settle({ passed: state.passed });
      return { text: 'tool check finished' };
    }
    let params;
    try {
      await step.setup?.(run.ctx);
      params = typeof step.params === 'function' ? step.params(run.ctx) : step.params;
    } catch (error) {
      return this.stop(state, step, 0, `setup failed: ${errorText(error)}`);
    }
    const callId = `tc-${state.index}-${run.prompt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
    state.callId = callId;
    state.startedAt = Date.now();
    const call = run.via === 'cli' || isCoreCommand(run.tool)
      ? { id: callId, name: 'sero-cli', arguments: { command: cliCommandFor(run.tool, params) } }
      : { id: callId, name: run.tool, arguments: params };
    return { toolCalls: [call] };
  }

  private stop(state: RunState, step: ScenarioStep, ms: number, error: string): StubReply {
    this.record(state, step, ms, 'fail', error);
    state.settle({ passed: state.passed, failure: `${step.action ?? state.run.tool}: ${error}` });
    return { text: 'tool check stopped' };
  }

  private record(state: RunState, step: ScenarioStep, ms: number, result: 'pass' | 'fail', error?: string): void {
    this.ledger.record({ site: state.run.ctx.site, tool: state.run.tool, action: step.action, result, ms, error });
  }
}
