import type { SearchOptions, SearchResult } from "./perplexity.js";

export function buildSearchPrompt(query: string, options: SearchOptions): string {
	let prompt =
		"Search the web and answer the following question. Include source URLs for your claims.\n" +
		"Format your response as:\n1. A direct answer to the question\n2. Cited sources as markdown links\n\n" +
		`Question: ${query}`;

	if (options.recencyFilter) {
		const labels: Record<string, string> = {
			day: "past 24 hours",
			week: "past week",
			month: "past month",
			year: "past year",
		};
		prompt += `\n\nOnly include results from the ${labels[options.recencyFilter]}.`;
	}

	if (options.domainFilter?.length) {
		const includes = options.domainFilter.filter((domain) => !domain.startsWith("-"));
		const excludes = options.domainFilter.filter((domain) => domain.startsWith("-")).map((domain) => domain.slice(1));
		if (includes.length) prompt += `\n\nOnly cite sources from: ${includes.join(", ")}`;
		if (excludes.length) prompt += `\n\nDo not cite sources from: ${excludes.join(", ")}`;
	}

	return prompt;
}

export function extractSourceUrls(markdown: string): SearchResult[] {
	const results: SearchResult[] = [];
	const seen = new Set<string>();
	const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
	for (const match of markdown.matchAll(linkRegex)) {
		const url = match[2];
		if (seen.has(url)) continue;
		seen.add(url);
		results.push({ title: match[1], url, snippet: "" });
	}
	return results;
}
