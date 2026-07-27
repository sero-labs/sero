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
   * Asks the user to approve a video generation. Video always confirms,
   * including when the agent requested it — that is the whole point of D10.
   */
  confirmVideo(request: { prompt: string; model: string }): Promise<boolean>;
}

export class MediaBudget {
  private claimed = 0;
  private costUsd = 0;
  private capHit = false;

  constructor(private readonly options: MediaBudgetOptions) {}

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
  async claim(capability: MediaCapability, describe: { prompt: string; model: string }): Promise<BudgetDecision> {
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

    // Confirmation happens before the slot is taken, so declining costs nothing
    // and a user who says no to one video is not charged a call for it.
    if (needsConfirmation(capability) && !(await this.options.confirmVideo(describe))) {
      return {
        allowed: false,
        kind: 'declined',
        reason:
          'Video generation was not approved. Carry on without it — do not ask again for this design.',
      };
    }

    this.claimed += 1;
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
  return async ({ prompt, model }) => {
    const outcome = await host.requestChoice({
      title: 'Generate a video?',
      body: [
        context.designTitle === undefined ? null : `Design: ${context.designTitle}`,
        `Model: ${model}`,
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
