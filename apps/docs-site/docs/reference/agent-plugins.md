---
title: Agent Plugins
description: Install portable Agent Plugins with Agent Skills and MCP servers.
---

Agent Plugins are portable packages defined by
[agent-plugins.org](https://agent-plugins.org/). They are separate from Sero
plugins and do not create Sero apps or sidebar entries.

Open **Admin > Plugins > Agent Plugins** to inspect and install a package from
an npm source, Git URL, or absolute local directory. Review all components
before installation. Local MCP executables need explicit approval.

An Agent Plugin can provide:

- Agent Skills from immediate child directories under `skills/`
- stdio, Streamable HTTP, or legacy SSE servers from `mcp.json`
- optional Sero CLI access, disabled by default

The MCP app labels managed servers with their owning Agent Plugin. Managed
definitions do not appear in the raw user MCP config. MCP stores its own
enable and authentication state against the stable installation and server
identity.

Sero keeps installed package content separate from writable `PLUGIN_DATA`.
Data survives updates and can be retained when you remove the package.

CLI skill commands use `<plugin-name>/<skill-name>`. Discovered MCP tools use
`<plugin-name>/<server-name>/<tool-name>`. Sero maps safe object schemas to CLI
arguments and uses an explicit JSON object for other schemas. These commands
use the active Sero agent and existing MCP runtime.
