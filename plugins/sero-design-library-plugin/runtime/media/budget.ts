import type { MediaCapability, MediaProvenance } from '../../shared/media';
import { needsConfirmation } from '../../shared/media';

/**
 * Spend protection for one run (spec §8.4, D10).
 *
 * Three things, all cheap and all necessary once the *agent* can call media
 * generation on its own inside a multi-variant run: a call cap, a mandatory
 * confirmation for video, and a running total of what was reported.
 *
 * The cap stops further calls and says so; it never fails the run. A design that
 * generated three of the four images it wanted is a design, and throwing the
 * whole page away over the fourth would cost more than it saved.
 */

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: string; kind: 'cap' | 'declined' };

export interface MediaBudgetOptions {
  /** Maximum calls this run may make. Zero disables media for the run entirely. */
  callsPerRun: number;
  /**
   * Calls this run already made before it was interrupted (D10).
   *
   * The budget is an in-memory object built when a run starts, so without this
   * a generation that spent its whole allowance and was then interrupted would
   * come back with the whole allowance again — the cap would bound a *process*
   * rather than a run, which is not what was configured.
   */
  alreadyUsed?: number;
  /**
   * Called when a slot is taken, so the count can be made durable.
   *
   * Awaited before the provider is called, so a crash during the call counts
   * against the run rather than being forgotten.
   */
  onClaimed?(used: number): Promise<void>;
  /**
   * Asks the user to approve a video generation. Video always confirms,
   * including when the agent requested it — that is the whole point of D10.
   */
  confirmVideo(request: {
    prompt: string;
    model: string;
    /**
     * Seconds of footage, when the caller asked for a specific length.
     *
     * Named separately because it is the price: providers bill video by the
     * second, so approving "a video" without knowing whether it is four seconds
     * or sixty is approving an unknown amount of money.
     */
    durationSeconds?: number;
  }): Promise<boolean>;
}

export class MediaBudget {
  /**
   * Slots taken, including video reservations still awaiting an answer. This is
   * what the cap is checked against, so an unanswered confirmation cannot be
   * overtaken by another call.
   */
  private claimed: number;
  /**
   * Slots that were actually granted. This is what is made durable — persisting
   * `claimed` would write a reservation that is still only a question, and a
   * crash while the dialog was open would count a video nobody approved.
   */
  private granted: number;
  private costUsd = 0;
  private capHit = false;

  constructor(private readonly options: MediaBudgetOptions) {
    this.claimed = options.alreadyUsed ?? 0;
    this.granted = this.claimed;
  }

  /** Calls started, whether they succeeded or not. */
  get callsUsed(): number {
    return this.claimed;
  }

  get callsRemaining(): number {
    return Math.max(0, this.options.callsPerRun - this.claimed);
  }

  /** Reported cost across the run. Absent provider costs contribute nothing. */
  get reportedCostUsd(): number {
    return this.costUsd;
  }

  /** True once a call was refused for want of budget, so the run can report it. */
  get capWasHit(): boolean {
    return this.capHit;
  }

  /**
   * Take a slot for one call, confirming first if the capability needs it.
   *
   * The slot is taken whether or not the call goes on to succeed. Refunding a
   * failure sounds fairer and is not: a provider failing repeatedly is exactly
   * the case where an agent retries in a loop, and a cap that only counts
   * successes does not bound that at all.
   */
  async claim(
    capability: MediaCapability,
    describe: { prompt: string; model: string; durationSeconds?: number },
  ): Promise<BudgetDecision> {
    if (this.claimed >= this.options.callsPerRun) {
      this.capHit = true;
      return {
        allowed: false,
        kind: 'cap',
        reason:
          this.options.callsPerRun === 0
            ? 'Media generation is switched off for this run — the per-run call limit is zero. Finish the design without generated artwork.'
            : `This run has already used its ${this.options.callsPerRun} media generation${this.options.callsPerRun === 1 ? '' : 's'}. Finish the design with the artwork you already have; the limit is in Design Library settings.`,
      };
    }

    // The slot is taken *before* the confirmation is awaited, and given back if
    // the answer is no.
    //
    // Checking and then incrementing across an await is a hole big enough to
    // drive the whole cap through: a model can call two tools at once, and both
    // read the same `claimed` before either writes it. Awaiting a confirmation
    // dialog holds that window open for as long as the user takes to answer.
    // Reserving first makes the check and the take one synchronous step, which
    // is what makes the cap mean anything under concurrency.
    this.claimed += 1;
    if (needsConfirmation(capability) && !(await this.options.confirmVideo(describe))) {
      this.claimed -= 1;
      return {
        allowed: false,
        kind: 'declined',
        reason:
          'Video generation was not approved. Carry on without it — do not ask again for this design.',
      };
    }

    // Made durable before the caller goes on to spend, so an interrupted run
    // resumes knowing what it has already used.
    this.granted += 1;
    await this.options.onClaimed?.(this.granted);
    return { allowed: true };
  }

  /** Record what a completed call reported, for the tray's running total. */
  record(provenance: MediaProvenance): void {
    this.costUsd += provenance.costUsd ?? 0;
  }

  /**
   * A sentence for the run's own report, or null when nothing needs saying.
   *
   * Surfaced rather than swallowed: a design that quietly stopped generating
   * artwork half way through looks like a model that lost interest, and the
   * difference matters when the user is deciding whether to retry.
   */
  summary(): string | null {
    if (!this.capHit) return null;
    return `The per-run media limit of ${this.options.callsPerRun} was reached, so later generation requests were refused.`;
  }
}

/**
 * The confirmation prompt itself.
 *
 * Separated from the budget so the budget stays testable without a host: every
 * test drives `confirmVideo` directly, and only this function knows what the
 * dialog says.
 */
export interface VideoConfirmationHost {
  requestChoice(options: {
    title: string;
    body: string;
    choices: { id: string; label: string; emphasis?: 'primary' }[];
    timeoutMs: number;
  }): Promise<{ choiceId: string | null; timedOut: boolean }>;
}

const CONFIRMATION_TIMEOUT_MS = 120_000;

export function createVideoConfirmer(
  host: VideoConfirmationHost,
  context: { designTitle?: string } = {},
): MediaBudgetOptions['confirmVideo'] {
  return async ({ prompt, model, durationSeconds }) => {
    const outcome = await host.requestChoice({
      title: 'Generate a video?',
      body: [
        context.designTitle === undefined ? null : `Design: ${context.designTitle}`,
        `Model: ${model}`,
        // Providers bill video by the second, so the length is the number the
        // user is really being asked to approve. It is stated either way: when
        // the model could not be asked what lengths it takes, saying so is
        // honest, where leaving the line out reads as though length were not
        // part of the price.
        durationSeconds === undefined
          ? "Length: this model's own default — it could not be asked"
          : `Length: ${durationSeconds} seconds`,
        `Prompt: ${prompt}`,
        'Video generation is the most expensive capability, so it always asks first.',
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
      choices: [
        { id: 'generate', label: 'Generate video', emphasis: 'primary' },
        { id: 'skip', label: 'Skip' },
      ],
      timeoutMs: CONFIRMATION_TIMEOUT_MS,
    });
    // Silence is a no. A prompt nobody answered — because the app is in the
    // background, or the user walked away — must not become approval to spend.
    return outcome.choiceId === 'generate';
  };
}
