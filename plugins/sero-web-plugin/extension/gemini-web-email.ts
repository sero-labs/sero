import type { CookieMap } from "./chrome-cookies.js";

export function buildCookieHeader(cookieMap: CookieMap): string {
	return Object.entries(cookieMap)
		.filter(([, value]) => typeof value === "string" && value.length > 0)
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");
}

export function extractEmailFromGeminiHtml(html: string): string | null {
	const patterns = [
		/"email"\s*:\s*"([^"]+)"/,
		/"displayEmail"\s*:\s*"([^"]+)"/,
		/"identifier"\s*:\s*"([^"]+)"/,
		/"defaultEmail"\s*:\s*"([^"]+)"/,
		/"gaiaIdentifier"\s*:\s*"([^"]+)"/,
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		const email = normalizeEmail(match?.[1]);
		if (email && isUserEmail(email)) return email;
	}

	// Don't use a broad raw-HTML email scan here — it picks up Google-internal
	// addresses from embedded scripts and footer chrome.
	return null;
}

export function extractEmailFromListAccounts(text: string): string | null {
	const trimmed = text.replace(/^\)\]\}'\s*/, "");
	try {
		return findUserEmailInValue(JSON.parse(trimmed));
	} catch {
		return null;
	}
}

export function findFirstUserEmail(text: string): string | null {
	const normalized = decodeEmailEscapes(text);
	const re = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(normalized)) !== null) {
		if (isUserEmail(match[0])) return match[0];
	}
	return null;
}

function isUserEmail(email: string): boolean {
	const lower = email.toLowerCase();
	if (lower.endsWith("@google.com")) return false;
	if (lower.endsWith("@chromium.org")) return false;
	if (lower.endsWith("@googlers.com")) return false;
	return true;
}

function findUserEmailInValue(value: unknown): string | null {
	if (typeof value === "string") {
		const email = normalizeEmail(value);
		return email && isUserEmail(email) ? email : null;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const email = findUserEmailInValue(item);
			if (email) return email;
		}
		return null;
	}
	if (value && typeof value === "object") {
		for (const item of Object.values(value as Record<string, unknown>)) {
			const email = findUserEmailInValue(item);
			if (email) return email;
		}
	}
	return null;
}

function normalizeEmail(value: string | undefined): string | null {
	if (!value) return null;
	const normalized = decodeEmailEscapes(value.trim());
	return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalized) ? normalized : null;
}

function decodeEmailEscapes(value: string): string {
	return value
		.replace(/\\u0040/gi, "@")
		.replace(/\\x40/gi, "@")
		.replace(/&#64;/gi, "@")
		.replace(/&commat;/gi, "@")
		.replace(/\\"/g, "\"")
		.replace(/\\\\/g, "\\");
}
