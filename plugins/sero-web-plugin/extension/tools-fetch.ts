// tools-fetch.ts — fetch_content + get_search_content tool registrations.

import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { fetchAllContent, type ExtractedContent } from "./extract.js";
import { generateId, getResult, storeResult, type StoredSearchData, type QueryResultData } from "./storage.js";
import { readState, resolveWorkspaceRootFromStatePath, upsertDownload } from "./state-sync.js";
import { formatSeconds } from "./utils.js";

import type { ToolDeps } from "./tools-search.js";

const MAX_INLINE_CONTENT = 30000;
const PROGRESS_UPDATE_INTERVAL_MS = 5000;
const WORKSPACE_DOWNLOADS_DIR = "Downloads";

function relativePathFor(workspaceRoot: string, absolutePath: string): string | undefined {
	const relativePath = path.relative(workspaceRoot, absolutePath);
	if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return undefined;
	return relativePath;
}

function buildSavedDownloadId(url: string, absolutePath: string): string {
	const key = `${url}\n${absolutePath}`;
	return `saved-${Buffer.from(key).toString("base64url").slice(0, 32)}`;
}

async function syncSavedDownloads(statePath: string, fetchResults: ExtractedContent[]): Promise<void> {
	const workspaceRoot = resolveWorkspaceRootFromStatePath(statePath);
	for (const result of fetchResults) {
		const absolutePath = result.savedFile?.absolutePath;
		if (!absolutePath || result.error) continue;
		await upsertDownload(statePath, {
			id: buildSavedDownloadId(result.url, absolutePath),
			sourceUrl: result.url,
			title: result.title || path.basename(absolutePath),
			status: "completed",
			phase: "Saved extracted file",
			progressPct: 100,
			absolutePath,
			relativePath: relativePathFor(workspaceRoot, absolutePath),
			error: null,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
	}
}

export function registerFetchContentTool(pi: ExtensionAPI, deps: ToolDeps) {
	pi.registerTool({
		name: "fetch_content",
		label: "Fetch Content",
		description: "Fetch URL(s) and extract readable content as markdown. Supports YouTube video transcripts, GitHub repos, local video files, and PDFs. For YouTube/video: ALWAYS pass the user's specific question via prompt.",
		parameters: Type.Object({
			url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
			urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
			forceClone: Type.Optional(Type.Boolean({ description: "Force cloning large GitHub repositories" })),
			prompt: Type.Optional(Type.String({ description: "Question for video analysis (YouTube and local video)" })),
			timestamp: Type.Optional(Type.String({ description: "Extract video frame(s) at timestamp or range" })),
			frames: Type.Optional(Type.Integer({ minimum: 1, maximum: 12, description: "Number of frames to extract" })),
			model: Type.Optional(Type.String({ description: "Override Gemini model for video analysis" })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			// Ensure statePath is set from tool context as fallback
			const statePath = ctx?.cwd ? deps.ensureStatePath(ctx.cwd) : deps.ensureStatePath();
			const workspaceRoot = statePath ? resolveWorkspaceRootFromStatePath(statePath) : null;
			const downloadDir = workspaceRoot ? path.join(workspaceRoot, WORKSPACE_DOWNLOADS_DIR) : undefined;

			const urlList = params.urls ?? (params.url ? [params.url] : []);
			if (urlList.length === 0) {
				return { content: [{ type: "text", text: "Error: No URL provided." }], details: { error: "No URL provided" } };
			}

			const startedAt = Date.now();
			let phaseText = `Fetching ${urlList.length} URL(s)...`;
			const sendProgressUpdate = (nextPhase?: string) => {
				if (nextPhase) phaseText = nextPhase;
				const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
				onUpdate?.({
					content: [{ type: "text", text: `${phaseText} ${elapsedSec}s elapsed.` }],
					details: { phase: phaseText, progress: 0, elapsedSec },
				});
			};
			sendProgressUpdate();

			const progressInterval = setInterval(() => {
				if (signal?.aborted) return;
				sendProgressUpdate();
			}, PROGRESS_UPDATE_INTERVAL_MS);

			let fetchResults: ExtractedContent[];
			try {
				fetchResults = await fetchAllContent(urlList, signal, {
					forceClone: params.forceClone,
					prompt: params.prompt,
					timestamp: params.timestamp,
					frames: params.frames,
					model: params.model,
					downloadDir,
					onProgress: (message) => sendProgressUpdate(message),
				});
			} finally {
				clearInterval(progressInterval);
			}
			if (statePath) {
				await syncSavedDownloads(statePath, fetchResults);
			}
			const successful = fetchResults.filter(r => !r.error).length;
			const totalChars = fetchResults.reduce((sum, r) => sum + r.content.length, 0);

			const responseId = generateId();
			const data: StoredSearchData = { id: responseId, type: "fetch", timestamp: Date.now(), urls: deps.stripThumbnails(fetchResults) };
			storeResult(responseId, data);
			pi.appendEntry("web-search-results", data);
			deps.syncToState(data);

			if (urlList.length === 1) {
				const result = fetchResults[0];
				if (result.error) {
					return { content: [{ type: "text", text: `Error: ${result.error}` }], details: { urls: urlList, urlCount: 1, successful: 0, error: result.error, responseId } };
				}
				const fullLength = result.content.length;
				const truncated = fullLength > MAX_INLINE_CONTENT;
				let output = truncated ? result.content.slice(0, MAX_INLINE_CONTENT) + "\n\n[Content truncated...]" : result.content;
				if (truncated) output += `\n\n---\nShowing ${MAX_INLINE_CONTENT} of ${fullLength} chars. Use get_search_content({ responseId: "${responseId}", urlIndex: 0 }) for full content.`;

				const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];
				if (result.frames?.length) {
					for (const frame of result.frames) {
						content.push({ type: "image", data: frame.data, mimeType: frame.mimeType });
						content.push({ type: "text", text: `Frame at ${frame.timestamp}` });
					}
				} else if (result.thumbnail) {
					content.push({ type: "image", data: result.thumbnail.data, mimeType: result.thumbnail.mimeType });
				}
				content.push({ type: "text", text: output });
				const imageCount = (result.frames?.length ?? 0) + (result.thumbnail ? 1 : 0);
				return { content, details: { urls: urlList, urlCount: 1, successful: 1, totalChars: fullLength, title: result.title, responseId, truncated, hasImage: imageCount > 0, imageCount, duration: result.duration } };
			}

			let output = "## Fetched URLs\n\n";
			for (const { url, title, content, error } of fetchResults) {
				output += error ? `- ${url}: Error - ${error}\n` : `- ${title || url} (${content.length} chars)\n`;
			}
			output += `\n---\nUse get_search_content({ responseId: "${responseId}", urlIndex: 0 }) to retrieve full content.`;
			return { content: [{ type: "text", text: output }], details: { urls: urlList, urlCount: urlList.length, successful, totalChars, responseId } };
		},

		renderCall(args, theme) {
			const { url, urls, prompt, timestamp, frames } = args as { url?: string; urls?: string[]; prompt?: string; timestamp?: string; frames?: number };
			const urlList = urls ?? (url ? [url] : []);
			if (urlList.length === 0) return new Text(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("error", "(no URL)"), 0, 0);
			const lines: string[] = [];
			if (urlList.length === 1) {
				const display = urlList[0].length > 60 ? urlList[0].slice(0, 57) + "..." : urlList[0];
				lines.push(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", display));
			} else {
				lines.push(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", `${urlList.length} URLs`));
				for (const u of urlList.slice(0, 5)) lines.push(theme.fg("muted", "  " + (u.length > 60 ? u.slice(0, 57) + "..." : u)));
				if (urlList.length > 5) lines.push(theme.fg("muted", `  ... and ${urlList.length - 5} more`));
			}
			if (timestamp) lines.push(theme.fg("dim", "  timestamp: ") + theme.fg("warning", timestamp));
			if (typeof frames === "number") lines.push(theme.fg("dim", "  frames: ") + theme.fg("warning", String(frames)));
			if (prompt) lines.push(theme.fg("dim", "  prompt: ") + theme.fg("muted", `"${prompt.length > 250 ? prompt.slice(0, 247) + "..." : prompt}"`));
			return new Text(lines.join("\n"), 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as { urlCount?: number; successful?: number; totalChars?: number; error?: string; title?: string; truncated?: boolean; hasImage?: boolean; imageCount?: number; phase?: string; progress?: number; duration?: number; elapsedSec?: number };
			if (isPartial) {
				const progress = details?.progress ?? 0;
				const bar = "\u2588".repeat(Math.floor(progress * 10)) + "\u2591".repeat(10 - Math.floor(progress * 10));
				const elapsed = typeof details?.elapsedSec === "number" && details.elapsedSec > 0 ? ` (${details.elapsedSec}s)` : "";
				return new Text(theme.fg("accent", `[${bar}] ${details?.phase || "fetching"}${elapsed}`), 0, 0);
			}
			if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			if (details?.urlCount === 1) {
				const title = details?.title || "Untitled";
				const imgCount = details?.imageCount ?? (details?.hasImage ? 1 : 0);
				const imageBadge = imgCount > 1 ? theme.fg("accent", ` [${imgCount} images]`) : imgCount === 1 ? theme.fg("accent", " [image]") : "";
				let statusLine = theme.fg("success", title) + theme.fg("muted", ` (${details?.totalChars ?? 0} chars)`) + imageBadge;
				if (details?.truncated) statusLine += theme.fg("warning", " [truncated]");
				if (typeof details?.duration === "number") statusLine += theme.fg("muted", ` | ${formatSeconds(Math.floor(details.duration))} total`);
				if (!expanded) {
					const textContent = result.content.find(c => c.type === "text")?.text || "";
					return new Text(statusLine + "\n" + theme.fg("dim", textContent.length > 200 ? textContent.slice(0, 200) + "..." : textContent), 0, 0);
				}
				return new Text(statusLine, 0, 0);
			}
			const countColor = (details?.successful ?? 0) > 0 ? "success" : "error";
			return new Text(theme.fg(countColor, `${details?.successful}/${details?.urlCount} URLs`) + theme.fg("muted", " (content stored)"), 0, 0);
		},
	});
}

export function registerGetContentTool(pi: ExtensionAPI, getStatePath: () => string) {
	pi.registerTool({
		name: "get_search_content",
		label: "Get Search Content",
		description: "Retrieve full content from a previous web_search or fetch_content call.",
		parameters: Type.Object({
			responseId: Type.String({ description: "The responseId from web_search or fetch_content" }),
			query: Type.Optional(Type.String({ description: "Get content for this query" })),
			queryIndex: Type.Optional(Type.Number({ description: "Get content for query at index" })),
			url: Type.Optional(Type.String({ description: "Get content for this URL" })),
			urlIndex: Type.Optional(Type.Number({ description: "Get content for URL at index" })),
		}),

		async execute(_toolCallId, params) {
			const statePath = getStatePath();
			const historyClearedAt = statePath ? (await readState(statePath)).historyClearedAt : 0;
			const data = getResult(params.responseId, historyClearedAt);
			if (!data) return { content: [{ type: "text", text: `Error: No stored results for "${params.responseId}"` }], details: { error: "Not found" } };

			if (data.type === "search" && data.queries) {
				let queryData: QueryResultData | undefined;
				if (params.query !== undefined) {
					queryData = data.queries.find(q => q.query === params.query);
					if (!queryData) return { content: [{ type: "text", text: `Query "${params.query}" not found.` }], details: { error: "Query not found" } };
				} else if (params.queryIndex !== undefined) {
					queryData = data.queries[params.queryIndex];
					if (!queryData) return { content: [{ type: "text", text: `Index ${params.queryIndex} out of range.` }], details: { error: "Index out of range" } };
				} else {
					const available = data.queries.map((q, i) => `${i}: "${q.query}"`).join(", ");
					return { content: [{ type: "text", text: `Specify query or queryIndex. Available: ${available}` }], details: { error: "No query specified" } };
				}
				if (queryData.error) return { content: [{ type: "text", text: `Error for "${queryData.query}": ${queryData.error}` }], details: { error: queryData.error } };
				let output = `## Results for: "${queryData.query}"\n\n`;
				if (queryData.answer) output += `${queryData.answer}\n\n---\n\n`;
				for (const r of queryData.results) output += `### ${r.title}\n${r.url}\n\n`;
				return { content: [{ type: "text", text: output }], details: { query: queryData.query, resultCount: queryData.results.length } };
			}

			if (data.type === "fetch" && data.urls) {
				let urlData: ExtractedContent | undefined;
				if (params.url !== undefined) {
					urlData = data.urls.find(u => u.url === params.url);
					if (!urlData) return { content: [{ type: "text", text: "URL not found." }], details: { error: "URL not found" } };
				} else if (params.urlIndex !== undefined) {
					urlData = data.urls[params.urlIndex];
					if (!urlData) return { content: [{ type: "text", text: `Index ${params.urlIndex} out of range.` }], details: { error: "Index out of range" } };
				} else {
					const available = data.urls.map((u, i) => `${i}: ${u.url}`).join("\n  ");
					return { content: [{ type: "text", text: `Specify url or urlIndex. Available:\n  ${available}` }], details: { error: "No URL specified" } };
				}
				if (urlData.error) return { content: [{ type: "text", text: `Error for ${urlData.url}: ${urlData.error}` }], details: { error: urlData.error } };
				return { content: [{ type: "text", text: `# ${urlData.title}\n\n${urlData.content}` }], details: { url: urlData.url, title: urlData.title, contentLength: urlData.content.length } };
			}

			return { content: [{ type: "text", text: "Invalid stored data format" }], details: { error: "Invalid data" } };
		},

		renderCall(args, theme) {
			const { responseId, query, queryIndex, url, urlIndex } = args as { responseId: string; query?: string; queryIndex?: number; url?: string; urlIndex?: number };
			let target = "";
			if (query) target = `query="${query}"`;
			else if (queryIndex !== undefined) target = `queryIndex=${queryIndex}`;
			else if (url) target = url.length > 30 ? url.slice(0, 27) + "..." : url;
			else if (urlIndex !== undefined) target = `urlIndex=${urlIndex}`;
			return new Text(theme.fg("toolTitle", theme.bold("get_content ")) + theme.fg("accent", target || responseId.slice(0, 8)), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as { error?: string; query?: string; url?: string; title?: string; resultCount?: number; contentLength?: number };
			if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			const statusLine = details?.query
				? theme.fg("success", `"${details.query}"`) + theme.fg("muted", ` (${details.resultCount} results)`)
				: theme.fg("success", details?.title || "Content") + theme.fg("muted", ` (${details?.contentLength ?? 0} chars)`);
			if (!expanded) return new Text(statusLine, 0, 0);
			const textContent = result.content.find(c => c.type === "text")?.text || "";
			return new Text(statusLine + "\n" + theme.fg("dim", textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent), 0, 0);
		},
	});
}
