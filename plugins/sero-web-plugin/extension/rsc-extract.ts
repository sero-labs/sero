/**
 * RSC Content Extractor
 *
 * Extracts readable content from Next.js React Server Components (RSC) flight payloads.
 * RSC pages embed content as JSON in <script>self.__next_f.push([...])</script> tags.
 */

import { parseRscChunks } from "./rsc-chunks.js";

export interface RSCExtractResult {
	title: string;
	content: string;
}

export function extractRSCContent(html: string): RSCExtractResult | null {
	const parsed = parseRscChunks(html);
	if (!parsed) return null;

	const { chunkIds, getParsedChunk, title } = parsed;
	type Node = unknown;
	const visitedRefs = new Set<string>();

	function extractNode(node: Node, ctx = { inTable: false, inCode: false }): string {
		if (node === null || node === undefined) return "";

		if (typeof node === "string") {
			const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
			if (refMatch) {
				const refId = refMatch[1];
				if (visitedRefs.has(refId)) return "";
				visitedRefs.add(refId);
				const refNode = getParsedChunk(refId);
				const result = refNode ? extractNode(refNode, ctx) : "";
				visitedRefs.delete(refId);
				return result;
			}
			if (!ctx.inCode && (node === "$undefined" || node === "$" || /^\$[A-Z]/.test(node))) return "";
			return node.trim() ? node : "";
		}

		if (typeof node === "number") return String(node);
		if (typeof node === "boolean" || !Array.isArray(node)) return "";

		if (node[0] === "$" && typeof node[1] === "string") {
			const tag = node[1] as string;
			const props = (node[3] || {}) as Record<string, unknown>;
			const skipTags = [
				"script",
				"style",
				"svg",
				"path",
				"circle",
				"link",
				"meta",
				"template",
				"button",
				"input",
				"nav",
				"footer",
				"aside",
			];
			if (skipTags.includes(tag)) return "";

			if (tag.startsWith("$L")) {
				const refId = tag.slice(2);
				if (visitedRefs.has(refId)) return "";
				if (props.baseId && props.children) {
					return `## ${String(props.children)}\n\n`;
				}
				visitedRefs.add(refId);
				const refNode = getParsedChunk(refId);
				let result = "";
				if (refNode) {
					result = extractNode(refNode, ctx);
				} else if (props.children) {
					result = extractNode(props.children as Node, ctx);
				}
				visitedRefs.delete(refId);
				return result;
			}

			const children = props.children;
			const content = children ? extractNode(children as Node, ctx) : "";
			switch (tag) {
				case "h1":
					return `# ${content.trim()}\n\n`;
				case "h2":
					return `## ${content.trim()}\n\n`;
				case "h3":
					return `### ${content.trim()}\n\n`;
				case "h4":
					return `#### ${content.trim()}\n\n`;
				case "h5":
					return `##### ${content.trim()}\n\n`;
				case "h6":
					return `###### ${content.trim()}\n\n`;
				case "p":
					return ctx.inTable ? content : `${content.trim()}\n\n`;
				case "code": {
					const codeContent = children ? extractNode(children as Node, { ...ctx, inCode: true }) : "";
					return ctx.inCode ? codeContent : `\`${codeContent}\``;
				}
				case "pre": {
					const preContent = children ? extractNode(children as Node, { ...ctx, inCode: true }) : "";
					return `\`\`\`\n${preContent}\n\`\`\`\n\n`;
				}
				case "strong":
				case "b":
					return `**${content}**`;
				case "em":
				case "i":
					return `*${content}*`;
				case "li":
					return `- ${content.trim()}\n`;
				case "ul":
				case "ol":
					return `${content}\n`;
				case "blockquote":
					return `> ${content.trim()}\n\n`;
				case "table":
					return `${extractTable(node as unknown[])}\n`;
				case "thead":
				case "tbody":
				case "tr":
				case "th":
				case "td":
					return content;
				case "div":
					if (props.role === "alert" || props["data-slot"] === "alert") {
						return `> ${content.trim()}\n\n`;
					}
					return content;
				case "a": {
					const href = props.href as string | undefined;
					return href && !href.startsWith("#") ? `[${content}](${href})` : content;
				}
				default:
					return content;
			}
		}

		return (node as Node[]).map((child) => extractNode(child, ctx)).join("");
	}

	function extractTable(tableNode: unknown[]): string {
		const props = (tableNode[3] || {}) as Record<string, unknown>;
		const rows: string[][] = [];
		let headerRowCount = 0;

		function walkTable(node: unknown, isHeader = false): void {
			if (node === null || node === undefined) return;
			if (typeof node === "string") {
				const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
				if (refMatch && !visitedRefs.has(refMatch[1])) {
					visitedRefs.add(refMatch[1]);
					const refNode = getParsedChunk(refMatch[1]);
					if (refNode) walkTable(refNode, isHeader);
					visitedRefs.delete(refMatch[1]);
				}
				return;
			}
			if (!Array.isArray(node)) return;
			if (node[0] === "$") {
				const tag = node[1] as string;
				const nodeProps = (node[3] || {}) as Record<string, unknown>;
				if (tag.startsWith("$L")) {
					const refId = tag.slice(2);
					if (!visitedRefs.has(refId)) {
						visitedRefs.add(refId);
						const refNode = getParsedChunk(refId);
						if (refNode) walkTable(refNode, isHeader);
						visitedRefs.delete(refId);
					}
					return;
				}
				if (tag === "thead") walkTable(nodeProps.children, true);
				else if (tag === "tbody") walkTable(nodeProps.children, false);
				else if (tag === "tr") {
					const cells: string[] = [];
					walkCells(nodeProps.children, cells);
					if (cells.length > 0) {
						rows.push(cells);
						if (isHeader) headerRowCount++;
					}
				} else {
					walkTable(nodeProps.children, isHeader);
				}
			} else {
				for (const child of node) walkTable(child, isHeader);
			}
		}

		function walkCells(node: unknown, cells: string[]): void {
			if (node === null || node === undefined) return;
			if (typeof node === "string") {
				const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
				if (refMatch && !visitedRefs.has(refMatch[1])) {
					visitedRefs.add(refMatch[1]);
					const refNode = getParsedChunk(refMatch[1]);
					if (refNode) walkCells(refNode, cells);
					visitedRefs.delete(refMatch[1]);
				}
				return;
			}
			if (!Array.isArray(node)) return;
			if (node[0] === "$" && (node[1] === "td" || node[1] === "th")) {
				const cellProps = (node[3] || {}) as Record<string, unknown>;
				const text = extractNode(cellProps.children, { inTable: true, inCode: false })
					.trim()
					.replace(/\n/g, " ")
					.replace(/\\/g, "\\\\")
					.replace(/\|/g, "\\|");
				cells.push(text);
				return;
			}
			if (node[0] === "$" && typeof node[1] === "string" && (node[1] as string).startsWith("$L")) {
				const refId = (node[1] as string).slice(2);
				if (!visitedRefs.has(refId)) {
					visitedRefs.add(refId);
					const refNode = getParsedChunk(refId);
					if (refNode) walkCells(refNode, cells);
					visitedRefs.delete(refId);
				}
				return;
			}
			for (const child of node) walkCells(child, cells);
		}

		walkTable(props.children);
		if (rows.length === 0) return "";

		const colCount = Math.max(...rows.map((row) => row.length));
		let markdown = "";
		for (let index = 0; index < rows.length; index++) {
			const row = rows[index].concat(Array(colCount - rows[index].length).fill(""));
			markdown += `| ${row.join(" | ")} |\n`;
			if (index === headerRowCount - 1 || (headerRowCount === 0 && index === 0)) {
				markdown += `| ${Array(colCount).fill("---").join(" | ")} |\n`;
			}
		}
		return markdown;
	}

	const mainChunk = getParsedChunk("23");
	if (mainChunk) {
		const content = extractNode(mainChunk);
		if (content.trim().length > 100) {
			return { title, content: content.replace(/\n{3,}/g, "\n\n").trim() };
		}
	}

	const contentParts: { order: number; text: string }[] = [];
	for (const id of chunkIds) {
		if (id === "23") continue;
		const chunk = getParsedChunk(id);
		if (!chunk) continue;
		visitedRefs.clear();
		const text = extractNode(chunk);
		if (text.trim().length > 50 && !text.includes("page was not found") && !text.includes("404")) {
			contentParts.push({ order: Number.parseInt(id, 16), text: text.trim() });
		}
	}

	if (contentParts.length === 0) return null;

	contentParts.sort((left, right) => left.order - right.order);
	const seen = new Set<string>();
	const uniqueParts: string[] = [];
	for (const part of contentParts) {
		const key = part.text.slice(0, 150);
		if (!seen.has(key)) {
			seen.add(key);
			uniqueParts.push(part.text);
		}
	}

	const content = uniqueParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
	return content.length > 100 ? { title, content } : null;
}
