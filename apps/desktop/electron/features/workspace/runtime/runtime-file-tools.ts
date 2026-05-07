import path from 'node:path';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { Static } from 'typebox';
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
} from '@electron/features/container/filesystem/truncate';
import {
  countFuzzyOccurrences,
  detectLineEnding,
  fuzzyFindText,
  generateDiffString,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from '@electron/features/container/filesystem/edit-helpers';
import {
  detectMimeFromMagicHex,
  EditParams,
  ReadParams,
  WriteParams,
} from '@electron/features/container/tools/tool-schemas';
import {
  getProtectedMemoryAccessError,
  isProtectedMemoryPath,
} from '@electron/features/container/tools/memory-file-guard';
import { prepareToolImage } from '@electron/shared/media/image-resize';
import type { WorkspaceRuntimeProviderId } from '@/types/ipc';
import type { WorkspaceRuntimeFacade } from './types';
import {
  getOpenShellRuntimeWorkspacePath,
  toOpenShellWorkspacePath,
} from './openshell/path';

const FILE_TOOL_TIMEOUT_MS = 120_000;

type OpenShellProviderId = 'openshell-local' | 'openshell-remote' | 'openshell-cloud';

interface RuntimeFileToolOptions {
  cwd: string;
}

export function isOpenShellProvider(
  providerId: WorkspaceRuntimeProviderId | undefined,
): providerId is OpenShellProviderId {
  return providerId === 'openshell-local'
    || providerId === 'openshell-remote'
    || providerId === 'openshell-cloud';
}

export function getOpenShellProviderLabel(providerId: OpenShellProviderId): string {
  if (providerId === 'openshell-cloud') return 'OpenShell Cloud';
  return providerId === 'openshell-remote' ? 'OpenShell Remote' : 'OpenShell Local';
}

export function createOpenShellFileTools(
  runtime: WorkspaceRuntimeFacade,
  options: RuntimeFileToolOptions,
): ToolDefinition[] {
  if (!isOpenShellProvider(runtime.providerId)) return [];
  return [
    createOpenShellReadTool(runtime, options.cwd),
    createOpenShellWriteTool(runtime, options.cwd),
    createOpenShellEditTool(runtime, options.cwd),
  ];
}

function createOpenShellReadTool(runtime: WorkspaceRuntimeFacade, cwd: string): ToolDefinition {
  return {
    name: 'read',
    label: 'read',
    description:
      `Read the contents of a file from the selected ${getOpenShellProviderLabel(runtime.providerId as OpenShellProviderId)} sandbox. ` +
      'Supports text files and images (jpg, png, gif, webp).',
    parameters: ReadParams,
    execute: async (_toolCallId, params: Static<typeof ReadParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');
      const runtimePath = resolveRuntimeFilePath(runtime, cwd, params.path, 'read');

      const magicHex = await runtimeExecText(
        runtime,
        buildReadHexCommand(runtimePath, 12),
        cwd,
        'read file magic bytes',
      );
      const mimeType = detectMimeFromMagicHex(magicHex.trim().toLowerCase());

      if (mimeType) {
        const base64 = (await runtimeExecText(
          runtime,
          buildReadBase64Command(runtimePath),
          cwd,
          'read image file',
        )).replace(/[\r\n]/g, '');
        const estimatedBytes = Math.floor((base64.length * 3) / 4);
        if (estimatedBytes < 8) {
          throw new Error(`File ${params.path} has image magic bytes but is only ${estimatedBytes} bytes — likely corrupt.`);
        }
        const image = prepareToolImage(base64, mimeType);
        const text = [`Read image file [${image.mimeType}]`, image.text].filter(Boolean).join('\n');
        return {
          content: [
            { type: 'text' as const, text },
            { type: 'image' as const, data: image.data, mimeType: image.mimeType },
          ],
          details: { path: runtimePath, providerId: runtime.providerId },
        };
      }

      const textContent = await runtimeExecText(
        runtime,
        buildReadTextCommand(runtimePath),
        cwd,
        'read text file',
      );
      return formatReadTextResult(params, textContent, runtimePath, runtime.providerId);
    },
  };
}

function createOpenShellWriteTool(runtime: WorkspaceRuntimeFacade, cwd: string): ToolDefinition {
  return {
    name: 'write',
    label: 'write',
    description: 'Write content to a file inside the selected OpenShell sandbox and sync it back to the host workspace.',
    parameters: WriteParams,
    execute: async (_toolCallId, params: Static<typeof WriteParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');
      const runtimePath = resolveRuntimeFilePath(runtime, cwd, params.path, 'write');
      await runtimeExecText(
        runtime,
        buildWriteTextCommand(runtimePath, params.content),
        cwd,
        'write file',
      );
      return {
        content: [{ type: 'text' as const, text: `Successfully wrote ${params.content.length} bytes to ${params.path}` }],
        details: { path: runtimePath, providerId: runtime.providerId },
      };
    },
  };
}

function createOpenShellEditTool(runtime: WorkspaceRuntimeFacade, cwd: string): ToolDefinition {
  return {
    name: 'edit',
    label: 'edit',
    description: 'Edit a file inside the selected OpenShell sandbox by replacing unique exact text, then sync it back to host.',
    parameters: EditParams,
    execute: async (_toolCallId, params: Static<typeof EditParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');
      const runtimePath = resolveRuntimeFilePath(runtime, cwd, params.path, 'edit');
      const rawContent = await runtimeExecText(
        runtime,
        buildReadTextCommand(runtimePath),
        cwd,
        'read file before edit',
      );

      const { bom, text: content } = stripBom(rawContent);
      const originalEnding = detectLineEnding(content);
      const normalizedContent = normalizeToLF(content);
      const normalizedOldText = normalizeToLF(params.oldText);
      const normalizedNewText = normalizeToLF(params.newText);
      const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

      if (!matchResult.found) {
        throw new Error(
          `Could not find the exact text in ${params.path}. ` +
            'The old text must match exactly including all whitespace and newlines.',
        );
      }

      const occurrences = countFuzzyOccurrences(normalizedContent, normalizedOldText);
      if (occurrences > 1) {
        throw new Error(
          `Found ${occurrences} occurrences of the text in ${params.path}. ` +
            'The text must be unique. Please provide more context to make it unique.',
        );
      }

      const baseContent = matchResult.contentForReplacement;
      const newContent =
        baseContent.substring(0, matchResult.index) +
        normalizedNewText +
        baseContent.substring(matchResult.index + matchResult.matchLength);

      if (baseContent === newContent) {
        throw new Error(`No changes made to ${params.path}. The replacement produced identical content.`);
      }

      const finalContent = bom + restoreLineEndings(newContent, originalEnding);
      await runtimeExecText(runtime, buildWriteTextCommand(runtimePath, finalContent), cwd, 'write edited file');
      const diffResult = generateDiffString(baseContent, newContent);

      return {
        content: [{ type: 'text' as const, text: `Successfully replaced text in ${params.path}.` }],
        details: {
          path: runtimePath,
          providerId: runtime.providerId,
          diff: diffResult.diff,
          firstChangedLine: diffResult.firstChangedLine,
        },
      };
    },
  };
}

function formatReadTextResult(
  params: Static<typeof ReadParams>,
  textContent: string,
  runtimePath: string,
  providerId: WorkspaceRuntimeProviderId,
) {
  const allLines = textContent.split('\n');
  const totalFileLines = allLines.length;
  const startLine = params.offset ? Math.max(0, params.offset - 1) : 0;
  const startLineDisplay = startLine + 1;

  if (startLine >= allLines.length) {
    throw new Error(`Offset ${params.offset} is beyond end of file (${allLines.length} lines total)`);
  }

  let selectedContent: string;
  let userLimitedLines: number | undefined;
  if (params.limit !== undefined) {
    const endLine = Math.min(startLine + params.limit, allLines.length);
    selectedContent = allLines.slice(startLine, endLine).join('\n');
    userLimitedLines = endLine - startLine;
  } else {
    selectedContent = allLines.slice(startLine).join('\n');
  }

  const truncation = truncateHead(selectedContent);
  let outputText: string;
  if (truncation.firstLineExceedsLimit) {
    const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine] ?? '', 'utf-8'));
    outputText =
      `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ` +
      `${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n ` +
      `'${startLineDisplay}p' ${params.path} | head -c ${DEFAULT_MAX_BYTES}]`;
  } else if (truncation.truncated) {
    const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
    const nextOffset = endLineDisplay + 1;
    outputText = truncation.content;
    if (truncation.truncatedBy === 'lines') {
      outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
    } else {
      outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
    }
  } else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
    const remaining = allLines.length - (startLine + userLimitedLines);
    const nextOffset = startLine + userLimitedLines + 1;
    outputText = truncation.content;
    outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
  } else {
    outputText = truncation.content;
  }

  return {
    content: [{ type: 'text' as const, text: outputText }],
    details: { path: runtimePath, providerId, ...(truncation.truncated ? { truncation } : {}) },
  };
}

function resolveRuntimeFilePath(
  runtime: WorkspaceRuntimeFacade,
  cwd: string,
  requestedPath: string,
  tool: 'read' | 'write' | 'edit',
): string {
  if (isProtectedMemoryPath(requestedPath)) throw new Error(getProtectedMemoryAccessError(tool));

  const runtimeCwd = toOpenShellWorkspacePath(
    runtime.workspacePath,
    cwd,
    getOpenShellRuntimeWorkspacePath(runtime.workspacePath),
  );
  if (!runtimeCwd) {
    throw new Error(`Cannot ${tool} outside workspace root in ${getOpenShellProviderLabel(runtime.providerId as OpenShellProviderId)} mode: ${cwd}`);
  }

  const resolved = requestedPath.startsWith('/')
    ? path.posix.normalize(requestedPath)
    : path.posix.normalize(path.posix.join(runtimeCwd, requestedPath));
  const root = getOpenShellRuntimeWorkspacePath(runtime.workspacePath);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`Cannot ${tool} outside the OpenShell workspace root: ${requestedPath}`);
  }
  if (isProtectedMemoryPath(resolved)) throw new Error(getProtectedMemoryAccessError(tool));
  return resolved;
}

async function runtimeExecText(
  runtime: WorkspaceRuntimeFacade,
  command: string,
  cwd: string,
  action: string,
): Promise<string> {
  const result = await runtime.exec(command, { cwd, timeoutMs: FILE_TOOL_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    const label = isOpenShellProvider(runtime.providerId)
      ? `${getOpenShellProviderLabel(runtime.providerId)} `
      : '';
    throw new Error(`${label}runtime failed to ${action}: ${result.stderr || result.stdout || `exit code ${result.exitCode}`}`);
  }
  return result.stdout;
}

function buildReadHexCommand(filePath: string, bytes: number): string {
  return `python3 - <<'PY'\nfrom pathlib import Path\np=Path(${JSON.stringify(filePath)})\nprint(p.read_bytes()[:${bytes}].hex())\nPY`;
}

function buildReadBase64Command(filePath: string): string {
  return `python3 - <<'PY'\nimport base64\nfrom pathlib import Path\np=Path(${JSON.stringify(filePath)})\nprint(base64.b64encode(p.read_bytes()).decode('ascii'))\nPY`;
}

function buildReadTextCommand(filePath: string): string {
  return `python3 - <<'PY'\nimport sys\nfrom pathlib import Path\np=Path(${JSON.stringify(filePath)})\nsys.stdout.write(p.read_text())\nPY`;
}

function buildWriteTextCommand(filePath: string, content: string): string {
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  return `python3 - <<'PY'\nimport base64\nfrom pathlib import Path\np=Path(${JSON.stringify(filePath)})\np.parent.mkdir(parents=True, exist_ok=True)\np.write_text(base64.b64decode(${JSON.stringify(encoded)}).decode('utf-8'))\nPY`;
}
