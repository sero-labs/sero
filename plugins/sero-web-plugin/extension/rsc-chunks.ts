export interface ParsedRscChunks {
	title: string;
	chunkIds: string[];
	getParsedChunk(id: string): unknown | null;
}

export function parseRscChunks(html: string): ParsedRscChunks | null {
	if (!html.includes("self.__next_f.push")) {
		return null;
	}

	const chunkMap = new Map<string, string>();
	const scriptRegex = /<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;

	for (const match of html.matchAll(scriptRegex)) {
		let content: string;
		try {
			content = JSON.parse('"' + match[1] + '"');
		} catch {
			continue;
		}

		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			const colonIndex = line.indexOf(":");
			if (colonIndex <= 0 || colonIndex > 4) continue;
			const id = line.slice(0, colonIndex);
			if (!/^[0-9a-f]+$/i.test(id)) continue;
			const payload = line.slice(colonIndex + 1);
			if (!payload) continue;
			const existing = chunkMap.get(id);
			if (!existing || payload.length > existing.length) {
				chunkMap.set(id, payload);
			}
		}
	}

	if (chunkMap.size === 0) return null;

	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
	const title = titleMatch?.[1]?.split("|")[0]?.trim() || "";
	const parsedCache = new Map<string, unknown>();

	function getParsedChunk(id: string): unknown | null {
		if (parsedCache.has(id)) return parsedCache.get(id) ?? null;

		const chunk = chunkMap.get(id);
		if (!chunk || !chunk.startsWith("[")) {
			parsedCache.set(id, null);
			return null;
		}

		try {
			const parsed = JSON.parse(chunk);
			parsedCache.set(id, parsed);
			return parsed;
		} catch {
			parsedCache.set(id, null);
			return null;
		}
	}

	return {
		title,
		chunkIds: Array.from(chunkMap.keys()),
		getParsedChunk,
	};
}
