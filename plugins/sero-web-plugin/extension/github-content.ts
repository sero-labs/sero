// github-content.ts — Repository content generation: tree building,
// directory listings, file reading. Split from github-extract.ts.

import { existsSync, readFileSync, statSync, readdirSync, openSync, readSync, closeSync, realpathSync } from "node:fs";
import { extname, join, resolve as resolvePath, sep as pathSep } from "node:path";
import type { GitHubUrlInfo } from "./github-extract.js";

const BINARY_EXTENSIONS = new Set([
	".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg", ".tiff", ".tif",
	".mp3", ".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".wav", ".ogg", ".webm", ".flac", ".aac",
	".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".zst",
	".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".lib",
	".woff", ".woff2", ".ttf", ".otf", ".eot",
	".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
	".sqlite", ".db", ".sqlite3",
	".pyc", ".pyo", ".class", ".jar", ".war",
	".iso", ".img", ".dmg",
]);

const NOISE_DIRS = new Set([
	"node_modules", "vendor", ".next", "dist", "build", "__pycache__",
	".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache",
	"target", ".gradle", ".idea", ".vscode",
]);

const MAX_INLINE_FILE_CHARS = 100_000;
const MAX_TREE_ENTRIES = 200;

function resolveWithinRepo(rootPath: string, relativePath: string): string | null {
	const normalizedRoot = resolvePath(rootPath);
	const candidate = resolvePath(normalizedRoot, relativePath);
	if (candidate !== normalizedRoot) {
		const rootPrefix = normalizedRoot.endsWith(pathSep) ? normalizedRoot : normalizedRoot + pathSep;
		if (!candidate.startsWith(rootPrefix)) return null;
	}
	if (!existsSync(candidate)) return candidate;
	try {
		const realRoot = realpathSync(normalizedRoot);
		const realCandidate = realpathSync(candidate);
		if (realCandidate === realRoot) return candidate;
		const realRootPrefix = realRoot.endsWith(pathSep) ? realRoot : realRoot + pathSep;
		return realCandidate.startsWith(realRootPrefix) ? candidate : null;
	} catch { return null; }
}

function isBinaryFile(filePath: string): boolean {
	const ext = extname(filePath).toLowerCase();
	if (BINARY_EXTENSIONS.has(ext)) return true;
	let fd: number;
	try { fd = openSync(filePath, "r"); } catch { return false; }
	try {
		const buf = Buffer.alloc(512);
		const bytesRead = readSync(fd, buf, 0, 512, 0);
		for (let i = 0; i < bytesRead; i++) { if (buf[i] === 0) return true; }
	} catch { return false; } finally { closeSync(fd); }
	return false;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readTextFile(path: string): string | null {
	try { return readFileSync(path, "utf-8"); } catch { return null; }
}

function buildTree(rootPath: string): string {
	const entries: string[] = [];
	function walk(dir: string, relPath: string): void {
		if (entries.length >= MAX_TREE_ENTRIES) return;
		let items: string[];
		try { items = readdirSync(dir).sort(); } catch { return; }
		for (const item of items) {
			if (entries.length >= MAX_TREE_ENTRIES) return;
			if (item === ".git") continue;
			const rel = relPath ? `${relPath}/${item}` : item;
			const safePath = resolveWithinRepo(rootPath, rel);
			if (!safePath) { entries.push(`${rel}  [outside repo skipped]`); continue; }
			let stat;
			try { stat = statSync(safePath); } catch { continue; }
			if (stat.isDirectory()) {
				if (NOISE_DIRS.has(item)) { entries.push(`${rel}/  [skipped]`); continue; }
				entries.push(`${rel}/`);
				walk(safePath, rel);
			} else { entries.push(rel); }
		}
	}
	walk(rootPath, "");
	if (entries.length >= MAX_TREE_ENTRIES) entries.push(`... (truncated at ${MAX_TREE_ENTRIES} entries)`);
	return entries.join("\n");
}

function buildDirListing(rootPath: string, subPath: string): string {
	const targetPath = resolveWithinRepo(rootPath, subPath);
	if (!targetPath) return "(path escapes repository root)";
	let items: string[];
	try { items = readdirSync(targetPath).sort(); } catch { return "(directory not readable)"; }
	const lines: string[] = [];
	for (const item of items) {
		if (item === ".git") continue;
		const rel = subPath ? `${subPath}/${item}` : item;
		const safePath = resolveWithinRepo(rootPath, rel);
		if (!safePath) { lines.push(`  ${item}  (outside repo)`); continue; }
		try {
			const stat = statSync(safePath);
			lines.push(stat.isDirectory() ? `  ${item}/` : `  ${item}  (${formatFileSize(stat.size)})`);
		} catch { lines.push(`  ${item}  (unreadable)`); }
	}
	return lines.join("\n");
}

function readReadme(localPath: string): string | null {
	for (const name of ["README.md", "readme.md", "README", "README.txt", "README.rst"]) {
		const readmePath = join(localPath, name);
		if (existsSync(readmePath)) {
			try {
				const content = readFileSync(readmePath, "utf-8");
				return content.length > 8192 ? content.slice(0, 8192) + "\n\n[README truncated at 8K chars]" : content;
			} catch { continue; }
		}
	}
	return null;
}

export function generateContent(localPath: string, info: GitHubUrlInfo): string {
	const lines: string[] = [`Repository cloned to: ${localPath}`, ""];

	if (info.type === "root") {
		lines.push("## Structure", buildTree(localPath), "");
		const readme = readReadme(localPath);
		if (readme) lines.push("## README.md", readme, "");
		lines.push("Use `read` and `bash` tools at the path above to explore further.");
		return lines.join("\n");
	}

	if (info.type === "tree") {
		const dirPath = info.path || "";
		const fullDirPath = resolveWithinRepo(localPath, dirPath);
		if (!fullDirPath || !existsSync(fullDirPath)) {
			lines.push(`Path \`${dirPath}\` not found in clone. Showing repository root instead.`, "", "## Structure", buildTree(localPath));
		} else {
			lines.push(`## ${dirPath || "/"}`, buildDirListing(localPath, dirPath));
		}
		lines.push("", "Use `read` and `bash` tools at the path above to explore further.");
		return lines.join("\n");
	}

	if (info.type === "blob") {
		const filePath = info.path || "";
		const fullFilePath = resolveWithinRepo(localPath, filePath);
		if (!fullFilePath || !existsSync(fullFilePath)) {
			lines.push(`Path \`${filePath}\` not found in clone.`, "", "## Structure", buildTree(localPath), "", "Use `read` and `bash` tools at the path above to explore further.");
			return lines.join("\n");
		}
		let stat: ReturnType<typeof statSync>;
		try { stat = statSync(fullFilePath); }
		catch (err) { lines.push(`Could not inspect \`${filePath}\`: ${err instanceof Error ? err.message : String(err)}`); return lines.join("\n"); }

		if (stat.isDirectory()) {
			lines.push(`## ${filePath || "/"}`, buildDirListing(localPath, filePath), "", "Use `read` and `bash` tools at the path above to explore further.");
			return lines.join("\n");
		}
		if (isBinaryFile(fullFilePath)) {
			lines.push(`## ${filePath}`, `Binary file (${extname(filePath).replace(".", "")}, ${formatFileSize(stat.size)}).`);
			return lines.join("\n");
		}
		const content = readTextFile(fullFilePath);
		if (content === null) { lines.push(`Could not read \`${filePath}\` as UTF-8 text.`); return lines.join("\n"); }
		lines.push(`## ${filePath}`);
		if (content.length > MAX_INLINE_FILE_CHARS) {
			lines.push(content.slice(0, MAX_INLINE_FILE_CHARS), "", `[File truncated at 100K chars. Full file: ${fullFilePath}]`);
		} else { lines.push(content); }
		lines.push("", "Use `read` and `bash` tools at the path above to explore further.");
		return lines.join("\n");
	}

	return lines.join("\n");
}
