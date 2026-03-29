import { homedir } from "node:os";
import { join } from "node:path";

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

export function getWebConfigDir(): string {
	const seroHome = getSeroHome();
	if (seroHome) return join(seroHome, ...APP_CONFIG_DIR);
	return LEGACY_PI_DIR;
}

export function getWebConfigPath(): string {
	return join(getWebConfigDir(), "web-search.json");
}

export function getExaUsagePath(): string {
	return join(getWebConfigDir(), "exa-usage.json");
}
