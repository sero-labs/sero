import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ExtractedContent } from "./extract.js";
import type { SearchResult } from "./perplexity.js";

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface QueryResultData {
	query: string;
	answer: string;
	results: SearchResult[];
	error: string | null;
	provider?: string;
}

export interface StoredSearchData {
	id: string;
	type: "search" | "fetch";
	timestamp: number;
	queries?: QueryResultData[];
	urls?: ExtractedContent[];
}

/**
 * Results of every session in the process, with the workspace state file that
 * owns each one. A session reads only its own workspace's results, and a
 * history clear removes only them.
 */
const storedResults = new Map<string, { data: StoredSearchData; owner: string }>();

export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function storeResult(id: string, data: StoredSearchData, owner: string): void {
	const expired = Date.now() - CACHE_TTL_MS;
	for (const [storedId, stored] of storedResults) {
		if (stored.data.timestamp <= expired) storedResults.delete(storedId);
	}
	storedResults.set(id, { data, owner });
}

/** `minTimestamp` is the owner workspace's history-clear time; older results are hidden. */
export function getResult(id: string, owner: string, minTimestamp = 0): StoredSearchData | null {
	const stored = storedResults.get(id);
	if (!stored || stored.owner !== owner) return null;
	return stored.data.timestamp > minTimestamp ? stored.data : null;
}

export function getAllResults(): StoredSearchData[] {
	return Array.from(storedResults.values(), (stored) => stored.data);
}

export function deleteResult(id: string): boolean {
	return storedResults.delete(id);
}

/** Removes one workspace's results. Other workspaces' results stay. */
export function clearResults(owner: string): void {
	for (const [id, stored] of storedResults) {
		if (stored.owner === owner) storedResults.delete(id);
	}
}

function isValidStoredData(data: unknown): data is StoredSearchData {
	if (!data || typeof data !== "object") return false;
	const d = data as Record<string, unknown>;
	if (typeof d.id !== "string" || !d.id) return false;
	if (d.type !== "search" && d.type !== "fetch") return false;
	if (typeof d.timestamp !== "number") return false;
	if (d.type === "search" && !Array.isArray(d.queries)) return false;
	if (d.type === "fetch" && !Array.isArray(d.urls)) return false;
	return true;
}

/** Adds the session's recent results. The store is shared by every session, so nothing is cleared. */
export function restoreFromSession(ctx: ExtensionContext, owner: string, minTimestamp = 0): void {
	const now = Date.now();

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "web-search-results") {
			const data = entry.data;
			if (isValidStoredData(data) && now - data.timestamp < CACHE_TTL_MS && data.timestamp > minTimestamp) {
				storedResults.set(data.id, { data, owner });
			}
		}
	}
}
