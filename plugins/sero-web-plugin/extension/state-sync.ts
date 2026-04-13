// state-sync.ts — Sero state file read/write.
// Converts pi-web-access StoredSearchData into the lighter WebEntry
// format used by the UI, and manages provider info + bookmarks.

import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type { WebAccessState, WebEntry, QueryInfo, UrlInfo, ProviderStatus, Bookmark, WebDownload } from "../shared/types.js";
import { DEFAULT_STATE, MAX_STATE_ENTRIES } from "../shared/types.js";

const STATE_REL_PATH = path.join(".sero", "apps", "web", "state.json");
const WORKSPACE_CONFIG = ".sero-workspace.json";
const stateWriteQueues = new Map<string, Promise<void>>();

function resolveWorkspaceRoot(cwd: string): string {
	let current = path.resolve(cwd);

	while (true) {
		if (existsSync(path.join(current, WORKSPACE_CONFIG))) return current;
		const parent = path.dirname(current);
		if (parent === current) return path.resolve(cwd);
		current = parent;
	}
}

export function resolveWorkspaceRootFromStatePath(statePath: string): string {
	return path.resolve(path.dirname(statePath), "..", "..", "..");
}

export function resolveStatePath(cwd: string): string {
	return path.join(resolveWorkspaceRoot(cwd), STATE_REL_PATH);
}

// ── File I/O (atomic) ──────────────────────────────────────

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function createStateReadError(filePath: string, error: unknown): Error {
	const detail = error instanceof Error ? error.message : String(error);
	return new Error(
		`Web state at ${filePath} is unreadable. Repair or remove the malformed file before retrying. Original error: ${detail}`,
	);
}

function normalizeState(parsed: Partial<WebAccessState>): WebAccessState {
	return {
		...DEFAULT_STATE,
		...parsed,
		entries: Array.isArray(parsed.entries) ? parsed.entries : [],
		bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
		downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
		historyClearedAt:
			typeof parsed.historyClearedAt === "number" && Number.isFinite(parsed.historyClearedAt)
				? parsed.historyClearedAt
				: 0,
	};
}

export async function readState(filePath: string): Promise<WebAccessState> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return normalizeState(JSON.parse(raw) as Partial<WebAccessState>);
	} catch (error) {
		if (isMissingFileError(error)) {
			return normalizeState(DEFAULT_STATE);
		}
		throw createStateReadError(filePath, error);
	}
}

async function writeState(filePath: string, state: WebAccessState): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	const tmpPath = `${filePath}.tmp.${Date.now()}`;
	await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
	await fs.rename(tmpPath, filePath);
}

async function updateState<T>(
	filePath: string,
	updater: (state: WebAccessState) => T | Promise<T>,
): Promise<T> {
	const previous = stateWriteQueues.get(filePath) ?? Promise.resolve();
	let resolveDone!: () => void;
	const current = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	stateWriteQueues.set(filePath, previous.then(() => current));

	await previous;
	try {
		const state = await readState(filePath);
		return await updater(state);
	} finally {
		resolveDone();
		if (stateWriteQueues.get(filePath) === current) {
			stateWriteQueues.delete(filePath);
		}
	}
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
	await updateState(filePath, async (state) => {
		if (data.timestamp <= state.historyClearedAt) return;
		const existing = state.entries.findIndex(e => e.id === data.id);
		const entry = toWebEntry(data);
		if (existing >= 0) state.entries[existing] = entry;
		else state.entries.unshift(entry);
		if (state.entries.length > MAX_STATE_ENTRIES) state.entries = state.entries.slice(0, MAX_STATE_ENTRIES);
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
	});
}

export async function clearHistory(filePath: string): Promise<number> {
	return updateState(filePath, async (state) => {
		const clearedAt = Date.now();
		state.entries = [];
		state.historyClearedAt = clearedAt;
		state.lastSyncedAt = clearedAt;
		await writeState(filePath, state);
		return clearedAt;
	});
}

// ── Bookmarks ──────────────────────────────────────────────

function generateBookmarkId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addBookmark(
	filePath: string, url: string, title: string, description?: string, tags?: string[],
): Promise<Bookmark> {
	return updateState(filePath, async (state) => {
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
	});
}

export async function removeBookmark(filePath: string, idOrUrl: string): Promise<boolean> {
	return updateState(filePath, async (state) => {
		const before = state.bookmarks.length;
		state.bookmarks = state.bookmarks.filter(b => b.id !== idOrUrl && b.url !== idOrUrl);
		if (state.bookmarks.length === before) return false;
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
		return true;
	});
}

export async function listBookmarks(filePath: string, tag?: string): Promise<Bookmark[]> {
	const state = await readState(filePath);
	if (tag) return state.bookmarks.filter(b => b.tags.includes(tag));
	return state.bookmarks;
}

// ── Downloads ──────────────────────────────────────────────

export async function upsertDownload(filePath: string, download: WebDownload): Promise<void> {
	await updateState(filePath, async (state) => {
		const existing = state.downloads.findIndex((entry) => entry.id === download.id);
		const normalized: WebDownload = {
			...download,
			title: download.title || download.sourceUrl,
			phase: download.phase || "Preparing download…",
			progressPct: typeof download.progressPct === "number" ? download.progressPct : null,
			updatedAt: download.updatedAt || Date.now(),
		};
		if (existing >= 0) state.downloads[existing] = normalized;
		else state.downloads.unshift(normalized);
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
	});
}

export async function removeDownload(filePath: string, downloadId: string): Promise<void> {
	await updateState(filePath, async (state) => {
		state.downloads = state.downloads.filter((entry) => entry.id !== downloadId);
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
	});
}

// ── Provider info ──────────────────────────────────────────

export async function updateProviderInfo(
	filePath: string, providers: ProviderStatus, activeProvider: string, workflow: string,
): Promise<void> {
	await updateState(filePath, async (state) => {
		state.providers = providers;
		state.activeProvider = activeProvider;
		state.workflow = workflow;
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
	});
}

// ── Session restore ────────────────────────────────────────

export async function syncFromSession(
	filePath: string,
	sessionEntries: Array<{ type: string; customType?: string; data?: unknown }>,
): Promise<void> {
	await updateState(filePath, async (state) => {
		const existingIds = new Set(state.entries.map(e => e.id));
		const now = Date.now();
		const CACHE_TTL_MS = 60 * 60 * 1000;
		const clearedAt = state.historyClearedAt;
		let changed = false;
		for (const entry of sessionEntries) {
			if (entry.type !== "custom" || entry.customType !== "web-search-results") continue;
			const data = entry.data as StoredSearchData;
			if (!data?.id || !data?.type || !data?.timestamp) continue;
			if (now - data.timestamp >= CACHE_TTL_MS) continue;
			if (data.timestamp <= clearedAt) continue;
			if (existingIds.has(data.id)) continue;
			state.entries.unshift(toWebEntry(data));
			existingIds.add(data.id);
			changed = true;
		}
		if (!changed) return;
		if (state.entries.length > MAX_STATE_ENTRIES) state.entries = state.entries.slice(0, MAX_STATE_ENTRIES);
		state.lastSyncedAt = Date.now();
		await writeState(filePath, state);
	});
}
