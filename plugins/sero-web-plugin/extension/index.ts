// index.ts — Sero web access plugin entry point.
// Registers web_search, fetch_content, code_search, get_search_content tools,
// session lifecycle handlers, and Sero state file sync.
// Curator (TUI-only) is omitted; the Sero UI provides result browsing.

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { fetchAllContent, type ExtractedContent } from "./extract.js";
import { clearCloneCache } from "./github-extract.js";
import { clearResults, generateId, storeResult, restoreFromSession, type QueryResultData, type StoredSearchData } from "./storage.js";
import { activityMonitor } from "./activity.js";
import { isExaAvailable } from "./exa.js";
import { isPerplexityAvailable } from "./perplexity.js";
import { isGeminiApiAvailable } from "./gemini-api.js";
import { getActiveGoogleEmail, isGeminiWebAvailable } from "./gemini-web.js";
import { readState, resolveStatePath, syncEntryToState, syncFromSession as syncStateFromSession, updateProviderInfo } from "./state-sync.js";
import { registerWebSearchTool } from "./tools-search.js";
import { registerFetchContentTool, registerGetContentTool } from "./tools-fetch.js";
import { registerCodeSearchTool } from "./tools-code-search.js";
import { registerBookmarkTool } from "./tools-bookmark.js";

let statePath = "";
let sessionActive = false;
const pendingFetches = new Map<string, AbortController>();

function stripThumbnails(results: ExtractedContent[]): ExtractedContent[] {
	return results.map(({ thumbnail, frames, ...rest }) => rest);
}

function normalizeQueryList(rawList: unknown[]): string[] {
	const normalized: string[] = [];
	for (const q of rawList) {
		if (typeof q !== "string") continue;
		const trimmed = q.trim();
		if (trimmed.length > 0) normalized.push(trimmed);
	}
	return normalized;
}

function abortPendingFetches(): void {
	for (const controller of pendingFetches.values()) controller.abort();
	pendingFetches.clear();
}

function logSyncError(context: string, err: unknown): void {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`[sero-web] ${context}: ${msg}`);
}

export default function (pi: ExtensionAPI) {
	// ── State path management ─────────────────────────────
	// Ensure statePath is set from both session handlers AND tool ctx

	function ensureStatePath(cwd?: string): string {
		if (cwd) {
			const resolved = resolveStatePath(cwd);
			if (resolved && resolved !== statePath) {
				statePath = resolved;
			}
		}
		return statePath;
	}

	// ── Sync to state file ────────────────────────────────

	function syncToState(data: StoredSearchData): void {
		const sp = statePath;
		if (!sp) {
			console.error("[sero-web] Cannot sync: statePath not set");
			return;
		}
		syncEntryToState(sp, data).catch((err) => logSyncError("syncEntryToState", err));
	}

	async function wasHistoryClearedSince(timestamp: number): Promise<boolean> {
		const sp = statePath;
		if (!sp) return false;
		try {
			const state = await readState(sp);
			return state.historyClearedAt >= timestamp;
		} catch (err) {
			logSyncError("readState", err);
			return false;
		}
	}

	function storeFetchedContent(results: ExtractedContent[]): string {
		const id = generateId();
		const data: StoredSearchData = {
			id,
			type: "fetch",
			timestamp: Date.now(),
			urls: stripThumbnails(results),
		};
		storeResult(id, data);
		pi.appendEntry("web-search-results", data);
		syncToState(data);
		return id;
	}

	function clearRuntimeHistory(): void {
		abortPendingFetches();
		clearResults();
	}

	// ── Background fetch ──────────────────────────────────

	function startBackgroundFetch(urls: string[]): string | null {
		if (urls.length === 0) return null;
		const fetchId = generateId();
		const startedAt = Date.now();
		const controller = new AbortController();
		pendingFetches.set(fetchId, controller);
		fetchAllContent(urls, controller.signal)
			.then(async (fetched) => {
				if (!sessionActive || !pendingFetches.has(fetchId)) return;
				if (await wasHistoryClearedSince(startedAt)) return;
				const data: StoredSearchData = { id: fetchId, type: "fetch", timestamp: startedAt, urls: stripThumbnails(fetched) };
				storeResult(fetchId, data);
				pi.appendEntry("web-search-results", data);
				syncToState(data);
				const ok = fetched.filter(f => !f.error).length;
				pi.sendMessage({ customType: "web-search-content-ready", content: `Content fetched for ${ok}/${fetched.length} URLs [${fetchId}].`, display: true }, { triggerTurn: true });
			})
			.catch((err) => {
				if (!sessionActive || !pendingFetches.has(fetchId)) return;
				const message = err instanceof Error ? err.message : String(err);
				if (!message.toLowerCase().includes("abort")) {
					pi.sendMessage({ customType: "web-search-error", content: `Content fetch failed [${fetchId}]: ${message}`, display: true }, { triggerTurn: false });
				}
			})
			.finally(() => { pendingFetches.delete(fetchId); });
		return fetchId;
	}

	function storeAndPublish(results: QueryResultData[]): string {
		const id = generateId();
		const data: StoredSearchData = { id, type: "search", timestamp: Date.now(), queries: results };
		storeResult(id, data);
		pi.appendEntry("web-search-results", data);
		syncToState(data);
		return id;
	}

	// ── Session lifecycle ─────────────────────────────────

	async function handleSessionChange(ctx: ExtensionContext): Promise<void> {
		abortPendingFetches();
		clearCloneCache();
		sessionActive = true;
		ensureStatePath(ctx.cwd);
		activityMonitor.clear();

		if (!statePath) {
			console.error("[sero-web] statePath not set after session change — ctx.cwd:", ctx.cwd);
			return;
		}

		try {
			const state = await readState(statePath);
			restoreFromSession(ctx, state.historyClearedAt);
		} catch (err) {
			logSyncError("readState", err);
			restoreFromSession(ctx);
		}

		const branch = ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: unknown }>;
		syncStateFromSession(statePath, branch).catch((err) => logSyncError("syncFromSession", err));

		(async () => {
			try {
				const geminiWebAvail = await isGeminiWebAvailable();
				await updateProviderInfo(statePath, {
					exa: isExaAvailable(),
					perplexity: isPerplexityAvailable(),
					gemini: isGeminiApiAvailable() || !!geminiWebAvail,
				}, "auto", "none");
			} catch (err) { logSyncError("updateProviderInfo", err); }
		})();
	}

	pi.on("session_start", async (_event, ctx) => { await handleSessionChange(ctx); });
	pi.on("session_switch", async (_event, ctx) => { await handleSessionChange(ctx); });
	pi.on("session_fork", async (_event, ctx) => { await handleSessionChange(ctx); });
	pi.on("session_tree", async (_event, ctx) => { await handleSessionChange(ctx); });
	pi.on("session_shutdown", () => {
		sessionActive = false;
		abortPendingFetches();
		clearCloneCache();
		clearResults();
		activityMonitor.clear();
	});

	// ── Register tools ────────────────────────────────────

	const deps = {
		normalizeQueryList,
		storeAndPublish,
		storeFetchedContent,
		startBackgroundFetch,
		stripThumbnails,
		ensureStatePath,
		syncToState,
	};
	registerWebSearchTool(pi, deps);
	registerFetchContentTool(pi, deps);
	registerGetContentTool(pi, () => statePath);
	registerCodeSearchTool(pi);
	registerBookmarkTool(pi, () => statePath, ensureStatePath, clearRuntimeHistory);

	// ── Commands ──────────────────────────────────────────
	// NOTE: the old /websearch command was removed because sero-cli
	// exposed it alongside the web_search tool, and the LLM often
	// called the command (which just sends a user message → fluff)
	// instead of the tool (which returns actual results). The
	// web_search tool is the correct entry point for all searches.

	pi.registerCommand("google-account", {
		description: "Show active Google account for Gemini Web",
		handler: async () => {
			const cookies = await isGeminiWebAvailable();
			if (!cookies) {
				pi.sendMessage({ customType: "google-account", content: [{ type: "text", text: "Gemini Web is unavailable. Sign into gemini.google.com in a supported Chromium-based browser to enable it." }], display: "tool", details: { available: false } }, { triggerTurn: false, deliverAs: "followUp" });
				return;
			}
			const email = await getActiveGoogleEmail(cookies);
			pi.sendMessage({ customType: "google-account", content: [{ type: "text", text: email ? `Active Google account: ${email}` : "Gemini Web is available, but the active Google account could not be determined." }], display: "tool", details: { available: true, email: email ?? null } }, { triggerTurn: false, deliverAs: "followUp" });
		},
	});
}
