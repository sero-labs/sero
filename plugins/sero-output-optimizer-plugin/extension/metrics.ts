import { emptySessionSavings, type SessionSavings } from '../shared/types';

/**
 * Session compaction accounting.
 *
 * The baseline is the complete captured executed-command output, after RTK
 * filtering and before presentation limits. Every eligible call with a
 * complete capture enters the totals, including unchanged calls.
 */
export class SessionMetrics {
  private savings: SessionSavings = emptySessionSavings();

  recordMeasured(inputBytes: number, compactedBytes: number, optimized: boolean): void {
    this.savings.measuredCalls += 1;
    this.savings.inputBytes += Math.max(0, inputBytes);
    this.savings.compactedBytes += Math.max(0, compactedBytes);
    if (optimized) this.savings.optimizedCalls += 1;
  }

  recordUnmeasured(): void {
    this.savings.unmeasuredCalls += 1;
  }

  recordSkip(): void {
    this.savings.skippedCalls += 1;
  }

  snapshot(): SessionSavings {
    return { ...this.savings };
  }
}
