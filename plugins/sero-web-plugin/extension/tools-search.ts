// tools-search.ts — web_search tool registration.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { search } from "./gemini-search.js";
import type { ExtractedContent } from "./extract.js";
import type { QueryResultData, StoredSearchData } from "./storage.js";

export interface ToolDeps {
	normalizeQueryList: (raw: unknown[]) => string[];
	storeAndPublish: (results: QueryResultData[]) => string;
	storeFetchedContent: (results: ExtractedContent[]) => string;
	startBackgroundFetch: (urls: string[]) => string | null;
	stripThumbnails: (results: ExtractedContent[]) => ExtractedContent[];
	ensureStatePath: (cwd?: string) => string;
	syncToState: (data: StoredSearchData) => void;
}

function formatSearchSummary(results: Array<{ title: string; url: string }>, answer: string): string {
	let output = answer ? `${answer}\n\n---\n\n**Sources:**\n` : "";
	output += results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n\n");
	return output;
}

function hasFullInlineCoverage(urls: string[], inlineContent: ExtractedContent[] | undefined): boolean {
	if (!inlineContent || inlineContent.length === 0) return false;
	const coveredUrls = new Set(inlineContent.map(c => c.url));
	return urls.every(url => coveredUrls.has(url));
}

function dedupeInlineContent(results: ExtractedContent[]): ExtractedContent[] {
	const deduped = new Map<string, ExtractedContent>();
	for (const result of results) {
		if (!deduped.has(result.url)) deduped.set(result.url, result);
	}
	return [...deduped.values()];
}

export function registerWebSearchTool(pi: ExtensionAPI, deps: ToolDeps) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using Perplexity AI, Exa, or Gemini. Returns an AI-synthesized answer with source citations. " +
			"For comprehensive research, prefer queries (plural) with 2-4 varied angles over a single query. " +
			"Provider auto-selects: Exa (direct API with key, MCP fallback without), else Perplexity, else Gemini API, else Gemini Web.",
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Single search query" })),
			queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple queries searched in sequence" })),
			numResults: Type.Optional(Type.Number({ description: "Results per query (default: 5, max: 20)" })),
			includeContent: Type.Optional(Type.Boolean({ description: "Fetch full page content (async)" })),
			recencyFilter: Type.Optional(StringEnum(["day", "week", "month", "year"], { description: "Filter by recency" })),
			domainFilter: Type.Optional(Type.Array(Type.String(), { description: "Limit to domains (prefix with - to exclude)" })),
			provider: Type.Optional(StringEnum(["auto", "perplexity", "gemini", "exa"], { description: "Search provider (default: auto)" })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			// Ensure statePath is set from tool context as fallback
			if (ctx?.cwd) deps.ensureStatePath(ctx.cwd);

			const rawList: unknown[] = Array.isArray(params.queries) ? params.queries : (params.query !== undefined ? [params.query] : []);
			const queryList = deps.normalizeQueryList(rawList);
			if (queryList.length === 0) {
				return { content: [{ type: "text", text: "Error: No query provided." }], details: { error: "No query provided" } };
			}

			const searchResults: QueryResultData[] = [];
			const allUrls: string[] = [];
			const knownUrls = new Set<string>();
			const allInlineContent: ExtractedContent[] = [];

			for (let i = 0; i < queryList.length; i++) {
				const query = queryList[i];
				onUpdate?.({
					content: [{ type: "text", text: `Searching ${i + 1}/${queryList.length}: "${query}"...` }],
					details: { phase: "search", progress: i / queryList.length, currentQuery: query },
				});
				try {
					const { answer, results, inlineContent, provider } = await search(query, {
						provider: params.provider,
						numResults: params.numResults,
						recencyFilter: params.recencyFilter,
						domainFilter: params.domainFilter,
						includeContent: params.includeContent,
						signal,
					});
					searchResults.push({ query, answer, results, error: null, provider });
					for (const r of results) {
						if (knownUrls.has(r.url)) continue;
						knownUrls.add(r.url);
						allUrls.push(r.url);
					}
					if (inlineContent) allInlineContent.push(...inlineContent);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					searchResults.push({ query, answer: "", results: [], error: message, provider: typeof params.provider === "string" && params.provider !== "auto" ? params.provider : undefined });
				}
			}

			// Build output
			let output = "";
			for (const { query, answer, results, error } of searchResults) {
				if (queryList.length > 1) output += `## Query: "${query}"\n\n`;
				if (error) output += `Error: ${error}\n\n`;
				else if (results.length === 0) output += "No results found.\n\n";
				else output += formatSearchSummary(results, answer) + "\n\n";
			}

			const sc = searchResults.filter(r => !r.error).length;
			const tr = searchResults.reduce((sum, r) => sum + r.results.length, 0);
			const includeContent = params.includeContent ?? false;

			const hasInlineReady = hasFullInlineCoverage(allUrls, allInlineContent);
			let fetchId: string | null = null;
			if (hasInlineReady && allInlineContent.length > 0) {
				const inlineContent = dedupeInlineContent(allInlineContent);
				fetchId = deps.storeFetchedContent(inlineContent);
				output += `---\nFull content for ${inlineContent.length} sources available [${fetchId}].`;
			} else if (includeContent) {
				fetchId = deps.startBackgroundFetch(allUrls);
				if (fetchId) output += `---\nContent fetching in background [${fetchId}]. Will notify when ready.`;
			}

			const searchId = deps.storeAndPublish(searchResults);
			return {
				content: [{ type: "text", text: output.trim() }],
				details: { queries: queryList, queryCount: queryList.length, successfulQueries: sc, totalResults: tr, includeContent, fetchId, searchId },
			};
		},

		renderCall(args, theme) {
			const input = args as { query?: unknown; queries?: unknown };
			const rawList: unknown[] = Array.isArray(input.queries) ? input.queries : (input.query !== undefined ? [input.query] : []);
			const queryList = rawList.filter((q): q is string => typeof q === "string" && q.trim().length > 0).map(q => (q as string).trim());
			if (queryList.length === 0) return new Text(theme.fg("toolTitle", theme.bold("search ")) + theme.fg("error", "(no query)"), 0, 0);
			if (queryList.length === 1) {
				const display = queryList[0].length > 60 ? queryList[0].slice(0, 57) + "..." : queryList[0];
				return new Text(theme.fg("toolTitle", theme.bold("search ")) + theme.fg("accent", `"${display}"`), 0, 0);
			}
			const lines = [theme.fg("toolTitle", theme.bold("search ")) + theme.fg("accent", `${queryList.length} queries`)];
			for (const q of queryList.slice(0, 5)) {
				const display = q.length > 50 ? q.slice(0, 47) + "..." : q;
				lines.push(theme.fg("muted", `  "${display}"`));
			}
			if (queryList.length > 5) lines.push(theme.fg("muted", `  ... and ${queryList.length - 5} more`));
			return new Text(lines.join("\n"), 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as { queryCount?: number; successfulQueries?: number; totalResults?: number; error?: string; fetchId?: string; phase?: string; progress?: number; currentQuery?: string };
			if (isPartial) {
				const progress = details?.progress ?? 0;
				const bar = "\u2588".repeat(Math.floor(progress * 10)) + "\u2591".repeat(10 - Math.floor(progress * 10));
				const q = details?.currentQuery || "";
				const display = q.length > 40 ? q.slice(0, 37) + "..." : q;
				return new Text(theme.fg("accent", `[${bar}] ${display}`), 0, 0);
			}
			if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			const queryInfo = details?.queryCount === 1 ? "" : `${details?.successfulQueries}/${details?.queryCount} queries, `;
			const statusLine = theme.fg("success", `${queryInfo}${details?.totalResults ?? 0} sources`);
			if (!expanded) return new Text(statusLine, 0, 0);
			const textContent = result.content.find(c => c.type === "text")?.text || "";
			const preview = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
			return new Text(statusLine + "\n" + theme.fg("dim", preview), 0, 0);
		},
	});
}
