import { activityMonitor } from "./activity.js";
import { callExaMcp } from "./exa.js";

export async function executeCodeSearch(
	_toolCallId: string,
	params: { query: string; maxTokens?: number },
	signal?: AbortSignal,
): Promise<{
	content: Array<{ type: "text"; text: string }>;
	details: { query: string; maxTokens: number; error?: string };
}> {
	const query = params.query.trim();
	if (!query) {
		return {
			content: [{ type: "text", text: "Error: No query provided." }],
			details: { query: "", maxTokens: params.maxTokens ?? 5000, error: "No query provided" },
		};
	}

	const maxTokens = params.maxTokens ?? 5000;
	const activityId = activityMonitor.logStart({ type: "api", query });

	try {
		const text = await callExaMcp(
			"get_code_context_exa",
			{
				query,
				tokensNum: maxTokens,
			},
			signal,
		);
		activityMonitor.logComplete(activityId, 200);
		return {
			content: [{ type: "text", text }],
			details: { query, maxTokens },
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.toLowerCase().includes("abort")) {
			activityMonitor.logComplete(activityId, 0);
			throw err;
		}
		activityMonitor.logError(activityId, message);
		return {
			content: [{ type: "text", text: `Error: ${message}` }],
			details: { query, maxTokens, error: message },
		};
	}
}
