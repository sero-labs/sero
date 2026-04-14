import { execFileSync } from "node:child_process";
import { basename, extname } from "node:path";
import { activityMonitor } from "./activity.js";
import { getApiKey, queryGeminiApiWithVideo } from "./gemini-api.js";
import { isGeminiWebAvailable, queryWithCookies } from "./gemini-web.js";
import { type ExtractedContent, type ExtractOptions, extractHeadingTitle, type FrameResult } from "./extract.js";
import { mapFfmpegError, readExecError, trimErrorText } from "./utils.js";
import { deleteGeminiFile, pollGeminiFileState, uploadVideoToGeminiFilesApi } from "./video-gemini-files.js";
import { getVideoFileInfo, loadVideoConfig, type VideoFileInfo } from "./video-config.js";

const DEFAULT_VIDEO_PROMPT = `Extract the complete content of this video. Include:
1. Video title (infer from content if not explicit), duration
2. A brief summary (2-3 sentences)
3. Full transcript with timestamps
4. Descriptions of any code, terminal commands, diagrams, slides, or UI shown on screen

Format as markdown.`;

function shouldRethrow(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return message.startsWith("Failed to parse ");
}

export function isVideoFile(input: string): VideoFileInfo | null {
	return getVideoFileInfo(input);
}

function reportProgress(options: ExtractOptions | undefined, message: string): void {
	options?.onProgress?.(message);
}

export async function extractVideo(
	info: VideoFileInfo,
	signal?: AbortSignal,
	options?: ExtractOptions,
): Promise<ExtractedContent | null> {
	const config = loadVideoConfig();
	const effectivePrompt = options?.prompt ?? DEFAULT_VIDEO_PROMPT;
	const effectiveModel = options?.model ?? config.preferredModel;
	const displayName = basename(info.absolutePath);
	const activityId = activityMonitor.logStart({ type: "fetch", url: `video:${displayName}` });

	reportProgress(options, "Trying Gemini API for video analysis…");
	const apiResult = await tryVideoGeminiApi(info, effectivePrompt, effectiveModel, signal, options?.onProgress);
	let finalResult = apiResult;
	if (!finalResult) {
		reportProgress(options, "Gemini API unavailable, trying Gemini Web…");
		finalResult = await tryVideoGeminiWeb(info, effectivePrompt, effectiveModel, signal, options?.onProgress);
	}

	if (finalResult) {
		reportProgress(options, "Extracting video thumbnail…");
		const thumbnail = await extractVideoFrame(info.absolutePath);
		const resolvedResult = finalResult;
		if (!("error" in thumbnail)) {
			resolvedResult.thumbnail = thumbnail;
		}
		activityMonitor.logComplete(activityId, 200);
		return resolvedResult;
	}

	if (signal?.aborted) {
		activityMonitor.logComplete(activityId, 0);
		return null;
	}

	activityMonitor.logError(activityId, "all video extraction paths failed");
	return null;
}

function mapFfprobeError(err: unknown): string {
	const { code, stderr, message } = readExecError(err);
	if (code === "ENOENT") return "ffprobe is not installed. Install ffmpeg which includes ffprobe";
	const snippet = trimErrorText(stderr || message);
	return snippet ? `ffprobe failed: ${snippet}` : "ffprobe failed";
}

export async function extractVideoFrame(filePath: string, seconds: number = 1): Promise<FrameResult> {
	try {
		const buffer = execFileSync(
			"ffmpeg",
			[
				"-ss",
				String(seconds),
				"-i",
				filePath,
				"-frames:v",
				"1",
				"-f",
				"image2pipe",
				"-vcodec",
				"mjpeg",
				"pipe:1",
			],
			{ maxBuffer: 5 * 1024 * 1024, timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
		);
		if (buffer.length === 0) return { error: "ffmpeg failed: empty output" };
		return { data: buffer.toString("base64"), mimeType: "image/jpeg" };
	} catch (err) {
		return { error: mapFfmpegError(err) };
	}
}

export async function getLocalVideoDuration(filePath: string): Promise<number | { error: string }> {
	try {
		const output = execFileSync(
			"ffprobe",
			["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
			{ timeout: 10000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		).trim();
		const duration = Number.parseFloat(output);
		if (!Number.isFinite(duration)) return { error: "ffprobe failed: invalid duration output" };
		return duration;
	} catch (err) {
		return { error: mapFfprobeError(err) };
	}
}

async function tryVideoGeminiWeb(
	info: VideoFileInfo,
	prompt: string,
	model: string,
	signal?: AbortSignal,
	onProgress?: ExtractOptions["onProgress"],
): Promise<ExtractedContent | null> {
	try {
		const cookies = await isGeminiWebAvailable();
		if (!cookies || signal?.aborted) return null;

		onProgress?.("Sending video to Gemini Web…");
		const text = await queryWithCookies(prompt, cookies, {
			files: [info.absolutePath],
			model,
			signal,
			timeoutMs: 180000,
		});

		return {
			url: info.absolutePath,
			title: extractVideoTitle(text, info.absolutePath),
			content: text,
			error: null,
		};
	} catch (err) {
		if (shouldRethrow(err)) throw err;
		return null;
	}
}

async function tryVideoGeminiApi(
	info: VideoFileInfo,
	prompt: string,
	model: string,
	signal?: AbortSignal,
	onProgress?: ExtractOptions["onProgress"],
): Promise<ExtractedContent | null> {
	const apiKey = getApiKey();
	if (!apiKey || signal?.aborted) return null;

	let fileName: string | null = null;
	try {
		onProgress?.("Uploading video to Gemini Files API…");
		const uploaded = await uploadVideoToGeminiFilesApi(info, apiKey, signal);
		fileName = uploaded.name;

		onProgress?.("Waiting for Gemini to process the upload…");
		await pollGeminiFileState(fileName, apiKey, signal, 120000);

		onProgress?.("Generating analysis from Gemini API…");
		const text = await queryGeminiApiWithVideo(prompt, uploaded.uri, {
			model,
			mimeType: info.mimeType,
			signal,
			timeoutMs: 120000,
		});

		return {
			url: info.absolutePath,
			title: extractVideoTitle(text, info.absolutePath),
			content: text,
			error: null,
		};
	} catch (err) {
		if (shouldRethrow(err)) throw err;
		return null;
	} finally {
		if (fileName) deleteGeminiFile(fileName, apiKey);
	}
}

function extractVideoTitle(text: string, filePath: string): string {
	return extractHeadingTitle(text) ?? basename(filePath, extname(filePath));
}
