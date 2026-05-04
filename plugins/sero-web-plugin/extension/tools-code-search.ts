// tools-code-search.ts — code_search tool registration.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { executeCodeSearch } from "./code-search.js";

export function registerCodeSearchTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "code_search",
		label: "Code Search",
		description:
			"Search for code examples, documentation, and API references. Returns relevant code snippets and docs from GitHub, Stack Overflow, and official documentation.",
		parameters: Type.Object({
			query: Type.String({ description: "Programming question, API, library, or debugging topic" }),
			maxTokens: Type.Optional(Type.Integer({
				minimum: 1000,
				maximum: 50000,
				description: "Maximum tokens of context to return (default: 5000)",
			})),
		}),

		async execute(toolCallId, params, signal) {
			return executeCodeSearch(toolCallId, params, signal);
		},

		renderCall(args, theme) {
			const { query } = args as { query?: string };
			const display = !query ? "(no query)" : query.length > 70 ? query.slice(0, 67) + "..." : query;
			return new Text(theme.fg("toolTitle", theme.bold("code_search ")) + theme.fg("accent", display), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as { query?: string; maxTokens?: number; error?: string };
			if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			const summary = theme.fg("success", "code context returned") + theme.fg("muted", ` (${details?.maxTokens ?? 5000} tokens max)`);
			if (!expanded) return new Text(summary, 0, 0);
			const textContent = result.content.find(c => c.type === "text")?.text || "";
			const preview = textContent.length > 500 ? textContent.slice(0, 500) + "..." : textContent;
			return new Text(summary + "\n" + theme.fg("dim", preview), 0, 0);
		},
	});
}
