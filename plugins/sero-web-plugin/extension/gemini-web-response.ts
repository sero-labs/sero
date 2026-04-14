export interface GeminiWebResult {
	text: string;
	errorCode?: number;
	errorMessage?: string;
}

export function buildFReqPayload(
	prompt: string,
	uploaded: Array<{ id: string; name: string }>,
): string {
	const promptPayload =
		uploaded.length > 0
			? [prompt, 0, null, uploaded.map((file) => [[file.id, 1]])]
			: [prompt];
	const innerList = [promptPayload, null, null];
	return JSON.stringify([null, JSON.stringify(innerList)]);
}

export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function getNestedValue(value: unknown, pathParts: number[]): unknown {
	let current: unknown = value;
	for (const part of pathParts) {
		if (current == null) return undefined;
		if (!Array.isArray(current)) return undefined;
		current = (current as unknown[])[part];
	}
	return current;
}

export function trimJsonEnvelope(text: string): string {
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start === -1 || end === -1 || end <= start) {
		throw new Error("Gemini response did not contain a JSON payload.");
	}
	return text.slice(start, end + 1);
}

export function extractErrorCode(responseJson: unknown): number | undefined {
	const code = getNestedValue(responseJson, [0, 5, 2, 0, 1, 0]);
	return typeof code === "number" && code >= 0 ? code : undefined;
}

export function isModelUnavailable(errorCode: number | undefined): boolean {
	return errorCode === 1052;
}

export function parseStreamGenerateResponse(rawText: string): GeminiWebResult {
	const responseJson = JSON.parse(trimJsonEnvelope(rawText));
	const errorCode = extractErrorCode(responseJson);

	const parts = Array.isArray(responseJson) ? responseJson : [];
	let body: unknown = null;

	for (let index = 0; index < parts.length; index++) {
		const partBody = getNestedValue(parts[index], [2]);
		if (!partBody || typeof partBody !== "string") continue;
		try {
			const parsed = JSON.parse(partBody);
			const candidateList = getNestedValue(parsed, [4]);
			if (Array.isArray(candidateList) && candidateList.length > 0) {
				body = parsed;
				break;
			}
		} catch {
		}
	}

	const candidateList = getNestedValue(body, [4]);
	const firstCandidate = Array.isArray(candidateList) ? (candidateList as unknown[])[0] : undefined;
	const textRaw = getNestedValue(firstCandidate, [1, 0]) as string | undefined;

	let text = textRaw ?? "";
	if (/^http:\/\/googleusercontent\.com\/card_content\/\d+/.test(text)) {
		const alt = getNestedValue(firstCandidate, [22, 0]) as string | undefined;
		if (alt) text = alt;
	}

	return { text, errorCode };
}
