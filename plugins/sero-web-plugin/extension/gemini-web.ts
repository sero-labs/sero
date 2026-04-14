import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { type CookieMap, getGoogleCookies } from "./chrome-cookies.js";
import { getChromeProfileFromConfig, normalizeChromeProfile } from "./gemini-web-config.js";
import {
	buildCookieHeader,
	extractEmailFromGeminiHtml,
	extractEmailFromListAccounts,
	findFirstUserEmail,
} from "./gemini-web-email.js";
import {
	buildFReqPayload,
	isModelUnavailable,
	parseStreamGenerateResponse,
	withTimeout,
	type GeminiWebResult,
} from "./gemini-web-response.js";

const GEMINI_APP_URL = "https://gemini.google.com/app";
const GEMINI_STREAM_GENERATE_URL =
	"https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
const GEMINI_UPLOAD_URL = "https://content-push.googleapis.com/upload";
const GEMINI_UPLOAD_PUSH_ID = "feeds/mcudyrk2a4khkz";
const GOOGLE_LIST_ACCOUNTS_URL =
	"https://accounts.google.com/ListAccounts?gpsia=1&source=ChromiumBrowser&laf=b64bin&json=standard";

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MODEL_HEADER_NAME = "x-goog-ext-525001261-jspb";
const MODEL_HEADERS: Record<string, string> = {
	"gemini-3-pro": '[1,null,null,null,"9d8ca3786ebdfbea",null,null,0,[4]]',
	"gemini-2.5-pro": '[1,null,null,null,"4af6c7f5da75d65d",null,null,0,[4]]',
	"gemini-2.5-flash": '[1,null,null,null,"9ec249fc9ad08861",null,null,0,[4]]',
};

const REQUIRED_COOKIES = ["__Secure-1PSID", "__Secure-1PSIDTS"];

export interface GeminiWebOptions {
	youtubeUrl?: string;
	model?: string;
	files?: string[];
	signal?: AbortSignal;
	timeoutMs?: number;
}

export async function isGeminiWebAvailable(chromeProfile?: string): Promise<CookieMap | null> {
	const result = await getGoogleCookies({
		profile: normalizeChromeProfile(chromeProfile) ?? getChromeProfileFromConfig(),
		requiredCookies: REQUIRED_COOKIES,
	});
	if (!result) return null;
	return result.cookies;
}

export async function getActiveGoogleEmail(cookies: CookieMap): Promise<string | null> {
	const cookieHeader = buildCookieHeader(cookies);
	if (!cookieHeader) {
		console.error("[sero-web] getActiveGoogleEmail: no cookie header");
		return null;
	}

	try {
		const html = await fetchWithCookieRedirects(
			GEMINI_APP_URL,
			cookieHeader,
			10,
			AbortSignal.timeout(10000),
		);
		const email = extractEmailFromGeminiHtml(html);
		if (email) return email;
	} catch (err) {
		console.error(
			`[sero-web] getActiveGoogleEmail: Gemini fetch failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	try {
		const response = await fetchWithCookieRedirects(
			GOOGLE_LIST_ACCOUNTS_URL,
			cookieHeader,
			10,
			AbortSignal.timeout(10000),
		);
		const email = extractEmailFromListAccounts(response);
		if (email) return email;
		console.error(
			`[sero-web] getActiveGoogleEmail: ListAccounts (${response.length} chars) — no user email found. Preview: ${response.slice(0, 500)}`,
		);
	} catch (err) {
		console.error(
			`[sero-web] getActiveGoogleEmail: ListAccounts failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	try {
		const html = await fetchWithCookieRedirects(
			GEMINI_APP_URL,
			cookieHeader,
			10,
			AbortSignal.timeout(10000),
		);
		const email = findFirstUserEmail(html);
		if (email) return email;
	} catch {
		// Already logged above.
	}

	return null;
}

export async function queryWithCookies(
	prompt: string,
	cookieMap: CookieMap,
	options: GeminiWebOptions = {},
): Promise<string> {
	const model = options.model && MODEL_HEADERS[options.model] ? options.model : "gemini-2.5-flash";
	const timeoutMs = options.timeoutMs ?? 120000;
	const fullPrompt = options.youtubeUrl ? `${prompt}\n\nYouTube video: ${options.youtubeUrl}` : prompt;

	const result = await runGeminiWebOnce(fullPrompt, cookieMap, model, options.files, timeoutMs, options.signal);
	if (isModelUnavailable(result.errorCode) && model !== "gemini-2.5-flash") {
		const fallback = await runGeminiWebOnce(
			fullPrompt,
			cookieMap,
			"gemini-2.5-flash",
			options.files,
			timeoutMs,
			options.signal,
		);
		if (fallback.errorMessage) throw new Error(fallback.errorMessage);
		if (!fallback.text) throw new Error("Gemini Web returned empty response (fallback model)");
		return fallback.text;
	}

	if (result.errorMessage) throw new Error(result.errorMessage);
	if (!result.text) throw new Error("Gemini Web returned empty response");
	return result.text;
}

async function runGeminiWebOnce(
	prompt: string,
	cookieMap: CookieMap,
	model: string,
	files: string[] | undefined,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<GeminiWebResult> {
	const effectiveSignal = withTimeout(signal, timeoutMs);
	const cookieHeader = buildCookieHeader(cookieMap);
	const accessToken = await fetchAccessToken(cookieHeader, effectiveSignal);
	const uploaded: Array<{ id: string; name: string }> = [];

	if (files) {
		for (const filePath of files) {
			uploaded.push(await uploadFile(filePath, cookieHeader, effectiveSignal));
		}
	}

	const params = new URLSearchParams();
	params.set("at", accessToken);
	params.set("f.req", buildFReqPayload(prompt, uploaded));

	const res = await fetch(GEMINI_STREAM_GENERATE_URL, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded;charset=utf-8",
			host: "gemini.google.com",
			origin: "https://gemini.google.com",
			referer: "https://gemini.google.com/",
			"x-same-domain": "1",
			"user-agent": USER_AGENT,
			cookie: cookieHeader,
			[MODEL_HEADER_NAME]: MODEL_HEADERS[model] ?? MODEL_HEADERS["gemini-2.5-flash"],
		},
		body: params.toString(),
		signal: effectiveSignal,
	});

	const rawText = await res.text();
	if (!res.ok) {
		return { text: "", errorMessage: `Gemini request failed: ${res.status}` };
	}

	try {
		return parseStreamGenerateResponse(rawText);
	} catch (err) {
		return {
			text: "",
			errorMessage: err instanceof Error ? err.message : String(err),
		};
	}
}

async function fetchAccessToken(cookieHeader: string, signal: AbortSignal): Promise<string> {
	const html = await fetchWithCookieRedirects(GEMINI_APP_URL, cookieHeader, 10, signal);
	for (const key of ["SNlM0e", "thykhd"]) {
		const match = html.match(new RegExp(`"${key}":"(.*?)"`));
		if (match?.[1]) return match[1];
	}

	throw new Error(
		"Unable to authenticate with Gemini. Make sure you're signed into gemini.google.com in a supported Chromium-based browser.",
	);
}

async function fetchWithCookieRedirects(
	url: string,
	cookieHeader: string,
	maxRedirects: number,
	signal: AbortSignal,
): Promise<string> {
	let current = url;
	for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
		const res = await fetch(current, {
			headers: { "user-agent": USER_AGENT, cookie: cookieHeader },
			redirect: "manual",
			signal,
		});
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get("location");
			if (location) {
				current = new URL(location, current).toString();
				continue;
			}
		}
		return await res.text();
	}
	throw new Error(`Too many redirects (>${maxRedirects})`);
}

async function uploadFile(
	filePath: string,
	cookieHeader: string,
	signal: AbortSignal,
): Promise<{ id: string; name: string }> {
	const data = readFileSync(filePath);
	const fileName = basename(filePath);
	const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
	const header =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
		"Content-Type: application/octet-stream\r\n\r\n";
	const footer = `\r\n--${boundary}--\r\n`;

	const body = Buffer.concat([
		Buffer.from(header, "utf-8"),
		data,
		Buffer.from(footer, "utf-8"),
	]);

	const res = await fetch(GEMINI_UPLOAD_URL, {
		method: "POST",
		headers: {
			"content-type": `multipart/form-data; boundary=${boundary}`,
			"push-id": GEMINI_UPLOAD_PUSH_ID,
			"user-agent": USER_AGENT,
			cookie: cookieHeader,
		},
		body,
		signal,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`File upload failed: ${res.status} (${text.slice(0, 200)})`);
	}

	return { id: await res.text(), name: fileName };
}
