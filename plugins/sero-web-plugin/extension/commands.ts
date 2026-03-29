import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function sendToolRoutedPrompt(pi: ExtensionAPI, lines: string[]): void {
	pi.sendUserMessage(lines.filter(Boolean).join("\n"));
}

function isLikelyUrl(value: string): boolean {
	return /^https?:\/\//i.test(value.trim());
}

function buildBookmarkInstruction(args: string): string[] {
	const trimmed = args.trim();
	if (!trimmed) return [];

	if (isLikelyUrl(trimmed)) {
		return [
			`Bookmark this URL: ${trimmed}`,
			"Use the web_bookmark tool with action=add.",
		];
	}

	if (trimmed === "list") {
		return [
			"List all saved web bookmarks.",
			"Use the web_bookmark tool with action=list.",
		];
	}

	if (trimmed.startsWith("list ")) {
		const tag = trimmed.slice("list ".length).trim();
		if (tag) {
			return [
				`List saved web bookmarks filtered by tag: ${tag}`,
				"Use the web_bookmark tool with action=list and the tag filter.",
			];
		}
	}

	if (trimmed === "clear_history" || trimmed === "clear-history") {
		return [
			"Clear saved web search and fetch history.",
			"Use the web_bookmark tool with action=clear_history.",
		];
	}

	if (trimmed.startsWith("remove ")) {
		const target = trimmed.slice("remove ".length).trim();
		if (target) {
			return [
				`Remove this saved web bookmark: ${target}`,
				"Use the web_bookmark tool with action=remove and pass the URL or bookmark ID.",
			];
		}
	}

	return [
		`Manage web bookmarks with this request: ${trimmed}`,
		"Use the web_bookmark tool to carry it out.",
	];
}

export function registerWebCommands(pi: ExtensionAPI) {
	pi.registerCommand("web_search", {
		description: "Search the web with the web_search tool",
		handler: async (args, ctx) => {
			const query = args.trim();
			if (!query) {
				ctx.ui.notify("Usage: /web_search <query>", "warning");
				return;
			}

			sendToolRoutedPrompt(pi, [
				`Search the web for: ${query}`,
				"Use the web_search tool for this request.",
				"Do not use the browser tool unless you later need Playwright-based UI testing on a known page.",
			]);
		},
	});

	pi.registerCommand("web_bookmark", {
		description: "Manage bookmarks with the web_bookmark tool",
		handler: async (args, ctx) => {
			const instruction = buildBookmarkInstruction(args);
			if (instruction.length === 0) {
				ctx.ui.notify(
					"Usage: /web_bookmark <url | list | list <tag> | remove <url-or-id> | clear_history>",
					"warning",
				);
				return;
			}

			sendToolRoutedPrompt(pi, [
				...instruction,
				"Do not use the browser tool for bookmark or history management.",
			]);
		},
	});
}
