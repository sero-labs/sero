import { existsSync, readFileSync } from "node:fs";
import { getWebConfigPath } from "./paths.js";

export type SearchProvider = "auto" | "perplexity" | "gemini" | "exa";

interface SearchConfig {
	searchProvider: SearchProvider;
	searchModel?: string;
}

let cachedSearchConfig: SearchConfig | null = null;

export function getSearchConfig(): SearchConfig {
	if (cachedSearchConfig) return cachedSearchConfig;
	const configPath = getWebConfigPath();
	if (!existsSync(configPath)) {
		cachedSearchConfig = { searchProvider: "auto", searchModel: undefined };
		return cachedSearchConfig;
	}

	const rawText = readFileSync(configPath, "utf-8");
	let raw: {
		searchProvider?: SearchProvider;
		provider?: SearchProvider;
		searchModel?: unknown;
	};
	try {
		raw = JSON.parse(rawText) as {
			searchProvider?: SearchProvider;
			provider?: SearchProvider;
			searchModel?: unknown;
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath}: ${message}`);
	}

	cachedSearchConfig = {
		searchProvider: normalizeSearchProvider(raw.searchProvider ?? raw.provider),
		searchModel: normalizeSearchModel(raw.searchModel),
	};
	return cachedSearchConfig;
}

function normalizeSearchModel(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function normalizeSearchProvider(value: unknown): SearchProvider {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	return normalized === "auto" || normalized === "perplexity" || normalized === "gemini" || normalized === "exa"
		? normalized
		: "auto";
}
