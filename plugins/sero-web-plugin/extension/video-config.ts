import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { getWebConfigPath } from "./paths.js";

const VIDEO_EXTENSIONS: Record<string, string> = {
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".avi": "video/x-msvideo",
	".mpeg": "video/mpeg",
	".mpg": "video/mpeg",
	".wmv": "video/x-ms-wmv",
	".flv": "video/x-flv",
	".3gp": "video/3gpp",
	".3gpp": "video/3gpp",
};

export interface VideoFileInfo {
	absolutePath: string;
	mimeType: string;
	sizeBytes: number;
}

interface VideoConfig {
	enabled: boolean;
	preferredModel: string;
	maxSizeMB: number;
}

const VIDEO_CONFIG_DEFAULTS: VideoConfig = {
	enabled: true,
	preferredModel: "gemini-3-flash-preview",
	maxSizeMB: 50,
};

let cachedVideoConfig: VideoConfig | null = null;

function normalizePreferredModel(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : fallback;
}

function normalizeEnabled(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function normalizeMaxSizeMB(value: unknown, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return value > 0 ? value : fallback;
}

export function loadVideoConfig(): VideoConfig {
	if (cachedVideoConfig) return cachedVideoConfig;
	const configPath = getWebConfigPath();
	if (!existsSync(configPath)) {
		cachedVideoConfig = { ...VIDEO_CONFIG_DEFAULTS };
		return cachedVideoConfig;
	}

	const rawText = readFileSync(configPath, "utf-8");
	let raw: { video?: { enabled?: boolean; preferredModel?: string; maxSizeMB?: number } };
	try {
		raw = JSON.parse(rawText) as { video?: { enabled?: boolean; preferredModel?: string; maxSizeMB?: number } };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath}: ${message}`);
	}

	const videoConfig = raw.video ?? {};
	cachedVideoConfig = {
		enabled: normalizeEnabled(videoConfig.enabled, VIDEO_CONFIG_DEFAULTS.enabled),
		preferredModel: normalizePreferredModel(videoConfig.preferredModel, VIDEO_CONFIG_DEFAULTS.preferredModel),
		maxSizeMB: normalizeMaxSizeMB(videoConfig.maxSizeMB, VIDEO_CONFIG_DEFAULTS.maxSizeMB),
	};
	return cachedVideoConfig;
}

export function getVideoFileInfo(input: string): VideoFileInfo | null {
	const config = loadVideoConfig();
	if (!config.enabled) return null;

	const isFilePath = input.startsWith("/") || input.startsWith("./") || input.startsWith("../") || input.startsWith("file://");
	if (!isFilePath) return null;

	let filePath = input;
	if (input.startsWith("file://")) {
		try {
			filePath = decodeURIComponent(new URL(input).pathname);
		} catch {
			return null;
		}
	}

	const ext = extname(filePath).toLowerCase();
	const mimeType = VIDEO_EXTENSIONS[ext];
	if (!mimeType) return null;

	const absolutePath = resolveFilePath(filePath);
	if (!absolutePath) return null;

	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(absolutePath);
	} catch {
		return null;
	}
	if (!stat.isFile()) return null;

	const maxBytes = config.maxSizeMB * 1024 * 1024;
	if (stat.size > maxBytes) return null;

	return { absolutePath, mimeType, sizeBytes: stat.size };
}

function resolveFilePath(filePath: string): string | null {
	const absolutePath = resolve(filePath);
	if (existsSync(absolutePath)) return absolutePath;

	const dir = dirname(absolutePath);
	const base = basename(absolutePath);
	if (!existsSync(dir)) return null;

	try {
		const normalizedBase = normalizeSpaces(base);
		const match = readdirSync(dir).find((entry) => normalizeSpaces(entry) === normalizedBase);
		return match ? join(dir, match) : null;
	} catch {
		return null;
	}
}

function normalizeSpaces(value: string): string {
	return value.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ");
}
