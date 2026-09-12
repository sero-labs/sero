import type { OutputOptimizerConfig } from '../shared/types';
import { analyzeCommand, requestsStructuredOutput } from './command-analysis';
import { detectCategory } from './compaction/category';
import { compactCapture } from './compaction';
import { buildPreview, incompleteStructuredPreview, PREVIEW_MAX_BYTES, PREVIEW_MAX_LINES } from './preview';
import { isConfirmedZeroOutput, parseCaptureRecord, readCaptureContent, type CaptureContent, type CaptureRecord, type CaptureStream } from './capture';
import { renderOmissionNotice, renderOptimizationNotice, renderRewriteNotice } from './report';
import { appendBlocks, readPayloadIndex, replaceBlock, type TextBlock } from './result';
import type { SessionMetrics } from './metrics';
import type { OutputCategory } from './compaction/category';

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

function optimizationDetails(input: {
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
}): Record<string, unknown> {
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
  const capture = parseCaptureRecord(rawDetails);
  const details = {
    ...(typeof rawDetails === 'object' && rawDetails !== null ? rawDetails : {}),
  } as Record<string, unknown>;

  try {
    if (requestsStructuredOutput(analyzeCommand(requestedCommand))) {
      return await optimizeStructured({ content, notices, payloadIndex, capture, metrics, rewrite, details, readCapture });
    }

    const category = detectCategory(requestedCommand);
    if (category === 'none') {
      const flags = accountUnchanged(metrics, capture, rawDetails);
      details.optimization = optimizationDetails({
        category, rule: null, applied: false, truncated: false, ...flags,
        ...(rewrite ? { requested: rewrite.requested, executed: rewrite.executed } : {}),
      });
      return finish(content, notices, details);
    }

    if (!capture || !capture.complete || !capture.combined) {
      const flags = accountUnchanged(metrics, capture, rawDetails);
      details.optimization = optimizationDetails({
        category, rule: null, applied: false, truncated: false, ...flags,
        ...(rewrite ? { requested: rewrite.requested, executed: rewrite.executed } : {}),
      });
      return finish(content, notices, details);
    }

    return await compactComplete({
      content, notices, payloadIndex, capture, category, metrics, config, rewrite, details, readCapture,
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
  rewrite?: { requested: string; executed: string };
  details: Record<string, unknown>;
  readCapture: (stream: CaptureStream) => Promise<CaptureContent | null>;
}

async function optimizeStructured(args: StructuredArgs): Promise<OptimizeOutput> {
  const { content, notices, payloadIndex, capture, metrics, rewrite, details, readCapture } = args;
  const read = capture?.complete ? await safeRead(readCapture, capture.stdout) : null;
  const base = rewrite ? { requested: rewrite.requested, executed: rewrite.executed } : {};

  if (!read || !capture?.stdout || !capture?.combined) {
    metrics.recordUnmeasured();
    details.optimization = optimizationDetails({
      category: 'structured', rule: null, applied: false, inputBytes: 0, compactedBytes: 0,
      measured: false, unmeasured: true, truncated: false, ...base,
    });
    return finish(content, notices, details);
  }

  metrics.recordMeasured(capture.combined.bytes, capture.combined.bytes, false);
  const preview = buildPreview(read.text, PREVIEW_MAX_LINES, PREVIEW_MAX_BYTES);
  const payload = preview.truncated
    ? incompleteStructuredPreview(preview.content, read.bytes)
    : read.text;
  const nextContent = appendBlocks(replaceBlock(content, payloadIndex, payload), notices);

  details.optimization = optimizationDetails({
    category: 'structured', rule: null, applied: false,
    inputBytes: capture.combined.bytes, compactedBytes: capture.combined.bytes,
    measured: true, truncated: preview.truncated, ...base,
  });
  return { content: nextContent, details };
}

interface CompactArgs {
  content: TextBlock[];
  notices: string[];
  payloadIndex: number;
  capture: CaptureRecord;
  category: OutputCategory;
  metrics: SessionMetrics;
  config: OutputOptimizerConfig;
  rewrite?: { requested: string; executed: string };
  details: Record<string, unknown>;
  readCapture: (stream: CaptureStream) => Promise<CaptureContent | null>;
}

async function compactComplete(args: CompactArgs): Promise<OptimizeOutput> {
  const { content, notices, payloadIndex, capture, category, metrics, config, rewrite, details, readCapture } = args;
  const combined = capture.combined;
  const read = await safeRead(readCapture, combined);
  const base = rewrite ? { requested: rewrite.requested, executed: rewrite.executed } : {};

  if (!read || !combined) {
    metrics.recordUnmeasured();
    details.optimization = optimizationDetails({
      category, rule: null, applied: false, inputBytes: 0, compactedBytes: 0,
      measured: false, unmeasured: true, truncated: false, ...base,
    });
    return finish(content, notices, details);
  }

  let outcome: ReturnType<typeof compactCapture>;
  try {
    outcome = compactCapture(read.text, category);
  } catch {
    // A throwing rule keeps the received payload and records no savings.
    metrics.recordMeasured(read.bytes, read.bytes, false);
    details.optimization = optimizationDetails({
      category, rule: null, applied: false, inputBytes: read.bytes, compactedBytes: read.bytes,
      measured: true, truncated: false, ...base,
    });
    return finish(content, notices, details);
  }
  const compactedBytes = Buffer.byteLength(outcome.candidate, 'utf8');
  metrics.recordMeasured(read.bytes, compactedBytes, outcome.changed);

  const preview = buildPreview(outcome.candidate, PREVIEW_MAX_LINES, PREVIEW_MAX_BYTES);
  let nextContent = replaceBlock(content, payloadIndex, preview.content || '(no output)');
  if (preview.truncated) notices.push(renderOmissionNotice(preview));
  if (config.notices) {
    notices.push(renderOptimizationNotice({
      category, rule: outcome.rule, inputBytes: read.bytes, compactedBytes, changed: outcome.changed,
    }));
  }
  nextContent = appendBlocks(nextContent, notices);

  details.optimization = optimizationDetails({
    category, rule: outcome.rule ?? category, applied: outcome.changed,
    inputBytes: read.bytes, compactedBytes, measured: true, truncated: preview.truncated, ...base,
  });
  return { content: nextContent, details };
}
