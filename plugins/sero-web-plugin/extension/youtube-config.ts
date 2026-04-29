import { existsSync, readFileSync } from "node:fs";
import { getWebConfigPath } from "./paths.js";

const DEFAULTS: YouTubeConfig = {
	enabled: true,
	preferredModel: "gemini-3-flash-preview",
};

const YOUTUBE_REGEX =
	/(?:(?:www\.|m\.)?youtube\.com\/(?:watch\?.*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export interface YouTubeConfig {
	enabled: boolean;
	preferredModel: string;
}

let cachedConfig: YouTubeConfig | null = null;

function normalizePreferredModel(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : fallback;
}

function normalizeEnabled(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

export function loadYouTubeConfig(): YouTubeConfig {
	if (cachedConfig) return cachedConfig;
	const configPath = getWebConfigPath();
	if (!existsSync(configPath)) {
		cachedConfig = { ...DEFAULTS };
		return cachedConfig;
	}

	const rawText = readFileSync(configPath, "utf-8");
	let raw: { youtube?: { enabled?: boolean; preferredModel?: string } };
	try {
		raw = JSON.parse(rawText) as { youtube?: { enabled?: boolean; preferredModel?: string } };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath}: ${message}`);
	}

	const youtubeConfig = raw.youtube ?? {};
	cachedConfig = {
		enabled: normalizeEnabled(youtubeConfig.enabled, DEFAULTS.enabled),
		preferredModel: normalizePreferredModel(youtubeConfig.preferredModel, DEFAULTS.preferredModel),
	};
	return cachedConfig;
}

export function isYouTubeURL(url: string): { isYouTube: boolean; videoId: string | null } {
	try {
		const parsed = new URL(url);
		if (parsed.pathname === "/playlist") {
			return { isYouTube: false, videoId: null };
		}
	} catch {
	}

	const match = url.match(YOUTUBE_REGEX);
	if (!match) return { isYouTube: false, videoId: null };
	return { isYouTube: true, videoId: match[1] };
}

export function isYouTubeEnabled(): boolean {
	return loadYouTubeConfig().enabled;
}
