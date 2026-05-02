import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { API_BASE } from "./gemini-api.js";
import type { VideoFileInfo } from "./video-config.js";

const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta";

export async function uploadVideoToGeminiFilesApi(
	info: VideoFileInfo,
	apiKey: string,
	signal?: AbortSignal,
): Promise<{ name: string; uri: string }> {
	const displayName = basename(info.absolutePath);

	const initRes = await fetch(`${UPLOAD_BASE}/files`, {
		method: "POST",
		headers: {
			"x-goog-api-key": apiKey,
			"X-Goog-Upload-Protocol": "resumable",
			"X-Goog-Upload-Command": "start",
			"X-Goog-Upload-Header-Content-Length": String(info.sizeBytes),
			"X-Goog-Upload-Header-Content-Type": info.mimeType,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ file: { display_name: displayName } }),
		signal,
	});

	if (!initRes.ok) {
		const text = await initRes.text();
		throw new Error(`File upload init failed: ${initRes.status} (${text.slice(0, 200)})`);
	}

	const uploadUrl = initRes.headers.get("x-goog-upload-url");
	if (!uploadUrl) throw new Error("No upload URL in response headers");

	const fileData = await readFile(info.absolutePath);
	const uploadRes = await fetch(uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Length": String(info.sizeBytes),
			"X-Goog-Upload-Offset": "0",
			"X-Goog-Upload-Command": "upload, finalize",
		},
		body: fileData,
		signal,
	});

	if (!uploadRes.ok) {
		const text = await uploadRes.text();
		throw new Error(`File upload failed: ${uploadRes.status} (${text.slice(0, 200)})`);
	}

	const result = (await uploadRes.json()) as { file: { name: string; uri: string } };
	return result.file;
}

export async function pollGeminiFileState(
	fileName: string,
	apiKey: string,
	signal?: AbortSignal,
	timeoutMs: number = 120000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (signal?.aborted) throw new Error("Aborted");

		const res = await fetch(`${API_BASE}/${fileName}?key=${apiKey}`, { signal });
		if (!res.ok) throw new Error(`File state check failed: ${res.status}`);

		const data = (await res.json()) as { state: string };
		if (data.state === "ACTIVE") return;
		if (data.state === "FAILED") throw new Error("File processing failed");

		await new Promise((resolve) => setTimeout(resolve, 5000));
	}

	throw new Error("File processing timed out");
}

export function deleteGeminiFile(fileName: string, apiKey: string): void {
	fetch(`${API_BASE}/${fileName}?key=${apiKey}`, { method: "DELETE" }).catch((err) => {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Failed to delete Gemini file ${fileName}: ${message}`);
	});
}
