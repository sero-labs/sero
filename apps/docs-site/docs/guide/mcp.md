# MCP

Use the MCP app to add, inspect, change, and remove MCP server definitions for the active profile. A definition can start a local command or connect to a remote service.

![MCP overview](../assets/images/mcp.jpg)

## Add a server

1. Open **MCP**.
2. Select **Add server**.
3. Enter a unique server name.
4. Choose the transport and enter its command or URL.
5. Add required arguments, headers, or environment variables.
6. Select **Save server** and check its status.

For a local server, verify the executable and each argument before you save. For a remote server, use the authentication fields that its provider requires. Do not put a secret in a screenshot or support report.

![MCP server](../assets/images/mcp-server.jpg)

## Change or remove a server

Open a server to review its complete definition. Save your changes after you update its transport, command, URL, or authentication values. Remove the server when you no longer want Sero to expose it to agent sessions.

The manager shows the configured server set and its current status. A saved definition does not prove that the command or remote service is available. Check the server status after each change.

![MCP manager](../assets/images/mcp-manager.jpg)

MCP configuration can contain local paths, network addresses, and credentials. Treat it as sensitive profile configuration. See [Settings and Admin](/guide/settings-models-admin) for other profile settings and [Security / Privacy](/reference/security-privacy) for sharing guidance.

## Protocol versions

Sero supports MCP revision `2026-07-28` and the older 2025 revisions. When Sero connects to a server, it asks the server for `2026-07-28` first. If the server does not support it, Sero uses the 2025 handshake. You do not need to change a saved server.

Open a server to see its **Protocol** card. The card shows the revision in use, the extensions that the server offers, the transport and the state of the cached tool list. When a connection fails, the card names the step that failed, for example **Sign-in failed**.

A server that uses the older SSE transport shows **SSE, deprecated**. Sero keeps it working, but you cannot add new SSE servers. Ask the server owner for a Streamable HTTP URL.

Sero checks the protocol version again after you change a server. If the server owner upgrades the server, select **Reconnect**.

## Answer questions from a server

Some MCP tools ask you for information while they run. When a server asks, Sero opens its questions in **User Feedback**. The line under **Questionnaire** shows who asks, for example `MCP · crm · create_contact`: the server name from your MCP settings and the tool that asks. Answer each question, then select **Submit All Answers**. A server can ask again during the same tool call. After you answer, Sero goes back to the app that you used before.

You have two ways to stop:

- Select **Decline** on the first question to send no answers. The server gets a decline and decides what to do next, and the tool call continues.
- Select **Cancel** to stop the tool call.

If an answer does not fit the question, for example text where a number is required, Sero shows the reason and asks once more. After a second answer that does not fit, Sero declines for you.

A server can also ask you to open a web page, for example to sign in or to pay. Sero shows this request in the chat with the full address. Select **Open page** to open it in your browser, or **Decline** to send no answer. Sero offers only `http` and `https` addresses.

When no person can answer, for example in a headless session or the plain Pi CLI, Sero declines every server question at once.
