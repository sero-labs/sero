import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_SERO_HOME = join(homedir(), ".sero-ui");
const LEGACY_PI_DIR = join(homedir(), ".pi");
const APP_CONFIG_DIR = ["apps", "web"] as const;

function normalizePath(value: string | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function getSeroHome(): string | null {
	return normalizePath(process.env.SERO_HOME);
}

function getLegacyWebConfigDir(): string {
	return LEGACY_PI_DIR;
}

function resolveExistingPath(canonicalPath: string, legacyPath: string): string {
	if (existsSync(canonicalPath)) return canonicalPath;
	if (existsSync(legacyPath)) return legacyPath;
	return canonicalPath;
}

export function getWebConfigDir(): string {
	return join(getSeroHome() ?? DEFAULT_SERO_HOME, ...APP_CONFIG_DIR);
}

export function getWebConfigPath(): string {
	return resolveExistingPath(
		join(getWebConfigDir(), "web-search.json"),
		join(getLegacyWebConfigDir(), "web-search.json"),
	);
}

export function getExaUsageReadPath(): string {
	return resolveExistingPath(
		join(getWebConfigDir(), "exa-usage.json"),
		join(getLegacyWebConfigDir(), "exa-usage.json"),
	);
}

export function getExaUsagePath(): string {
	return join(getWebConfigDir(), "exa-usage.json");
}
