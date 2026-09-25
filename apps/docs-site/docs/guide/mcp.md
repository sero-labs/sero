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

## MCP apps in the chat

Some MCP tools come with an app: a small interactive page from the server, such as a chart or a form. When the agent calls such a tool, the tool call in the chat shows the app between the input and the text result. The text result stays, so the agent and you see the same data.

Sero keeps each app apart from Sero and from other servers:

- The app runs in a sandboxed frame on a separate local address. It cannot read Sero data or other apps.
- The app has no network access, unless the server declares the domains that it needs. Sero then allows only those domains.
- The app can call only tools of its own server that the server marks for apps. Sero blocks other calls and shows the reason under the app.
- Sero does not give an app access to the camera, the microphone, your location, or the clipboard.
- When the app asks to open a web page, Sero shows the full address. Select **Open page** to open it in your browser, or **Decline**.

An app can send a message to the chat. The message shows the server and the tool, for example `sales · show_dashboard app`, and the agent answers it. An app can also add context that the agent reads on its next turn.

When Sero cannot show an app, the tool call shows one line with the reason, for example **App not shown**, and the text result stays. When you open an older session, Sero loads the app again from the stored call. If the tool result was larger than 256 KB, Sero does not store it, and the app gets only the input.

The agent does not see tools that a server marks for its app only.

## Answer questions from a server

Some MCP tools ask you for information while they run. When a server asks, Sero opens its questions in **User Feedback**. The line under **Questionnaire** shows who asks, for example `MCP · crm · create_contact`: the server name from your MCP settings and the tool that asks. Answer each question, then select **Submit All Answers**. A server can ask again during the same tool call. After you answer, Sero goes back to the app that you used before.

You have two ways to stop:

- Select **Decline** on the first question to send no answers. The server gets a decline and decides what to do next, and the tool call continues.
- Select **Cancel** to stop the tool call.

If an answer does not fit the question, for example text where a number is required, Sero shows the reason and asks once more. After a second answer that does not fit, Sero declines for you.

A server can also ask you to open a web page, for example to sign in or to pay. Sero shows this request in the chat with the full address. Select **Open page** to open it in your browser, or **Decline** to send no answer. Sero offers only `http` and `https` addresses.

When no person can answer, for example in a headless session or the plain Pi CLI, Sero declines every server question at once.
