// extract.ts — URL/file path routing and extraction orchestrator.
// HTTP extraction lives in http-extract.ts. This file handles routing
// to the correct extractor (GitHub, YouTube, video, HTTP) and frame logic.

import pLimit from "p-limit";
import { extractGitHub } from "./github-extract.js";
import { isYouTubeURL, isYouTubeEnabled, extractYouTube, extractYouTubeFrame, extractYouTubeFrames, getYouTubeStreamInfo } from "./youtube-extract.js";
import { extractWithUrlContext, extractWithGeminiWeb } from "./gemini-url-context.js";
import { isVideoFile, extractVideo, extractVideoFrame, getLocalVideoDuration } from "./video-extract.js";
import { extractViaHttp, extractWithJinaReader } from "./http-extract.js";
import { formatSeconds } from "./utils.js";

export { extractHeadingTitle } from "./http-extract.js";

const CONCURRENT_LIMIT = 3;
const NON_RECOVERABLE_ERRORS = ["Unsupported content type", "Response too large"];

const fetchLimit = pLimit(CONCURRENT_LIMIT);

function errorMessage(err: unknown): string { return err instanceof Error ? err.message : String(err); }
function isConfigParseError(err: unknown): boolean { return errorMessage(err).startsWith("Failed to parse "); }
function isAbortError(err: unknown): boolean { return errorMessage(err).toLowerCase().includes("abort"); }
function abortedResult(url: string): ExtractedContent { return { url, title: "", content: "", error: "Aborted" }; }

export interface VideoFrame { data: string; mimeType: string; timestamp: string }
export type FrameData = { data: string; mimeType: string };
export type FrameResult = FrameData | { error: string };

export interface ExtractedContent {
	url: string; title: string; content: string; error: string | null;
	thumbnail?: { data: string; mimeType: string };
	frames?: VideoFrame[];
	duration?: number;
	savedFile?: { absolutePath: string };
}

export type ExtractProgressCallback = (message: string) => void;

export interface ExtractOptions {
	timeoutMs?: number; forceClone?: boolean; prompt?: string;
	timestamp?: string; frames?: number; model?: string;
	downloadDir?: string;
	onProgress?: ExtractProgressCallback;
}

function parseTimestamp(ts: string): number | null {
	const num = Number(ts);
	if (!isNaN(num) && num >= 0) return Math.floor(num);
	const parts = ts.split(":").map(Number);
	if (parts.some(p => isNaN(p) || p < 0)) return null;
	if (parts.length === 3) return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
	if (parts.length === 2) return Math.floor(parts[0] * 60 + parts[1]);
	return null;
}

type TimestampSpec = { type: "single"; seconds: number } | { type: "range"; start: number; end: number };

function parseTimestampSpec(ts: string): TimestampSpec | null {
	const dashIdx = ts.indexOf("-", 1);
	if (dashIdx > 0) {
		const start = parseTimestamp(ts.slice(0, dashIdx));
		const end = parseTimestamp(ts.slice(dashIdx + 1));
		if (start !== null && end !== null && end > start) return { type: "range", start, end };
	}
	const seconds = parseTimestamp(ts);
	return seconds !== null ? { type: "single", seconds } : null;
}

const DEFAULT_RANGE_FRAMES = 6;
const MIN_FRAME_INTERVAL = 5;

function computeRangeTimestamps(start: number, end: number, maxFrames = DEFAULT_RANGE_FRAMES): number[] {
	if (maxFrames <= 1) return [start];
	const duration = end - start;
	const idealInterval = duration / (maxFrames - 1);
	if (idealInterval < MIN_FRAME_INTERVAL) {
		const timestamps: number[] = [];
		for (let t = start; t <= end && timestamps.length < maxFrames; t += MIN_FRAME_INTERVAL) timestamps.push(t);
		return timestamps;
	}
	return Array.from({ length: maxFrames }, (_, i) => Math.round(start + i * idealInterval));
}

function buildFrameResult(
	url: string, label: string, requestedCount: number,
	frames: VideoFrame[], error: string | null, duration?: number,
): ExtractedContent {
	if (frames.length === 0) {
		const msg = error ?? "Frame extraction failed";
		return { url, title: `Frames ${label} (0/${requestedCount})`, content: msg, error: msg };
	}
	return { url, title: `Frames ${label} (${frames.length}/${requestedCount})`, content: `${frames.length} frames extracted from ${label}`, error: null, frames, duration };
}

async function extractLocalFrames(filePath: string, timestamps: number[]): Promise<{ frames: VideoFrame[]; error: string | null }> {
	const results = await Promise.all(timestamps.map(async (t) => {
		const frame = await extractVideoFrame(filePath, t);
		if ("error" in frame) return { error: frame.error };
		return { ...frame, timestamp: formatSeconds(t) };
	}));
	const frames = results.filter((f): f is VideoFrame => "data" in f);
	const firstError = results.find((f): f is { error: string } => "error" in f);
	return { frames, error: frames.length === 0 && firstError ? firstError.error : null };
}

function safeVideoInfo(url: string): { info: ReturnType<typeof isVideoFile>; error?: string } {
	try { return { info: isVideoFile(url) }; }
	catch (err) { return { info: null, error: errorMessage(err) }; }
}

function reportProgress(options: ExtractOptions | undefined, message: string): void {
	options?.onProgress?.(message);
}

export async function extractContent(url: string, signal?: AbortSignal, options?: ExtractOptions): Promise<ExtractedContent> {
	if (signal?.aborted) return abortedResult(url);

	// Frame-only extraction (no timestamp, just frame count)
	if (options?.frames && !options.timestamp) {
		reportProgress(options, "Extracting video frames…");
		return extractFramesOnly(url, options.frames, signal);
	}

	// Timestamp-based extraction
	if (options?.timestamp) {
		reportProgress(options, "Extracting requested video frame range…");
		return extractWithTimestamp(url, options, signal);
	}

	// Video file detection
	const localVideo = safeVideoInfo(url);
	if (localVideo.error) return { url, title: "", content: "", error: localVideo.error };
	if (localVideo.info) {
		reportProgress(options, "Preparing local video for analysis…");
		try {
			const result = await extractVideo(localVideo.info, signal, options);
			if (signal?.aborted) return abortedResult(url);
			return result ?? { url, title: "", content: "", error: "Video analysis requires Gemini access." };
		} catch (err) {
			if (isAbortError(err)) return abortedResult(url);
			return { url, title: "", content: "", error: errorMessage(err) };
		}
	}

	try { new URL(url); } catch { return { url, title: "", content: "", error: "Invalid URL" }; }

	// GitHub
	try {
		const ghResult = await extractGitHub(url, signal);
		if (ghResult) return ghResult;
		if (signal?.aborted) return abortedResult(url);
	} catch (err) {
		if (isAbortError(err)) return abortedResult(url);
		if (isConfigParseError(err)) return { url, title: "", content: "", error: errorMessage(err) };
	}

	// YouTube
	const ytInfo = isYouTubeURL(url);
	let youtubeEnabled = false;
	try { youtubeEnabled = isYouTubeEnabled(); } catch (err) { return { url, title: "", content: "", error: errorMessage(err) }; }
	if (ytInfo.isYouTube && youtubeEnabled) {
		reportProgress(options, "Resolving YouTube metadata…");
		try {
			const ytResult = await extractYouTube(url, signal, options?.prompt, options?.model, options?.onProgress);
			if (ytResult) return ytResult;
			if (signal?.aborted) return abortedResult(url);
		} catch (err) {
			if (isAbortError(err)) return abortedResult(url);
			if (isConfigParseError(err)) return { url, title: "", content: "", error: errorMessage(err) };
		}
		return { url, title: "", content: "", error: "Could not extract YouTube video content." };
	}

	if (signal?.aborted) return abortedResult(url);

	// HTTP + fallbacks
	reportProgress(options, "Downloading page content…");
	const httpResult = await extractViaHttp(url, signal, options);
	if (signal?.aborted) return abortedResult(url);
	if (!httpResult.error) return httpResult;
	if (NON_RECOVERABLE_ERRORS.some(prefix => httpResult.error!.startsWith(prefix))) return httpResult;

	reportProgress(options, "Page extraction blocked, trying Jina Reader…");
	const jinaResult = await extractWithJinaReader(url, signal);
	if (jinaResult) return jinaResult;
	if (signal?.aborted) return abortedResult(url);

	let geminiResult: ExtractedContent | null = null;
	reportProgress(options, "Trying Gemini-based extraction…");
	try {
		geminiResult = await extractWithUrlContext(url, signal) ?? await extractWithGeminiWeb(url, signal);
	} catch (err) {
		if (isAbortError(err)) return abortedResult(url);
		if (isConfigParseError(err)) return { ...httpResult, error: errorMessage(err) };
	}
	if (geminiResult) return geminiResult;
	if (signal?.aborted) return abortedResult(url);

	return { ...httpResult, error: [httpResult.error, "", "Fallback options:", "  • Set GEMINI_API_KEY in ~/.pi/web-search.json", "  • Sign into gemini.google.com in Chrome", "  • Use web_search to find content about this topic"].join("\n") };
}

async function extractFramesOnly(url: string, frameCount: number, signal?: AbortSignal): Promise<ExtractedContent> {
	const ytInfo = isYouTubeURL(url);
	if (ytInfo.isYouTube && ytInfo.videoId) {
		const streamInfo = await getYouTubeStreamInfo(ytInfo.videoId);
		if ("error" in streamInfo) return { url, title: "Frames", content: streamInfo.error, error: streamInfo.error };
		if (streamInfo.duration === null) return { url, title: "Frames", content: "Cannot determine video duration.", error: "Cannot determine video duration." };
		const dur = Math.floor(streamInfo.duration);
		const timestamps = computeRangeTimestamps(0, dur, frameCount);
		const result = await extractYouTubeFrames(ytInfo.videoId, timestamps, streamInfo);
		return buildFrameResult(url, `${formatSeconds(0)}-${formatSeconds(dur)}`, timestamps.length, result.frames, result.error, streamInfo.duration);
	}
	const localVideo = safeVideoInfo(url);
	if (localVideo.error) return { url, title: "", content: "", error: localVideo.error };
	if (localVideo.info) {
		const durationResult = await getLocalVideoDuration(localVideo.info.absolutePath);
		if (typeof durationResult !== "number") return { url, title: "Frames", content: durationResult.error, error: durationResult.error };
		const dur = Math.floor(durationResult);
		const timestamps = computeRangeTimestamps(0, dur, frameCount);
		const result = await extractLocalFrames(localVideo.info.absolutePath, timestamps);
		return buildFrameResult(url, `${formatSeconds(0)}-${formatSeconds(dur)}`, timestamps.length, result.frames, result.error, durationResult);
	}
	return { url, title: "", content: "", error: "Frame extraction only works with YouTube and local video files" };
}

async function extractWithTimestamp(url: string, options: ExtractOptions, signal?: AbortSignal): Promise<ExtractedContent> {
	const spec = parseTimestampSpec(options.timestamp!);
	if (!spec) return { url, title: "", content: "", error: `Invalid timestamp format: "${options.timestamp}".` };

	const frameCount = options.frames;
	const ytInfo = isYouTubeURL(url);

	if (ytInfo.isYouTube && ytInfo.videoId) {
		return extractYouTubeWithTimestamp(url, ytInfo.videoId, spec, frameCount, options.timestamp!);
	}

	const localVideo = safeVideoInfo(url);
	if (localVideo.error) return { url, title: "", content: "", error: localVideo.error };
	if (localVideo.info) return extractLocalWithTimestamp(url, localVideo.info.absolutePath, spec, frameCount, options.timestamp!);

	return { url, title: "", content: "", error: "Timestamp extraction only works with YouTube and local video files" };
}

async function extractYouTubeWithTimestamp(url: string, videoId: string, spec: TimestampSpec, frameCount: number | undefined, rawTs: string): Promise<ExtractedContent> {
	const streamInfo = await getYouTubeStreamInfo(videoId);
	if ("error" in streamInfo) return { url, title: `Frame at ${rawTs}`, content: streamInfo.error, error: streamInfo.error };

	if (spec.type === "range") {
		const timestamps = frameCount ? computeRangeTimestamps(spec.start, spec.end, frameCount) : computeRangeTimestamps(spec.start, spec.end);
		const result = await extractYouTubeFrames(videoId, timestamps, streamInfo);
		const label = `${formatSeconds(spec.start)}-${formatSeconds(spec.end)}`;
		return buildFrameResult(url, label, timestamps.length, result.frames, result.error, result.duration ?? undefined);
	}
	if (frameCount) {
		const end = spec.seconds + (frameCount - 1) * MIN_FRAME_INTERVAL;
		const timestamps = computeRangeTimestamps(spec.seconds, end, frameCount);
		const result = await extractYouTubeFrames(videoId, timestamps, streamInfo);
		return buildFrameResult(url, `${formatSeconds(spec.seconds)}-${formatSeconds(end)}`, timestamps.length, result.frames, result.error, result.duration ?? undefined);
	}
	const frame = await extractYouTubeFrame(videoId, spec.seconds, streamInfo);
	if ("error" in frame) return { url, title: `Frame at ${rawTs}`, content: frame.error, error: frame.error };
	return { url, title: `Frame at ${rawTs}`, content: `Video frame at ${rawTs}`, error: null, thumbnail: frame };
}

async function extractLocalWithTimestamp(url: string, filePath: string, spec: TimestampSpec, frameCount: number | undefined, rawTs: string): Promise<ExtractedContent> {
	if (spec.type === "range") {
		const timestamps = frameCount ? computeRangeTimestamps(spec.start, spec.end, frameCount) : computeRangeTimestamps(spec.start, spec.end);
		const result = await extractLocalFrames(filePath, timestamps);
		return buildFrameResult(url, `${formatSeconds(spec.start)}-${formatSeconds(spec.end)}`, timestamps.length, result.frames, result.error);
	}
	if (frameCount) {
		const end = spec.seconds + (frameCount - 1) * MIN_FRAME_INTERVAL;
		const timestamps = computeRangeTimestamps(spec.seconds, end, frameCount);
		const result = await extractLocalFrames(filePath, timestamps);
		return buildFrameResult(url, `${formatSeconds(spec.seconds)}-${formatSeconds(end)}`, timestamps.length, result.frames, result.error);
	}
	const frame = await extractVideoFrame(filePath, spec.seconds);
	if ("error" in frame) return { url, title: `Frame at ${rawTs}`, content: frame.error, error: frame.error };
	return { url, title: `Frame at ${rawTs}`, content: `Video frame at ${rawTs}`, error: null, thumbnail: frame };
}

export async function fetchAllContent(urls: string[], signal?: AbortSignal, options?: ExtractOptions): Promise<ExtractedContent[]> {
	return Promise.all(urls.map((url) => fetchLimit(() => extractContent(url, signal, options))));
}
