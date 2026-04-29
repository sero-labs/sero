import { activityMonitor } from "./activity.js";
import { isGeminiApiAvailable, queryGeminiApiWithVideo } from "./gemini-api.js";
import { isGeminiWebAvailable, queryWithCookies } from "./gemini-web.js";
import {
	type ExtractedContent,
	type ExtractProgressCallback,
	extractHeadingTitle,
} from "./extract.js";
import { searchWithPerplexity } from "./perplexity.js";
import { isYouTubeURL, isYouTubeEnabled, loadYouTubeConfig } from "./youtube-config.js";
import {
	extractYouTubeFrame,
	extractYouTubeFrames,
	fetchYouTubeThumbnail,
	getYouTubeStreamInfo,
} from "./youtube-media.js";

const YOUTUBE_PROMPT = `Extract the complete content of this YouTube video. Include:
1. Video title, channel name, and duration
2. A brief summary (2-3 sentences)
3. Full transcript with timestamps
4. Descriptions of any code, terminal commands, diagrams, slides, or UI shown on screen

Format as markdown.`;

export { isYouTubeURL, isYouTubeEnabled } from "./youtube-config.js";
export {
	extractYouTubeFrame,
	extractYouTubeFrames,
	fetchYouTubeThumbnail,
	getYouTubeStreamInfo,
	type StreamInfo,
	type StreamResult,
} from "./youtube-media.js";

function shouldRethrow(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return message.startsWith("Failed to parse ");
}

export async function extractYouTube(
	url: string,
	signal?: AbortSignal,
	prompt?: string,
	model?: string,
	onProgress?: ExtractProgressCallback,
): Promise<ExtractedContent | null> {
	const config = loadYouTubeConfig();
	const { videoId } = isYouTubeURL(url);
	const canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
	const effectivePrompt = prompt ?? YOUTUBE_PROMPT;
	const effectiveModel = model ?? config.preferredModel;
	const activityId = activityMonitor.logStart({ type: "fetch", url: `youtube.com/${videoId ?? "video"}` });

	onProgress?.("Trying Gemini Web for YouTube analysis…");
	const webResult = await tryGeminiWeb(canonicalUrl, effectivePrompt, effectiveModel, signal, onProgress);
	if (webResult) {
		const result = webResult;
		result.url = url;
		if (videoId) {
			onProgress?.("Downloading YouTube thumbnail…");
			const thumb = await fetchYouTubeThumbnail(videoId);
			if (thumb) result.thumbnail = thumb;
		}
		activityMonitor.logComplete(activityId, 200);
		return result;
	}

	onProgress?.("Gemini Web unavailable, trying Gemini API…");
	const apiResult = await tryGeminiApi(canonicalUrl, effectivePrompt, effectiveModel, signal, onProgress);
	if (apiResult) {
		const result = apiResult;
		result.url = url;
		if (videoId) {
			onProgress?.("Downloading YouTube thumbnail…");
			const thumb = await fetchYouTubeThumbnail(videoId);
			if (thumb) result.thumbnail = thumb;
		}
		activityMonitor.logComplete(activityId, 200);
		return result;
	}

	onProgress?.("Gemini unavailable, falling back to Perplexity summary…");
	const perplexityResult = await tryPerplexity(url, effectivePrompt, signal, onProgress);
	if (perplexityResult) {
		const result = perplexityResult;
		result.url = url;
		if (videoId) {
			const thumb = await fetchYouTubeThumbnail(videoId);
			if (thumb) result.thumbnail = thumb;
		}
		activityMonitor.logComplete(activityId, 200);
		return result;
	}

	if (signal?.aborted) {
		activityMonitor.logComplete(activityId, 0);
		return null;
	}

	activityMonitor.logError(activityId, "all extraction paths failed");
	return null;
}

async function tryGeminiWeb(
	url: string,
	prompt: string,
	model: string,
	signal?: AbortSignal,
	onProgress?: ExtractProgressCallback,
): Promise<ExtractedContent | null> {
	try {
		const cookies = await isGeminiWebAvailable();
		if (!cookies || signal?.aborted) return null;

		onProgress?.("Sending YouTube link to Gemini Web…");
		const text = await queryWithCookies(prompt, cookies, {
			youtubeUrl: url,
			model,
			signal,
			timeoutMs: 120000,
		});

		return {
			url,
			title: extractHeadingTitle(text) ?? "YouTube Video",
			content: text,
			error: null,
		};
	} catch (err) {
		if (shouldRethrow(err)) throw err;
		return null;
	}
}

async function tryGeminiApi(
	url: string,
	prompt: string,
	model: string,
	signal?: AbortSignal,
	onProgress?: ExtractProgressCallback,
): Promise<ExtractedContent | null> {
	try {
		if (!isGeminiApiAvailable() || signal?.aborted) return null;

		onProgress?.("Sending YouTube URL to Gemini API…");
		const text = await queryGeminiApiWithVideo(prompt, url, {
			model,
			signal,
			timeoutMs: 120000,
		});

		return {
			url,
			title: extractHeadingTitle(text) ?? "YouTube Video",
			content: text,
			error: null,
		};
	} catch (err) {
		if (shouldRethrow(err)) throw err;
		return null;
	}
}

async function tryPerplexity(
	url: string,
	prompt: string,
	signal?: AbortSignal,
	onProgress?: ExtractProgressCallback,
): Promise<ExtractedContent | null> {
	try {
		if (signal?.aborted) return null;

		onProgress?.("Requesting fallback summary from Perplexity…");
		const perplexityQuery =
			prompt === YOUTUBE_PROMPT
				? `Summarize this YouTube video in detail: ${url}`
				: `${prompt} YouTube video: ${url}`;
		const { answer } = await searchWithPerplexity(perplexityQuery, { signal });
		if (!answer) return null;

		return {
			url,
			title: "Video Summary (via Perplexity)",
			content:
				`# Video Summary (via Perplexity)\n\n${answer}\n\n` +
				"*Full video understanding requires Gemini access. Set GEMINI_API_KEY or sign into Google in Chrome.*",
			error: null,
		};
	} catch (err) {
		if (shouldRethrow(err)) throw err;
		return null;
	}
}
