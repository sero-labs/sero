// chrome-cookies.ts — Chromium-based browser cookie extraction for Gemini Web.
// Based on pi-web-access with fixes from kevinQTruong/pi-web-access PR:
//   - Profile auto-discovery (scans all dirs with Cookies files, sorted)
//   - Preflight cookie-name check (skips profiles that lack required cookies
//     BEFORE prompting for Keychain password)
//   - Password caching (avoids repeated Keychain prompts)
//   - Uses better-sqlite3 instead of node:sqlite (Electron compatibility)

import { execFile } from "node:child_process";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir, homedir, platform } from "node:os";
import { join } from "node:path";

export type CookieMap = Record<string, string>;

interface BrowserConfig {
	name: string;
	baseDir: string;
	keychainService?: string;
	keychainAccount?: string;
	secretToolApp?: string;
}

const GOOGLE_ORIGINS = [
	"https://gemini.google.com",
	"https://accounts.google.com",
	"https://www.google.com",
];

const ALL_COOKIE_NAMES = new Set([
	"__Secure-1PSID", "__Secure-1PSIDTS", "__Secure-1PSIDCC", "__Secure-1PAPISID",
	"NID", "AEC", "SOCS", "__Secure-BUCKET", "__Secure-ENID",
	"SID", "HSID", "SSID", "APISID", "SAPISID",
	"__Secure-3PSID", "__Secure-3PSIDTS", "__Secure-3PAPISID", "SIDCC",
]);

const MACOS_BROWSER_CONFIGS: BrowserConfig[] = [
	{ name: "Helium", baseDir: "Library/Application Support/net.imput.helium", keychainService: "Helium Storage Key", keychainAccount: "Helium" },
	{ name: "Chrome", baseDir: "Library/Application Support/Google/Chrome", keychainService: "Chrome Safe Storage", keychainAccount: "Chrome" },
	{ name: "Arc", baseDir: "Library/Application Support/Arc/User Data", keychainService: "Arc Safe Storage", keychainAccount: "Arc" },
];

const LINUX_BROWSER_CONFIGS: BrowserConfig[] = [
	{ name: "Chromium", baseDir: ".config/chromium", secretToolApp: "chromium" },
	{ name: "Chrome", baseDir: ".config/google-chrome", secretToolApp: "chrome" },
];

const passwordCache = new Map<string, string>();

// ── Public API ─────────────────────────────────────────────

export async function getGoogleCookies(
	options?: { profile?: string; requiredCookies?: string[] },
): Promise<{ cookies: CookieMap; warnings: string[] } | null> {
	const currentPlatform = platform();
	const configs = currentPlatform === "darwin" ? MACOS_BROWSER_CONFIGS
		: currentPlatform === "linux" ? LINUX_BROWSER_CONFIGS : [];
	if (configs.length === 0) return null;

	const warningSet = new Set<string>();
	const requestedProfile = options?.profile?.trim() || undefined;
	const requiredCookies = options?.requiredCookies?.filter(Boolean);
	const hosts = GOOGLE_ORIGINS.map((origin) => new URL(origin).hostname);

	for (const config of configs) {
		const profiles = requestedProfile ? [requestedProfile] : listBrowserProfiles(config);
		for (const profile of profiles) {
			const cookiesPath = join(homedir(), config.baseDir, profile, "Cookies");
			if (!existsSync(cookiesPath)) continue;

			const tempDir = mkdtempSync(join(tmpdir(), "pi-chrome-cookies-"));
			try {
				const tempDb = join(tempDir, "Cookies");
				copyFileSync(cookiesPath, tempDb);
				copySidecar(cookiesPath, tempDb, "-wal");
				copySidecar(cookiesPath, tempDb, "-shm");

				// Preflight: check if this profile has the required cookies
				// BEFORE prompting for the Keychain password.
				if (requiredCookies?.length) {
					const hasRequired = hasCookieNames(tempDb, hosts, requiredCookies);
					if (!hasRequired) continue;
				}

				const password = await readBrowserPassword(config, currentPlatform);
				if (!password) {
					warningSet.add(`Could not read ${config.name} cookie encryption password`);
					continue;
				}

				const key = pbkdf2Sync(password, "saltysalt", currentPlatform === "darwin" ? 1003 : 1, 16, "sha1");
				const metaVersion = readMetaVersion(tempDb);
				const stripHash = metaVersion >= 24;
				const rows = queryCookieRows(tempDb, hosts, ALL_COOKIE_NAMES);
				if (!rows) {
					warningSet.add(`Failed to query ${config.name} cookie database`);
					continue;
				}

				const cookies: CookieMap = {};
				for (const row of rows) {
					const name = row.name as string;
					if (!ALL_COOKIE_NAMES.has(name) || cookies[name]) continue;
					let value = typeof row.value === "string" && row.value.length > 0 ? row.value : null;
					if (!value) {
						const encrypted = row.encrypted_value;
						if (encrypted instanceof Uint8Array) value = decryptCookieValue(encrypted, key, stripHash);
					}
					if (value) cookies[name] = value;
				}

				if (requiredCookies?.length && !requiredCookies.every((n) => Boolean(cookies[n]))) continue;
				return { cookies, warnings: [...warningSet] };
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		}
	}
	return null;
}

// ── Profile discovery ──────────────────────────────────────

function listBrowserProfiles(config: BrowserConfig): string[] {
	const basePath = join(homedir(), config.baseDir);
	if (!existsSync(basePath)) return ["Default"];

	const profiles = new Set<string>();
	try {
		for (const entry of readdirSync(basePath, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			if (existsSync(join(basePath, entry.name, "Cookies"))) profiles.add(entry.name);
		}
	} catch { /* ignore */ }

	const sorted = [...profiles];
	if (sorted.length === 0) return ["Default"];
	sorted.sort(compareProfileNames);
	return sorted;
}

function compareProfileNames(a: string, b: string): number {
	const ak = profileSortKey(a), bk = profileSortKey(b);
	if (ak.priority !== bk.priority) return ak.priority - bk.priority;
	if (ak.index !== bk.index) return ak.index - bk.index;
	return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function profileSortKey(name: string): { priority: number; index: number } {
	if (name === "Default") return { priority: 0, index: 0 };
	const profileMatch = /^Profile\s+(\d+)$/i.exec(name);
	if (profileMatch) return { priority: 1, index: Number(profileMatch[1]) };
	return { priority: 2, index: Number.MAX_SAFE_INTEGER };
}

// ── Crypto ─────────────────────────────────────────────────

function decryptCookieValue(encrypted: Uint8Array, key: Buffer, stripHash: boolean): string | null {
	const buf = Buffer.from(encrypted);
	if (buf.length < 3) return null;
	if (!/^v\d\d$/.test(buf.subarray(0, 3).toString("utf8"))) return null;
	const ciphertext = buf.subarray(3);
	if (!ciphertext.length) return "";
	try {
		const iv = Buffer.alloc(16, 0x20);
		const decipher = createDecipheriv("aes-128-cbc", key, iv);
		decipher.setAutoPadding(false);
		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		const unpadded = removePkcs7Padding(plaintext);
		const bytes = stripHash && unpadded.length >= 32 ? unpadded.subarray(32) : unpadded;
		const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		let i = 0;
		while (i < decoded.length && decoded.charCodeAt(i) < 0x20) i++;
		return decoded.slice(i);
	} catch { return null; }
}

function removePkcs7Padding(buf: Buffer): Buffer {
	if (!buf.length) return buf;
	const padding = buf[buf.length - 1];
	if (!padding || padding > 16) return buf;
	return buf.subarray(0, buf.length - padding);
}

// ── Password reading (with cache) ──────────────────────────

function readBrowserPassword(config: BrowserConfig, currentPlatform: ReturnType<typeof platform>): Promise<string | null> {
	if (currentPlatform === "darwin") {
		if (!config.keychainAccount || !config.keychainService) return Promise.resolve(null);
		return readKeychainPassword(config.keychainAccount, config.keychainService);
	}
	if (currentPlatform === "linux") return readLinuxPassword(config.secretToolApp);
	return Promise.resolve(null);
}

function readKeychainPassword(account: string, service: string): Promise<string | null> {
	const cacheKey = `darwin:${account}:${service}`;
	const cached = passwordCache.get(cacheKey);
	if (cached) return Promise.resolve(cached);

	return new Promise((resolve) => {
		execFile("security", ["find-generic-password", "-w", "-a", account, "-s", service],
			{ timeout: 30000 },
			(err, stdout) => {
				if (err) { resolve(null); return; }
				const password = stdout.trim() || null;
				if (password) passwordCache.set(cacheKey, password);
				resolve(password);
			},
		);
	});
}

function readLinuxPassword(secretToolApp: string | undefined): Promise<string> {
	const cacheKey = `linux:${secretToolApp ?? "peanuts"}`;
	const cached = passwordCache.get(cacheKey);
	if (cached) return Promise.resolve(cached);
	if (!secretToolApp) { passwordCache.set(cacheKey, "peanuts"); return Promise.resolve("peanuts"); }
	return new Promise((resolve) => {
		execFile("secret-tool", ["lookup", "application", secretToolApp],
			{ timeout: 5000 },
			(err, stdout) => {
				const password = err ? "peanuts" : (stdout.trim() || "peanuts");
				passwordCache.set(cacheKey, password);
				resolve(password);
			},
		);
	});
}

// ── SQLite via better-sqlite3 (Electron-compatible) ────────

type BetterSqlite3 = typeof import("better-sqlite3");
let betterSqlite3: BetterSqlite3 | null = null;

function loadSqlite(): BetterSqlite3 | null {
	if (betterSqlite3) return betterSqlite3;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		betterSqlite3 = require("better-sqlite3") as BetterSqlite3;
		return betterSqlite3;
	} catch { return null; }
}

function readMetaVersion(dbPath: string): number {
	const Database = loadSqlite();
	if (!Database) return 0;
	const db = new Database(dbPath, { readonly: true, fileMustExist: true });
	try {
		const row = db.prepare("SELECT value FROM meta WHERE key = 'version'").get() as Record<string, unknown> | undefined;
		const val = row?.value;
		if (typeof val === "number") return Math.floor(val);
		if (typeof val === "bigint") return Number(val);
		if (typeof val === "string") return parseInt(val, 10) || 0;
		return 0;
	} catch { return 0; } finally { db.close(); }
}

function hasCookieNames(dbPath: string, hosts: string[], cookieNames: string[]): boolean {
	const Database = loadSqlite();
	if (!Database) return false;
	const where = buildCookieWhere(hosts, cookieNames);
	const db = new Database(dbPath, { readonly: true, fileMustExist: true });
	try {
		const rows = db.prepare(`SELECT DISTINCT name FROM cookies WHERE ${where}`).all() as Array<Record<string, unknown>>;
		const present = new Set(rows.map(r => r.name as string).filter(Boolean));
		return cookieNames.every(n => present.has(n));
	} catch { return false; } finally { db.close(); }
}

function queryCookieRows(dbPath: string, hosts: string[], cookieNames?: Iterable<string>): Array<Record<string, unknown>> | null {
	const Database = loadSqlite();
	if (!Database) return null;
	const where = buildCookieWhere(hosts, cookieNames);
	const db = new Database(dbPath, { readonly: true, fileMustExist: true });
	try {
		return db.prepare(`SELECT name, value, host_key, encrypted_value FROM cookies WHERE ${where} ORDER BY expires_utc DESC`).all() as Array<Record<string, unknown>>;
	} catch { return null; } finally { db.close(); }
}

function buildCookieWhere(hosts: string[], cookieNames?: Iterable<string>): string {
	const hostClauses: string[] = [];
	for (const host of hosts) {
		for (const candidate of expandHosts(host)) {
			const esc = candidate.replaceAll("'", "''");
			hostClauses.push(`host_key = '${esc}'`, `host_key = '.${esc}'`, `host_key LIKE '%.${esc}'`);
		}
	}
	let where = `(${hostClauses.join(" OR ")})`;
	const names = cookieNames ? [...cookieNames].filter(Boolean) : [];
	if (names.length > 0) where += ` AND name IN (${names.map(n => `'${n.replaceAll("'", "''")}'`).join(", ")})`;
	return where;
}

function expandHosts(host: string): string[] {
	const parts = host.split(".").filter(Boolean);
	if (parts.length <= 1) return [host];
	const candidates = new Set<string>();
	candidates.add(host);
	for (let i = 1; i <= parts.length - 2; i++) { const c = parts.slice(i).join("."); if (c) candidates.add(c); }
	return Array.from(candidates);
}

function copySidecar(srcDb: string, targetDb: string, suffix: string): void {
	const sidecar = `${srcDb}${suffix}`;
	if (!existsSync(sidecar)) return;
	try { copyFileSync(sidecar, `${targetDb}${suffix}`); } catch { /* ignore */ }
}
