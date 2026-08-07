# Agent Plugins

Sero supports the portable Agent Plugins v1 format. Agent Plugins and Sero
plugins are different systems.

A Sero plugin can add an app, React UI, Pi extension, tools, prompts, agents,
themes, widgets, and host capabilities. An Agent Plugin has a root
`plugin.json`, Agent Skills under `skills/`, and optional MCP servers in
`mcp.json`.

## Install

Open **Admin > Plugins > Agent Plugins**. Enter an npm source, Git URL, or
absolute local directory. Select **Preview** before installation.
Npm sources accept registry package names with an optional version or tag.
Git sources accept HTTPS, SSH, and Git URLs.

The preview lists each skill and MCP server by name, with the exact local
command or remote URL beside it, and states why a component was skipped. No
MCP server can start until you approve the shown definitions. If the source
changes after the preview, Sero stops the installation and asks you to preview
it again.

Installed plugins get a namespace in the Sero CLI from the package name. To
change it, open the plugin details and edit the namespace beside **Show in
Sero CLI**.

## Storage

Sero stores package content and writable data separately:

```text
<SERO_AGENT_DIR>/agent-plugins/<install-id>/
<SERO_AGENT_DIR>/agent-plugin-data/<install-id>/
<SERO_AGENT_DIR>/agent-plugins.json
```

Package content is read-only application input. `PLUGIN_DATA` is writable and
survives an update. During removal, you can retain or delete it.

## Skills

Sero discovers only immediate children of `skills/` that contain a regular
file named `SKILL.md`. Each skill must pass the Agent Skills rules. An invalid
skill does not disable valid sibling skills or MCP servers.

Enabled skills become available to new and active sessions without a restart.
Sero uses the Pi resource loader for this integration, but it does not turn an
Agent Plugin into a Pi package.

For container workspaces, Sero mounts the installed Agent Plugin package
directory read-only at the same absolute path. This lets a skill refer to files
inside its own package. Restart an existing workspace container after the first
Agent Plugin installation so the new mount is present. `PLUGIN_DATA` stays on
the host and is not available to general container commands.

## MCP servers

Agent Plugin servers appear in the MCP app with an ownership badge. Their
portable definitions are read-only and do not appear in the raw user MCP
config. Authentication and runtime state stay in Sero and use the stable
installation and server identity. You can enable, disable, connect, and
authenticate a managed server in MCP. These controls do not edit `mcp.json`.

Sero supports stdio, Streamable HTTP, and legacy SSE entries. Non-loopback
remote endpoints must use HTTPS. Sero blocks package path escapes and does not
forward Agent Plugin headers through redirects. An update that changes a local
command or remote endpoint needs new approval.

## Sero CLI

CLI exposure is off by default. Enable it during installation or in the Agent
Plugin detail. The default command paths are:

```text
<plugin-name>/<skill-name>
<plugin-name>/<server-name>/<tool-name>
```

A skill command loads the selected instructions into the current agent. It
does not start a second model invocation. An MCP command uses the existing MCP
runtime connection and keeps all approval, auth, lifecycle, scope, timeout,
and audit controls. Sero adds exact MCP tool paths after the MCP runtime has
discovered and cached the server tools. Safe object schemas become CLI flags.
Other schemas use an explicit JSON object argument.
