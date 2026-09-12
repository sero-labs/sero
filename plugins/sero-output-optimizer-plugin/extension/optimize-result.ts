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
import { appendBlocks, readPayloadIndex, replaceBlock, type TextBlock } from './result';
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
  rewrite?: { requested: string; executed: string };
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
  if (rewrite) notices.push(renderRewriteNotice(rewrite.requested, rewrite.executed));

  const payloadIndex = readPayloadIndex(rawDetails);
  const receivedPayload = content[payloadIndex]?.text ?? '';
  const capture = parseCaptureRecord(rawDetails);
  const details = {
    ...(typeof rawDetails === 'object' && rawDetails !== null ? rawDetails : {}),
  } as Record<string, unknown>;

  // The single-command bypass skips rewriting (handled earlier) and compaction.
  if (hasBypassMarker(requestedCommand)) {
    return finish(content, notices, details);
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
      return finish(content, notices, details);
    }

    return await compactComplete({
      content, notices, payloadIndex, capture, category, metrics, config, details, readCapture,
      rawDetails, receivedPayload, base,
    });
  } catch {
    // Fail open: keep the received payload and the reports already collected.
    return finish(content, notices, details);
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
    return finish(content, notices, details);
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
  return finish(nextContent, notices, details);
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
    return finish(content, notices, details);
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
    return finish(content, notices, details);
  }

  metrics.recordMeasured(read.bytes, outcome.candidateBytes, outcome.changed);

  let nextContent = replaceBlock(content, payloadIndex, outcome.preview.content || '(no output)');
  const status = statusNotice(rawDetails, receivedPayload);
  if (status) notices.push(status);
  if (outcome.preview.truncated) notices.push(renderOmissionNotice(outcome.preview));
  if (config.notices) {
    notices.push(renderOptimizationNotice({
      category, rule: outcome.rule, inputBytes: read.bytes,
      compactedBytes: outcome.candidateBytes, changed: outcome.changed,
    }));
  }
  nextContent = appendBlocks(nextContent, notices);

  details.optimization = optimizationDetails({
    category, rule: outcome.rule ?? category, applied: outcome.changed,
    inputBytes: read.bytes, compactedBytes: outcome.candidateBytes,
    measured: true, truncated: outcome.preview.truncated, ...base,
  });
  return { content: nextContent, details };
}
