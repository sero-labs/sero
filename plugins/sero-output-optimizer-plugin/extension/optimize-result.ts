import type { OutputOptimizerConfig } from '../shared/types';
import { analyzeCommand, hasBypassMarker, requestsStructuredOutput } from './command-analysis';
import { detectCategory, type OutputCategory } from './compaction/category';
import { compactStream } from './compaction';
import { buildPreview, PREVIEW_MAX_BYTES, PREVIEW_MAX_LINES } from './preview';
import { isConfirmedZeroOutput, parseCaptureRecord, readCaptureContent, type CaptureContent, type CaptureRecord, type CaptureStream } from './capture';
import {
  renderIncompleteStructuredNotice,
  renderOmissionNotice,
  renderOptimizationNotice,
  renderRewriteNotice,
  statusNotice,
} from './report';
import { appendBlocks, readPayloadIndex, readReportIndex, removeBlock, replaceBlock, type TextBlock } from './result';
import type { SessionMetrics } from './metrics';

/**
 * The compaction half of the `tool_result` hook, extracted so every fail-open
 * path is directly testable. It never throws: a failure returns the received
 * payload with the reports it was given.
 */

export interface OptimizeInput {
  content: TextBlock[];
  details: unknown;
  requestedCommand: string;
  rewrite?: { requested: string; executed: string; display?: string };
  config: OutputOptimizerConfig;
  metrics: SessionMetrics;
  /** Read one complete capture stream. Injectable for tests. */
  readCapture?: (stream: CaptureStream) => Promise<CaptureContent | null>;
}

export interface OptimizeOutput {
  content: TextBlock[];
  details: unknown;
}

interface MetadataInput {
  category: string;
  rule: string | null;
  applied: boolean;
  inputBytes: number;
  compactedBytes: number;
  measured: boolean;
  unmeasured?: boolean;
  truncated: boolean;
  requested?: string;
  executed?: string;
}

function optimizationDetails(input: MetadataInput): Record<string, unknown> {
  return { ...input };
}

function finish(
  content: TextBlock[],
  notices: string[],
  details: Record<string, unknown>,
): OptimizeOutput {
  return { content: notices.length > 0 ? appendBlocks(content, notices) : content, details };
}

interface FinalizeInput {
  content: TextBlock[];
  notices: string[];
  details: Record<string, unknown>;
  /**
   * True when the model payload leaves out captured bytes, so the bash tool's
   * capture report still points at something the model cannot see.
   *
   * When the payload already carries the complete output, the report costs more
   * context than the output it describes, so the plugin drops that block. The
   * capture stays reachable from the result details in the UI.
   */
  keepCaptureReport: boolean;
}

function finalize({ content, notices, details, keepCaptureReport }: FinalizeInput): OptimizeOutput {
  if (keepCaptureReport) return finish(content, notices, details);
  return finish(removeBlock(content, readReportIndex(details)), notices, withoutReportBlock(details));
}

/** Mirror the host's no-report shape: keep `blocks.payload`, drop `blocks.report`. */
function withoutReportBlock(details: Record<string, unknown>): Record<string, unknown> {
  const blocks = details.blocks;
  if (typeof blocks !== 'object' || blocks === null) return details;
  const rest = Object.fromEntries(
    Object.entries(blocks as Record<string, unknown>).filter(([key]) => key !== 'report'),
  );
  return { ...details, blocks: rest };
}

interface AccountFlags {
  measured: boolean;
  unmeasured: boolean;
  inputBytes: number;
  compactedBytes: number;
}

function accountUnchanged(metrics: SessionMetrics, capture: CaptureRecord | null, details: unknown): AccountFlags {
  if (isConfirmedZeroOutput(details)) {
    metrics.recordMeasured(0, 0, false);
    return { measured: true, unmeasured: false, inputBytes: 0, compactedBytes: 0 };
  }
  if (capture?.complete && capture.combined) {
    metrics.recordMeasured(capture.combined.bytes, capture.combined.bytes, false);
    return {
      measured: true,
      unmeasured: false,
      inputBytes: capture.combined.bytes,
      compactedBytes: capture.combined.bytes,
    };
  }
  metrics.recordUnmeasured();
  return { measured: false, unmeasured: true, inputBytes: 0, compactedBytes: 0 };
}

/** A capture record said complete, but its file could not be read. */
function accountUnreadable(metrics: SessionMetrics, rawDetails: unknown): AccountFlags {
  if (isConfirmedZeroOutput(rawDetails)) {
    metrics.recordMeasured(0, 0, false);
    return { measured: true, unmeasured: false, inputBytes: 0, compactedBytes: 0 };
  }
  metrics.recordUnmeasured();
  return { measured: false, unmeasured: true, inputBytes: 0, compactedBytes: 0 };
}

/** A capture read that never throws; a vanished file is an unmeasured call. */
async function safeRead(
  readCapture: (stream: CaptureStream) => Promise<CaptureContent | null>,
  stream: CaptureStream | undefined,
): Promise<CaptureContent | null> {
  if (!stream) return null;
  try {
    return await readCapture(stream);
  } catch {
    return null;
  }
}

export async function optimizeResult(input: OptimizeInput): Promise<OptimizeOutput> {
  const { content, details: rawDetails, requestedCommand, rewrite, config, metrics } = input;
  const readCapture = input.readCapture ?? readCaptureContent;
  const notices: string[] = [];
  if (rewrite) notices.push(renderRewriteNotice(rewrite.requested, rewrite.executed, rewrite.display));

  const payloadIndex = readPayloadIndex(rawDetails);
  const receivedPayload = content[payloadIndex]?.text ?? '';
  const capture = parseCaptureRecord(rawDetails);
  const details = {
    ...(typeof rawDetails === 'object' && rawDetails !== null ? rawDetails : {}),
  } as Record<string, unknown>;

  // The single-command bypass skips rewriting (handled earlier) and compaction.
  // It also leaves the host result untouched, including the capture report.
  if (hasBypassMarker(requestedCommand)) {
    return finalize({ content, notices, details, keepCaptureReport: true });
  }

  const base = rewrite ? { requested: rewrite.requested, executed: rewrite.executed } : {};

  try {
    if (requestsStructuredOutput(analyzeCommand(requestedCommand))) {
      return await optimizeStructured({
        content, notices, payloadIndex, capture, metrics, details, readCapture,
        rawDetails, receivedPayload, base,
      });
    }

    const category = detectCategory(requestedCommand);
    if (category === 'none' || !capture || !capture.complete || !capture.combined) {
      const flags = accountUnchanged(metrics, capture, rawDetails);
      details.optimization = optimizationDetails({
        category, rule: null, applied: false, truncated: false, ...flags, ...base,
      });
      // The payload was not replaced, so the model has all of the output unless
      // the bash tool truncated it or the capture itself is unusable.
      const keepCaptureReport = details.truncation !== undefined || capture?.complete !== true;
      return finalize({ content, notices, details, keepCaptureReport });
    }

    return await compactComplete({
      content, notices, payloadIndex, capture, category, metrics, config, details, readCapture,
      rawDetails, receivedPayload, base,
    });
  } catch {
    // Fail open: keep the received payload and the reports already collected.
    return finalize({ content, notices, details, keepCaptureReport: true });
  }
}

interface StructuredArgs {
  content: TextBlock[];
  notices: string[];
  payloadIndex: number;
  capture: CaptureRecord | null;
  metrics: SessionMetrics;
  details: Record<string, unknown>;
  readCapture: (stream: CaptureStream) => Promise<CaptureContent | null>;
  rawDetails: unknown;
  receivedPayload: string;
  base: { requested?: string; executed?: string };
}

async function optimizeStructured(args: StructuredArgs): Promise<OptimizeOutput> {
  const { content, notices, payloadIndex, capture, metrics, details, readCapture, rawDetails, receivedPayload, base } = args;
  const read = capture?.complete ? await safeRead(readCapture, capture.stdout) : null;

  if (!read || !capture?.stdout || !capture?.combined) {
    const flags = accountUnreadable(metrics, rawDetails);
    details.optimization = optimizationDetails({
      category: 'structured', rule: null, applied: false, truncated: false, ...flags, ...base,
    });
    return finalize({ content, notices, details, keepCaptureReport: true });
  }

  metrics.recordMeasured(capture.combined.bytes, capture.combined.bytes, false);
  const preview = buildPreview(read.text, PREVIEW_MAX_LINES, PREVIEW_MAX_BYTES);
  // The payload is exactly stdout when it fits, and a bounded preview when it
  // does not. Reporting text stays in its own blocks.
  const payload = preview.truncated ? preview.content : read.text;
  const nextContent = replaceBlock(content, payloadIndex, payload);

  const status = statusNotice(rawDetails, receivedPayload);
  if (status) notices.push(status);
  if (preview.truncated) notices.push(renderIncompleteStructuredNotice(read.bytes));

  details.optimization = optimizationDetails({
    category: 'structured', rule: null, applied: false,
    inputBytes: capture.combined.bytes, compactedBytes: capture.combined.bytes,
    measured: true, truncated: preview.truncated, ...base,
  });
  // The payload is stdout alone, so the report is the only route to stderr.
  const keepCaptureReport = preview.truncated || capture.stderr !== undefined;
  return finalize({ content: nextContent, notices, details, keepCaptureReport });
}

interface CompactArgs {
  content: TextBlock[];
  notices: string[];
  payloadIndex: number;
  capture: CaptureRecord;
  category: OutputCategory;
  metrics: SessionMetrics;
  config: OutputOptimizerConfig;
  details: Record<string, unknown>;
  readCapture: (stream: CaptureStream) => Promise<CaptureContent | null>;
  rawDetails: unknown;
  receivedPayload: string;
  base: { requested?: string; executed?: string };
}

async function compactComplete(args: CompactArgs): Promise<OptimizeOutput> {
  const { content, notices, payloadIndex, capture, category, metrics, config, details, readCapture, rawDetails, receivedPayload, base } = args;
  const combined = capture.combined;
  const read = await safeRead(readCapture, combined);

  if (!read || !combined) {
    const flags = accountUnreadable(metrics, rawDetails);
    details.optimization = optimizationDetails({
      category, rule: null, applied: false, truncated: false, ...flags, ...base,
    });
    return finalize({ content, notices, details, keepCaptureReport: true });
  }

  let outcome: ReturnType<typeof compactStream>;
  try {
    outcome = compactStream(read.text, category, { maxLines: PREVIEW_MAX_LINES, maxBytes: PREVIEW_MAX_BYTES });
  } catch {
    // A throwing rule keeps the received payload and records no savings.
    metrics.recordMeasured(read.bytes, read.bytes, false);
    details.optimization = optimizationDetails({
      category, rule: null, applied: false, inputBytes: read.bytes, compactedBytes: read.bytes,
      measured: true, truncated: false, ...base,
    });
    return finalize({ content, notices, details, keepCaptureReport: true });
  }

  metrics.recordMeasured(read.bytes, outcome.candidateBytes, outcome.changed);

  let nextContent = replaceBlock(content, payloadIndex, outcome.preview.content || '(no output)');
  const status = statusNotice(rawDetails, receivedPayload);
  if (status) notices.push(status);
  if (outcome.preview.truncated) notices.push(renderOmissionNotice(outcome.preview));
  // An already-compact candidate tells the agent nothing it can act on, so the
  // notice is reserved for a compaction that actually omitted bytes.
  if (config.notices && outcome.changed) {
    notices.push(renderOptimizationNotice({
      category, rule: outcome.rule, inputBytes: read.bytes,
      compactedBytes: outcome.candidateBytes,
    }));
  }

  details.optimization = optimizationDetails({
    category, rule: outcome.rule ?? category, applied: outcome.changed,
    inputBytes: read.bytes, compactedBytes: outcome.candidateBytes,
    measured: true, truncated: outcome.preview.truncated, ...base,
  });
  // Nothing was omitted exactly when the rule changed nothing and the preview
  // carried the whole candidate.
  const keepCaptureReport = outcome.changed || outcome.preview.truncated;
  return finalize({ content: nextContent, notices, details, keepCaptureReport });
}
