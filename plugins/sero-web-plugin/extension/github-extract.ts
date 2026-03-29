// github-extract.ts — GitHub URL detection, clone orchestration, API fallback.
// Content generation (tree building, file reading) lives in github-content.ts.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { activityMonitor } from "./activity.js";
import type { ExtractedContent } from "./extract.js";
import { checkGhAvailable, checkRepoSize, fetchViaApi, showGhHint } from "./github-api.js";
import { generateContent } from "./github-content.js";

const CONFIG_PATH = join(homedir(), ".pi", "web-search.json");

const NON_CODE_SEGMENTS = new Set([
	"issues", "pull", "pulls", "discussions", "releases", "wiki",
	"actions", "settings", "security", "projects", "graphs",
	"compare", "commits", "tags", "branches", "stargazers",
	"watchers", "network", "forks", "milestone", "labels",
	"packages", "codespaces", "contribute", "community",
	"sponsors", "invitations", "notifications", "insights",
]);

export interface GitHubUrlInfo {
	owner: string; repo: string; ref?: string;
	refIsFullSha: boolean; path?: string;
	type: "root" | "blob" | "tree";
}

interface CachedClone { localPath: string; clonePromise: Promise<string | null> }

interface GitHubCloneConfig {
	enabled: boolean; maxRepoSizeMB: number;
	cloneTimeoutSeconds: number; clonePath: string;
}

const cloneCache = new Map<string, CachedClone>();
let cachedConfig: GitHubCloneConfig | null = null;

function loadGitHubConfig(): GitHubCloneConfig {
	if (cachedConfig) return cachedConfig;
	const defaults: GitHubCloneConfig = { enabled: true, maxRepoSizeMB: 350, cloneTimeoutSeconds: 30, clonePath: "/tmp/pi-github-repos" };
	if (!existsSync(CONFIG_PATH)) { cachedConfig = defaults; return cachedConfig; }
	const rawText = readFileSync(CONFIG_PATH, "utf-8");
	let raw: { githubClone?: Record<string, unknown> };
	try { raw = JSON.parse(rawText); }
	catch (err) { throw new Error(`Failed to parse ${CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`); }
	const gc = (raw.githubClone ?? {}) as Record<string, unknown>;
	cachedConfig = {
		enabled: typeof gc.enabled === "boolean" ? gc.enabled : defaults.enabled,
		maxRepoSizeMB: typeof gc.maxRepoSizeMB === "number" && gc.maxRepoSizeMB > 0 ? gc.maxRepoSizeMB : defaults.maxRepoSizeMB,
		cloneTimeoutSeconds: typeof gc.cloneTimeoutSeconds === "number" && gc.cloneTimeoutSeconds > 0 ? gc.cloneTimeoutSeconds : defaults.cloneTimeoutSeconds,
		clonePath: typeof gc.clonePath === "string" && gc.clonePath.trim() ? gc.clonePath.trim() : defaults.clonePath,
	};
	return cachedConfig;
}

export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
	let parsed: URL;
	try { parsed = new URL(url); } catch { return null; }
	const host = parsed.hostname.toLowerCase();
	if (host !== "github.com" && host !== "www.github.com") return null;

	const segments = parsed.pathname.split("/").filter(Boolean)
		.map(s => { try { return decodeURIComponent(s); } catch { return s; } });
	if (segments.length < 2) return null;

	const owner = segments[0];
	const repo = segments[1].replace(/\.git$/, "");
	if (NON_CODE_SEGMENTS.has(segments[2]?.toLowerCase())) return null;
	if (segments.length === 2) return { owner, repo, refIsFullSha: false, type: "root" };

	const action = segments[2];
	if (action !== "blob" && action !== "tree") return null;
	if (segments.length < 4) return null;

	const ref = segments[3];
	const path = segments.slice(4).join("/") || "";
	return { owner, repo, ref, refIsFullSha: /^[0-9a-f]{40}$/.test(ref), path, type: action as "blob" | "tree" };
}

function cacheKey(owner: string, repo: string, ref?: string): string {
	return ref ? `${owner}/${repo}@${ref}` : `${owner}/${repo}`;
}

function cloneDir(config: GitHubCloneConfig, owner: string, repo: string, ref?: string): string {
	return join(config.clonePath, owner, ref ? `${repo}@${ref}` : repo);
}

function execClone(args: string[], localPath: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null> {
	return new Promise((resolve) => {
		const child = execFile(args[0], args.slice(1), { timeout: timeoutMs }, (err) => {
			if (err) { try { rmSync(localPath, { recursive: true, force: true }); } catch {} resolve(null); return; }
			resolve(localPath);
		});
		if (signal) {
			const onAbort = () => child.kill();
			signal.addEventListener("abort", onAbort, { once: true });
			child.on("exit", () => signal.removeEventListener("abort", onAbort));
		}
	});
}

async function cloneRepo(owner: string, repo: string, ref: string | undefined, config: GitHubCloneConfig, signal?: AbortSignal): Promise<string | null> {
	const localPath = cloneDir(config, owner, repo, ref);
	try { rmSync(localPath, { recursive: true, force: true }); } catch {}
	const timeoutMs = config.cloneTimeoutSeconds * 1000;
	const hasGh = await checkGhAvailable();
	if (hasGh) {
		const args = ["gh", "repo", "clone", `${owner}/${repo}`, localPath, "--", "--depth", "1", "--single-branch"];
		if (ref) args.push("--branch", ref);
		return execClone(args, localPath, timeoutMs, signal);
	}
	showGhHint();
	const args = ["git", "clone", "--depth", "1", "--single-branch"];
	if (ref) args.push("--branch", ref);
	args.push(`https://github.com/${owner}/${repo}.git`, localPath);
	return execClone(args, localPath, timeoutMs, signal);
}

async function awaitCachedClone(cached: CachedClone, url: string, owner: string, repo: string, info: GitHubUrlInfo, signal?: AbortSignal): Promise<ExtractedContent | null> {
	if (signal?.aborted) return null;
	const result = await cached.clonePromise;
	if (signal?.aborted) return null;
	if (result) {
		const content = generateContent(result, info);
		const title = info.path ? `${owner}/${repo} - ${info.path}` : `${owner}/${repo}`;
		return { url, title, content, error: null };
	}
	return fetchViaApi(url, owner, repo, info);
}

export async function extractGitHub(url: string, signal?: AbortSignal, forceClone?: boolean): Promise<ExtractedContent | null> {
	const info = parseGitHubUrl(url);
	if (!info) return null;
	if (signal?.aborted) return null;

	const config = loadGitHubConfig();
	if (!config.enabled) return null;

	const { owner, repo } = info;
	const key = cacheKey(owner, repo, info.ref);
	const cached = cloneCache.get(key);
	if (cached) return awaitCachedClone(cached, url, owner, repo, info, signal);

	if (info.refIsFullSha) {
		if (signal?.aborted) return null;
		return fetchViaApi(url, owner, repo, info, "Note: Commit SHA URLs use the GitHub API instead of cloning.");
	}

	const activityId = activityMonitor.logStart({ type: "fetch", url: `github.com/${owner}/${repo}` });

	if (!forceClone) {
		const sizeKB = await checkRepoSize(owner, repo);
		if (signal?.aborted) { activityMonitor.logComplete(activityId, 0); return null; }
		if (sizeKB !== null) {
			const sizeMB = sizeKB / 1024;
			if (sizeMB > config.maxRepoSizeMB) {
				if (signal?.aborted) { activityMonitor.logComplete(activityId, 0); return null; }
				const sizeNote = `Note: Repository is ${Math.round(sizeMB)}MB (threshold: ${config.maxRepoSizeMB}MB). ` +
					`Showing API-fetched content instead. Use forceClone: true to clone the full repo.`;
				const apiView = await fetchViaApi(url, owner, repo, info, sizeNote);
				if (apiView) { activityMonitor.logComplete(activityId, 200); return apiView; }
				activityMonitor.logError(activityId, "api fallback unavailable for oversized repository");
				return null;
			}
		}
	}

	if (signal?.aborted) { activityMonitor.logComplete(activityId, 0); return null; }

	const cachedAfterSizeCheck = cloneCache.get(key);
	if (cachedAfterSizeCheck) {
		const cachedResult = await awaitCachedClone(cachedAfterSizeCheck, url, owner, repo, info, signal);
		if (signal?.aborted) activityMonitor.logComplete(activityId, 0);
		else if (cachedResult) activityMonitor.logComplete(activityId, 200);
		else activityMonitor.logError(activityId, "clone failed");
		return cachedResult;
	}

	const clonePromise = cloneRepo(owner, repo, info.ref, config, signal);
	const localPath = cloneDir(config, owner, repo, info.ref);
	cloneCache.set(key, { localPath, clonePromise });

	const result = await clonePromise;
	if (signal?.aborted) { if (!result) cloneCache.delete(key); activityMonitor.logComplete(activityId, 0); return null; }

	if (!result) {
		cloneCache.delete(key);
		if (signal?.aborted) { activityMonitor.logComplete(activityId, 0); return null; }
		const apiFallback = await fetchViaApi(url, owner, repo, info);
		if (apiFallback) { activityMonitor.logComplete(activityId, 200); return apiFallback; }
		activityMonitor.logError(activityId, "clone and API fallback failed");
		return null;
	}

	activityMonitor.logComplete(activityId, 200);
	const content = generateContent(result, info);
	const title = info.path ? `${owner}/${repo} - ${info.path}` : `${owner}/${repo}`;
	return { url, title, content, error: null };
}

export function clearCloneCache(): void {
	for (const entry of cloneCache.values()) {
		try { rmSync(entry.localPath, { recursive: true, force: true }); } catch {}
	}
	cloneCache.clear();
	cachedConfig = null;
}
