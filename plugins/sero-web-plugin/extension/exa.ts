// exa.ts — Exa search provider: direct API (with key) and MCP proxy (without).
// MCP proxy logic lives in exa-mcp.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { activityMonitor } from "./activity.js";
import type { ExtractedContent } from "./extract.js";
import type { SearchOptions, SearchResponse } from "./perplexity.js";
import { searchWithExaMcp } from "./exa-mcp.js";
import { getExaUsagePath, getWebConfigPath } from "./paths.js";

const EXA_ANSWER_URL = "https://api.exa.ai/answer";
const EXA_SEARCH_URL = "https://api.exa.ai/search";

const MONTHLY_LIMIT = 1000;
const WARNING_THRESHOLD = 800;

interface WebSearchConfig { exaApiKey?: unknown }
interface ExaUsage { month: string; count: number }

interface ExaAnswerResponse {
	answer?: string;
	citations?: Array<{ url?: string; title?: string; text?: string; publishedDate?: string }>;
}

interface ExaSearchResponse {
	results?: Array<{
		title?: string; url?: string; publishedDate?: string; author?: string;
		text?: string; highlights?: unknown; highlightScores?: number[];
	}>;
}

export type ExaSearchResult = SearchResponse | { exhausted: true } | null;

export interface ExaSearchOptions extends SearchOptions {
	includeContent?: boolean;
}

// Re-export for consumers that only import from exa.js
export { callExaMcp } from "./exa-mcp.js";

let cachedConfig: WebSearchConfig | null = null;
let warnedMonth: string | null = null;

function loadConfig(): WebSearchConfig {
	if (cachedConfig) return cachedConfig;
	const configPath = getWebConfigPath();
	if (!existsSync(configPath)) { cachedConfig = {}; return cachedConfig; }
	const raw = readFileSync(configPath, "utf-8");
	try {
		cachedConfig = JSON.parse(raw) as WebSearchConfig;
		return cachedConfig;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath}: ${message}`);
	}
}

function normalizeApiKey(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function getApiKey(): string | null {
	return normalizeApiKey(process.env.EXA_API_KEY) ?? normalizeApiKey(loadConfig().exaApiKey);
}

function getCurrentMonth(): string { return new Date().toISOString().slice(0, 7); }

function normalizeUsage(raw: unknown): ExaUsage {
	const month = getCurrentMonth();
	if (!raw || typeof raw !== "object") return { month, count: 0 };
	const data = raw as { month?: unknown; count?: unknown };
	const parsedMonth = typeof data.month === "string" ? data.month : month;
	const parsedCount = typeof data.count === "number" && Number.isFinite(data.count) ? data.count : 0;
	if (parsedMonth !== month) return { month, count: 0 };
	return { month: parsedMonth, count: Math.max(0, Math.floor(parsedCount)) };
}

function readUsage(): ExaUsage {
	const usagePath = getExaUsagePath();
	if (!existsSync(usagePath)) return { month: getCurrentMonth(), count: 0 };
	const raw = readFileSync(usagePath, "utf-8");
	try { return normalizeUsage(JSON.parse(raw)); }
	catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${usagePath}: ${message}`);
	}
}

function writeUsage(usage: ExaUsage): void {
	const usagePath = getExaUsagePath();
	const dir = dirname(usagePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(usagePath, JSON.stringify(usage, null, 2) + "\n");
}

function reserveRequestBudget(): { exhausted: true } | null {
	const usage = readUsage();
	if (usage.count >= MONTHLY_LIMIT) return { exhausted: true };
	const nextCount = usage.count + 1;
	if (nextCount >= WARNING_THRESHOLD && warnedMonth !== usage.month) {
		warnedMonth = usage.month;
		console.error(`Exa usage warning: ${nextCount}/${MONTHLY_LIMIT} monthly requests used.`);
	}
	writeUsage({ month: usage.month, count: nextCount });
	return null;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(60000);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function recencyToStartDate(filter: string): string {
	const offsets: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
	return new Date(Date.now() - (offsets[filter] ?? 0) * 86400000).toISOString();
}

function mapDomainFilter(domainFilter: string[] | undefined): { includeDomains?: string[]; excludeDomains?: string[] } {
	if (!domainFilter?.length) return {};
	const inc = domainFilter.filter(d => !d.startsWith("-") && d.trim().length > 0).map(d => d.trim());
	const exc = domainFilter.filter(d => d.startsWith("-")).map(d => d.slice(1).trim()).filter(Boolean);
	return { ...(inc.length ? { includeDomains: inc } : {}), ...(exc.length ? { excludeDomains: exc } : {}) };
}

function normalizeHighlights(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function buildAnswerFromSearchResults(results: ExaSearchResponse["results"]): string {
	if (!results?.length) return "";
	const parts: string[] = [];
	for (let i = 0; i < results.length; i++) {
		const item = results[i];
		if (!item?.url) continue;
		const highlights = normalizeHighlights(item.highlights);
		const content = highlights.length > 0
			? highlights.join(" ")
			: typeof item.text === "string" ? item.text.trim().slice(0, 1000) : "";
		if (!content) continue;
		parts.push(`${content}\nSource: ${item.title || `Source ${i + 1}`} (${item.url})`);
	}
	return parts.join("\n\n");
}

function mapResults(results: ExaSearchResponse["results"] | ExaAnswerResponse["citations"]): SearchResponse["results"] {
	if (!Array.isArray(results)) return [];
	return results.filter((item): item is NonNullable<typeof item> => !!item?.url)
		.map((item, i) => ({ title: item.title || `Source ${i + 1}`, url: item.url!, snippet: "" }));
}

function mapInlineContent(results: ExaSearchResponse["results"]): ExtractedContent[] {
	if (!results?.length) return [];
	return results
		.filter((r): r is NonNullable<typeof r> & { url: string; text: string } =>
			!!r?.url && typeof r.text === "string" && r.text.length > 0)
		.map(r => ({ url: r.url, title: r.title || "", content: r.text, error: null }));
}

export function isExaAvailable(): boolean {
	if (getApiKey()) return readUsage().count < MONTHLY_LIMIT;
	return true;
}

export function hasExaApiKey(): boolean { return !!getApiKey(); }

export async function searchWithExa(query: string, options: ExaSearchOptions = {}): Promise<ExaSearchResult> {
	const apiKey = getApiKey();
	if (!apiKey) return searchWithExaMcp(query, options);

	const budget = reserveRequestBudget();
	if (budget) return budget;

	const useSearch = options.includeContent || !!options.recencyFilter
		|| !!options.domainFilter?.length || !!(options.numResults && options.numResults !== 5);

	const activityId = activityMonitor.logStart({ type: "api", query });

	try {
		if (!useSearch) {
			const response = await fetch(EXA_ANSWER_URL, {
				method: "POST",
				headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
				body: JSON.stringify({ query, text: true }),
				signal: requestSignal(options.signal),
			});
			if (!response.ok) throw new Error(`Exa API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
			const data = await response.json() as ExaAnswerResponse;
			activityMonitor.logComplete(activityId, response.status);
			return { answer: data.answer || "", results: mapResults(data.citations) };
		}

		const startDate = options.recencyFilter ? recencyToStartDate(options.recencyFilter) : null;
		const domainFilters = mapDomainFilter(options.domainFilter);
		const response = await fetch(EXA_SEARCH_URL, {
			method: "POST",
			headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				query, type: "auto", numResults: options.numResults ?? 5,
				...domainFilters,
				...(startDate ? { startPublishedDate: startDate } : {}),
				contents: { text: options.includeContent ? true : { maxCharacters: 3000 }, highlights: true },
			}),
			signal: requestSignal(options.signal),
		});
		if (!response.ok) throw new Error(`Exa API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
		const data = await response.json() as ExaSearchResponse;
		activityMonitor.logComplete(activityId, response.status);

		const mapped: SearchResponse = { answer: buildAnswerFromSearchResults(data.results), results: mapResults(data.results) };
		if (options.includeContent) {
			const inlineContent = mapInlineContent(data.results);
			if (inlineContent.length > 0) mapped.inlineContent = inlineContent;
		}
		return mapped;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.toLowerCase().includes("abort")) activityMonitor.logComplete(activityId, 0);
		else activityMonitor.logError(activityId, message);
		throw err;
	}
}
