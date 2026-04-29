// tools-bookmark.ts — bookmark + clear_history tool registrations.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { addBookmark, removeBookmark, listBookmarks, clearHistory } from "./state-sync.js";

export function registerBookmarkTool(
	pi: ExtensionAPI,
	getStatePath: () => string,
	ensureStatePath: (cwd?: string) => string,
	clearRuntimeHistory: () => void,
) {
	pi.registerTool({
		name: "web_bookmark",
		label: "Web Bookmark",
		description:
			"Manage web bookmarks. Actions: add (save a URL), remove (delete by URL or ID), list (show all, optionally filtered by tag), clear_history (remove all search/fetch history).",
		parameters: Type.Object({
			action: StringEnum(["add", "remove", "list", "clear_history"] as const),
			url: Type.Optional(Type.String({ description: "URL to bookmark (for add/remove)" })),
			title: Type.Optional(Type.String({ description: "Bookmark title (for add; auto-detected if omitted)" })),
			description: Type.Optional(Type.String({ description: "Short description (for add)" })),
			tags: Type.Optional(Type.Array(Type.String(), { description: "Tags for the bookmark (for add)" })),
			tag: Type.Optional(Type.String({ description: "Filter bookmarks by tag (for list)" })),
			id: Type.Optional(Type.String({ description: "Bookmark ID (for remove)" })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (ctx?.cwd) ensureStatePath(ctx.cwd);
			const sp = getStatePath();
			if (!sp) {
				return { content: [{ type: "text", text: "Error: no workspace path" }], details: { error: "no workspace" } };
			}

			switch (params.action) {
				case "add": {
					if (!params.url) {
						return { content: [{ type: "text", text: "Error: url is required for add" }], details: { error: "missing url" } };
					}
					try {
						const bm = await addBookmark(sp, params.url, params.title || "", params.description, params.tags);
						return {
							content: [{ type: "text", text: `Bookmarked: ${bm.title}\n${bm.url}${bm.tags.length ? `\nTags: ${bm.tags.join(", ")}` : ""}` }],
							details: { action: "add", id: bm.id, url: bm.url },
						};
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { content: [{ type: "text", text: `Error adding bookmark: ${msg}` }], details: { error: msg } };
					}
				}

				case "remove": {
					const target = params.id || params.url;
					if (!target) {
						return { content: [{ type: "text", text: "Error: id or url is required for remove" }], details: { error: "missing id/url" } };
					}
					try {
						const removed = await removeBookmark(sp, target);
						return {
							content: [{ type: "text", text: removed ? `Removed bookmark: ${target}` : `Bookmark not found: ${target}` }],
							details: { action: "remove", removed, target },
						};
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { content: [{ type: "text", text: `Error removing bookmark: ${msg}` }], details: { error: msg } };
					}
				}

				case "list": {
					try {
						const bookmarks = await listBookmarks(sp, params.tag);
						if (bookmarks.length === 0) {
							const suffix = params.tag ? ` with tag "${params.tag}"` : "";
							return { content: [{ type: "text", text: `No bookmarks${suffix}.` }], details: { action: "list", count: 0 } };
						}
						const lines = bookmarks.map((b, i) => {
							let line = `${i + 1}. **${b.title}**\n   ${b.url}`;
							if (b.description) line += `\n   ${b.description}`;
							if (b.tags.length) line += `\n   Tags: ${b.tags.join(", ")}`;
							return line;
						});
						return {
							content: [{ type: "text", text: lines.join("\n\n") }],
							details: { action: "list", count: bookmarks.length, tag: params.tag },
						};
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { content: [{ type: "text", text: `Error listing bookmarks: ${msg}` }], details: { error: msg } };
					}
				}

				case "clear_history": {
					try {
						await clearHistory(sp);
						clearRuntimeHistory();
						return {
							content: [{ type: "text", text: "Search history cleared." }],
							details: { action: "clear_history" },
						};
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return { content: [{ type: "text", text: `Error clearing history: ${msg}` }], details: { error: msg } };
					}
				}

				default:
					return { content: [{ type: "text", text: `Unknown action: ${params.action}` }], details: { error: "unknown action" } };
			}
		},

		renderCall(args, theme) {
			const { action, url, title, tag } = args as { action?: string; url?: string; title?: string; tag?: string };
			let detail = "";
			if (action === "add" && (title || url)) detail = ` ${title || url}`;
			else if (action === "remove" && url) detail = ` ${url}`;
			else if (action === "list" && tag) detail = ` tag:${tag}`;
			const display = detail.length > 50 ? detail.slice(0, 47) + "..." : detail;
			return new Text(theme.fg("toolTitle", theme.bold("bookmark ")) + theme.fg("muted", action || "") + theme.fg("accent", display), 0, 0);
		},

		renderResult(result, _opts, theme) {
			const details = result.details as { action?: string; error?: string; count?: number; removed?: boolean };
			if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			const text = result.content.find(c => c.type === "text")?.text || "";
			const preview = text.length > 120 ? text.slice(0, 117) + "..." : text;
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", preview), 0, 0);
		},
	});
}
