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

/**
 * The accounting a resumed or forked session re-reads from history.
 *
 * These five fields are the only ones with a reader: `history.ts` seeds session
 * metrics from them. Everything else that used to live here - the category, the
 * rule, the truncation flag and the full bound command - had no consumer, and
 * was written into every result's session entry.
 */
interface MetadataInput {
  applied: boolean;
  inputBytes: number;
  compactedBytes: number;
  measured: boolean;
  unmeasured?: boolean;
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
  const record = withoutRedundantStreams(details);
  if (keepCaptureReport) return finish(content, notices, record);
  return finish(removeBlock(content, readReportIndex(record)), notices, withoutReportBlock(record));
}

/**
 * Drop a capture stream that holds the same bytes as the combined file.
 *
 * The plugin reads the record before this runs, so the structured path still
 * sees stdout. Removing the duplicate afterwards keeps the same bytes out of
 * the persisted session entry, the debug log and the IPC payload to the UI.
 */
function withoutRedundantStreams(details: Record<string, unknown>): Record<string, unknown> {
  const capture = details.capture;
  if (typeof capture !== 'object' || capture === null) return details;
  const record = capture as Record<string, unknown>;
  const combined = record.combined;
  if (typeof combined !== 'object' || combined === null) return details;
  const combinedBytes = (combined as { bytes?: unknown }).bytes;
  if (typeof combinedBytes !== 'number') return details;

  let dropped = false;
  const kept = Object.entries(record).filter(([key, value]) => {
    if (key !== 'stdout' && key !== 'stderr') return true;
    if (typeof value !== 'object' || value === null) return true;
    if ((value as { bytes?: unknown }).bytes !== combinedBytes) return true;
    dropped = true;
    return false;
  });
  return dropped ? { ...details, capture: Object.fromEntries(kept) } : details;
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

  try {
    if (requestsStructuredOutput(analyzeCommand(requestedCommand))) {
      return await optimizeStructured({
        content, notices, payloadIndex, capture, metrics, details, readCapture,
        rawDetails, receivedPayload,
      });
    }

    const category = detectCategory(requestedCommand);
    if (category === 'none' || !capture || !capture.complete || !capture.combined) {
      const flags = accountUnchanged(metrics, capture, rawDetails);
      details.optimization = optimizationDetails({
        applied: false, ...flags,
      });
      // The payload was not replaced, so the model has all of the output unless
      // the bash tool truncated it or the capture itself is unusable.
      const keepCaptureReport = details.truncation !== undefined || capture?.complete !== true;
      return finalize({ content, notices, details, keepCaptureReport });
    }

    return await compactComplete({
      content, notices, payloadIndex, capture, category, metrics, config, details, readCapture,
      rawDetails, receivedPayload,
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
}

async function optimizeStructured(args: StructuredArgs): Promise<OptimizeOutput> {
  const { content, notices, payloadIndex, capture, metrics, details, readCapture, rawDetails, receivedPayload } = args;
  const read = capture?.complete ? await safeRead(readCapture, capture.stdout) : null;

  if (!read || !capture?.stdout || !capture?.combined) {
    const flags = accountUnreadable(metrics, rawDetails);
    details.optimization = optimizationDetails({
      applied: false, ...flags,
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
    applied: false, measured: true,
    inputBytes: capture.combined.bytes, compactedBytes: capture.combined.bytes,
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
}

async function compactComplete(args: CompactArgs): Promise<OptimizeOutput> {
  const { content, notices, payloadIndex, capture, category, metrics, config, details, readCapture, rawDetails, receivedPayload } = args;
  const combined = capture.combined;
  const read = await safeRead(readCapture, combined);

  if (!read || !combined) {
    const flags = accountUnreadable(metrics, rawDetails);
    details.optimization = optimizationDetails({
      applied: false, ...flags,
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
      applied: false, measured: true, inputBytes: read.bytes, compactedBytes: read.bytes,
    });
    return finalize({ content, notices, details, keepCaptureReport: true });
  }

  metrics.recordMeasured(read.bytes, outcome.candidateBytes, outcome.changed);

  const nextContent = replaceBlock(content, payloadIndex, outcome.preview.content || '(no output)');
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
    applied: outcome.changed, measured: true,
    inputBytes: read.bytes, compactedBytes: outcome.candidateBytes,
  });
  // Nothing was omitted exactly when the rule changed nothing and the preview
  // carried the whole candidate.
  const keepCaptureReport = outcome.changed || outcome.preview.truncated;
  return finalize({ content: nextContent, notices, details, keepCaptureReport });
}
