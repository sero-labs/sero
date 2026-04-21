import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface McpToolInventoryItem {
  name: string;
  description?: string;
  uiResourceUri?: string;
}

export interface McpToolRunnerResult {
  text: string;
  structuredContent?: unknown;
  uiResourceUri?: string;
  isError: boolean;
}

export interface McpToolRunnerState {
  tools: McpToolInventoryItem[];
  selectedToolName: string;
  selectedTool: McpToolInventoryItem | null;
  inputSchema: unknown;
  inputText: string;
  loadingInventory: boolean;
  loadingDetails: boolean;
  running: boolean;
  error: string | null;
  result: McpToolRunnerResult | null;
  setInputText: (value: string) => void;
  selectTool: (toolName: string) => Promise<void>;
  refresh: () => Promise<void>;
  runTool: () => Promise<boolean>;
  clearResult: () => void;
}

export function useMcpToolRunner(serverName: string | null | undefined): McpToolRunnerState {
  const { run } = useAppTools();
  const requestIdRef = useRef(0);
  const selectedToolNameRef = useRef('');
  const [tools, setTools] = useState<McpToolInventoryItem[]>([]);
  const [selectedToolName, setSelectedToolName] = useState('');
  const [inputSchema, setInputSchema] = useState<unknown>(null);
  const [inputText, setInputText] = useState('{}');
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<McpToolRunnerResult | null>(null);

  const selectTool = useCallback(async (toolName: string) => {
    const normalizedServerName = serverName?.trim();
    const normalizedToolName = toolName.trim();
    if (!normalizedServerName || !normalizedToolName) {
      setSelectedToolName('');
      setInputSchema(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingDetails(true);
    setError(null);
    setSelectedToolName(normalizedToolName);

    try {
      const toolResult = await run('mcp', {
        action: 'describe_tool',
        serverName: normalizedServerName,
        toolName: normalizedToolName,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setInputSchema(toolResult.details?.inputSchema ?? null);
      if (toolResult.isError) {
        setError(toolResult.text);
      }
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setInputSchema(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingDetails(false);
      }
    }
  }, [run, serverName]);

  const refresh = useCallback(async () => {
    const normalizedServerName = serverName?.trim();
    if (!normalizedServerName) {
      setTools([]);
      setSelectedToolName('');
      setInputSchema(null);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingInventory(true);
    setError(null);

    let preferredTool: string | null = null;
    try {
      const toolResult = await run('mcp', {
        action: 'list_tools',
        serverName: normalizedServerName,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }

      const nextTools = parseToolInventory(toolResult.details?.tools);
      setTools(nextTools);
      setResult(null);

      if (toolResult.isError) {
        setSelectedToolName('');
        setInputSchema(null);
        setError(toolResult.text);
        return;
      }

      if (nextTools.length === 0) {
        setSelectedToolName('');
        setInputSchema(null);
        return;
      }

      preferredTool = nextTools.find((tool) => tool.name === selectedToolNameRef.current)?.name ?? nextTools[0]?.name ?? null;
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTools([]);
      setSelectedToolName('');
      setInputSchema(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingInventory(false);
      }
    }

    if (preferredTool) {
      await selectTool(preferredTool);
    }
  }, [run, selectTool, serverName]);

  const runTool = useCallback(async () => {
    const normalizedServerName = serverName?.trim();
    const normalizedToolName = selectedToolName.trim();
    if (!normalizedServerName || !normalizedToolName) {
      setError('Select an MCP tool before running it.');
      return false;
    }

    const toolArguments = parseInputText(inputText);
    if (toolArguments instanceof Error) {
      setError(toolArguments.message);
      return false;
    }

    setRunning(true);
    setError(null);
    try {
      const toolResult = await run('mcp', {
        action: 'call_tool',
        serverName: normalizedServerName,
        toolName: normalizedToolName,
        toolArguments,
      });
      setResult({
        text: toolResult.text,
        structuredContent: toolResult.details?.structuredContent,
        uiResourceUri: typeof toolResult.details?.uiResourceUri === 'string' ? toolResult.details.uiResourceUri : undefined,
        isError: toolResult.isError,
      });
      if (toolResult.isError) {
        setError(toolResult.text);
        return false;
      }
      return true;
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setRunning(false);
    }
  }, [inputText, run, selectedToolName, serverName]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    selectedToolNameRef.current = selectedToolName;
  }, [selectedToolName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    tools,
    selectedToolName,
    selectedTool: tools.find((tool) => tool.name === selectedToolName) ?? null,
    inputSchema,
    inputText,
    loadingInventory,
    loadingDetails,
    running,
    error,
    result,
    setInputText,
    selectTool,
    refresh,
    runTool,
    clearResult,
  };
}

function parseToolInventory(value: unknown): McpToolInventoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : '',
      description: typeof entry.description === 'string' ? entry.description : undefined,
      uiResourceUri: typeof entry.uiResourceUri === 'string' ? entry.uiResourceUri : undefined,
    }))
    .filter((entry) => entry.name.length > 0);
}

function parseInputText(value: string): Record<string, unknown> | undefined | Error {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '{}') {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return new Error('Tool input must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    return new Error('Tool input must be valid JSON.');
  }
}
