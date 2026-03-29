// state-sync.ts — Sero state file read/write.
// Converts pi-web-access StoredSearchData into the lighter WebEntry
// format used by the UI, and manages provider info + bookmarks.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { WebAccessState, WebEntry, QueryInfo, UrlInfo, ProviderStatus, Bookmark } from "../shared/types.js";
import { DEFAULT_STATE, MAX_STATE_ENTRIES } from "../shared/types.js";

const STATE_REL_PATH = path.join(".sero", "apps", "web", "state.json");

export function resolveStatePath(cwd: string): string {
	return path.join(cwd, STATE_REL_PATH);
}

// ── File I/O (atomic) ──────────────────────────────────────

export async function readState(filePath: string): Promise<WebAccessState> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as WebAccessState;
		// Ensure bookmarks array exists for older state files
		if (!Array.isArray(parsed.bookmarks)) parsed.bookmarks = [];
		return parsed;
	} catch { return { ...DEFAULT_STATE, bookmarks: [] }; }
}

async function writeState(filePath: string, state: WebAccessState): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	const tmpPath = `${filePath}.tmp.${Date.now()}`;
	await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
	await fs.rename(tmpPath, filePath);
}

// ── Convert stored data → WebEntry ─────────────────────────

interface StoredQueryData {
	query: string; answer: string;
	results: Array<{ title: string; url: string }>;
	error: string | null; provider?: string;
}

interface StoredUrlData {
	url: string; title: string; content: string; error: string | null;
}

interface StoredSearchData {
	id: string; type: "search" | "fetch"; timestamp: number;
	queries?: StoredQueryData[]; urls?: StoredUrlData[];
}

function toWebEntry(data: StoredSearchData): WebEntry {
	const entry: WebEntry = { id: data.id, type: data.type, timestamp: data.timestamp };
	if (data.type === "search" && data.queries) {
		entry.queries = data.queries.map((q): QueryInfo => ({
			query: q.query, answer: q.answer || "", resultCount: q.results.length,
			provider: q.provider, error: q.error,
			sources: q.results.map(r => ({ title: r.title, url: r.url })),
		}));
	}
	if (data.type === "fetch" && data.urls) {
		entry.urls = data.urls.map((u): UrlInfo => ({
			url: u.url, title: u.title, charCount: u.content?.length ?? 0, error: u.error,
		}));
	}
	return entry;
}

// ── Search history ─────────────────────────────────────────

export async function syncEntryToState(filePath: string, rawData: unknown): Promise<void> {
	const data = rawData as StoredSearchData;
	if (!data?.id || !data?.type || !data?.timestamp) return;
	const state = await readState(filePath);
	const existing = state.entries.findIndex(e => e.id === data.id);
	const entry = toWebEntry(data);
	if (existing >= 0) state.entries[existing] = entry;
	else state.entries.unshift(entry);
	if (state.entries.length > MAX_STATE_ENTRIES) state.entries = state.entries.slice(0, MAX_STATE_ENTRIES);
	state.lastSyncedAt = Date.now();
	await writeState(filePath, state);
}

export async function clearHistory(filePath: string): Promise<void> {
	const state = await readState(filePath);
	state.entries = [];
	state.lastSyncedAt = Date.now();
	await writeState(filePath, state);
}

// ── Bookmarks ──────────────────────────────────────────────

function generateBookmarkId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addBookmark(
	filePath: string, url: string, title: string, description?: string, tags?: string[],
): Promise<Bookmark> {
	const state = await readState(filePath);
	// Deduplicate by URL
	const existing = state.bookmarks.find(b => b.url === url);
	if (existing) {
		existing.title = title || existing.title;
		if (description !== undefined) existing.description = description;
		if (tags) existing.tags = tags;
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
		return existing;
	}
	const bookmark: Bookmark = {
		id: generateBookmarkId(),
		url, title: title || url,
		description: description || undefined,
		tags: tags ?? [],
		createdAt: Date.now(),
	};
	state.bookmarks.unshift(bookmark);
	state.lastSyncedAt = Date.now();
	await writeState(filePath, state);
	return bookmark;
}

export async function removeBookmark(filePath: string, idOrUrl: string): Promise<boolean> {
	const state = await readState(filePath);
	const before = state.bookmarks.length;
	state.bookmarks = state.bookmarks.filter(b => b.id !== idOrUrl && b.url !== idOrUrl);
	if (state.bookmarks.length === before) return false;
	state.lastSyncedAt = Date.now();
	await writeState(filePath, state);
	return true;
}

export async function listBookmarks(filePath: string, tag?: string): Promise<Bookmark[]> {
	const state = await readState(filePath);
	if (tag) return state.bookmarks.filter(b => b.tags.includes(tag));
	return state.bookmarks;
}

// ── Provider info ──────────────────────────────────────────

export async function updateProviderInfo(
	filePath: string, providers: ProviderStatus, activeProvider: string, workflow: string,
): Promise<void> {
	const state = await readState(filePath);
	state.providers = providers;
	state.activeProvider = activeProvider;
	state.workflow = workflow;
	state.lastSyncedAt = Date.now();
	await writeState(filePath, state);
}

// ── Session restore ────────────────────────────────────────

export async function syncFromSession(
	filePath: string,
	sessionEntries: Array<{ type: string; customType?: string; data?: unknown }>,
): Promise<void> {
	const state = await readState(filePath);
	const existingIds = new Set(state.entries.map(e => e.id));
	const now = Date.now();
	const CACHE_TTL_MS = 60 * 60 * 1000;
	let changed = false;
	for (const entry of sessionEntries) {
		if (entry.type !== "custom" || entry.customType !== "web-search-results") continue;
		const data = entry.data as StoredSearchData;
		if (!data?.id || !data?.type || !data?.timestamp) continue;
		if (now - data.timestamp >= CACHE_TTL_MS) continue;
		if (existingIds.has(data.id)) continue;
		state.entries.unshift(toWebEntry(data));
		existingIds.add(data.id);
		changed = true;
	}
	if (changed) {
		if (state.entries.length > MAX_STATE_ENTRIES) state.entries = state.entries.slice(0, MAX_STATE_ENTRIES);
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
	}
}
