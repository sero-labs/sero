import { existsSync, readFileSync } from "node:fs";
import { getWebConfigPath } from "./paths.js";

export interface GeminiWebConfig {
	chromeProfile?: string;
}

let cachedConfig: GeminiWebConfig | null = null;

export function normalizeChromeProfile(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

export function loadGeminiWebConfig(): GeminiWebConfig {
	if (cachedConfig) return cachedConfig;
	const configPath = getWebConfigPath();
	if (!existsSync(configPath)) {
		cachedConfig = {};
		return cachedConfig;
	}

	const rawText = readFileSync(configPath, "utf-8");
	let raw: { chromeProfile?: unknown };
	try {
		raw = JSON.parse(rawText) as { chromeProfile?: unknown };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${configPath}: ${message}`);
	}

	cachedConfig = {
		chromeProfile: normalizeChromeProfile(raw.chromeProfile),
	};
	return cachedConfig;
}

export function getChromeProfileFromConfig(): string | undefined {
	return loadGeminiWebConfig().chromeProfile;
}
