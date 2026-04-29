// Single source of truth for every marketing string and every URL on the
// homepage. Section components import from here. Updating a CTA target or a
// tagline in one place updates the whole site.

import type { ImageMetadata } from "astro";
import seroChat from "@docs-images/sero-chat.jpg";
import explorerBrowser from "@docs-images/explorer.jpg";
import gitShipDeck from "@docs-images/git-ship-deck.jpg";
import cronJobs from "@docs-images/cron-jobs-editor-crop.jpg";
import research from "@docs-images/research.jpg";
import kanban from "@docs-images/kanban.jpg";
import memory from "@docs-images/memory.jpg";
import cronJobsEditor from "@docs-images/cron-jobs-editor.jpg";
import gitManagement from "@docs-images/git-management.jpg";
import mcpManager from "@docs-images/mcp-manager.jpg";
import adminAgents from "@docs-images/admin-agents.jpg";

export const site = {
	name: "Sero",
	domain: "sero-ai.dev",
	url: "https://sero-ai.dev",
	docs: "https://docs.sero-ai.dev",
	github: "https://github.com/sero-labs/sero",
	tagline: "An agent you can make your own.",
	description:
		"A local-first macOS workspace bringing your coding agents, tools, memory, and apps together — extensible through plugins as your work changes.",
};

export const links = {
	install: `${site.docs}/guide/installation-requirements`,
	docs: site.docs,
	pluginDocs: `${site.docs}/guide/plugins-and-apps`,
	github: site.github,
	license: `${site.github}/blob/main/LICENSE`,
};

export const images = {
	seroChat,
	explorerBrowser,
	gitShipDeck,
	cronJobs,
	research,
	kanban,
	memory,
	cronJobsEditor,
	gitManagement,
	mcpManager,
	adminAgents,
};

export const navLinks = [
	{ label: "Product", href: "#what-it-is" },
	{ label: "Make it yours", href: "#become" },
	{ label: "Plugins", href: "#plugins" },
	{ label: "Docs", href: links.docs },
	{ label: "GitHub", href: links.github },
];

export const hero = {
	eyebrow: "Sero · macOS alpha · local-first",
	headline: "Build the agent only you need.",
	sub: site.description,
	support:
		"Start with a capable agent workspace. Add the plugins, agents, and skills your work actually needs — a coding partner, research desk, or project cockpit shaped around you.",
	primary: { label: "Get the macOS alpha", href: links.install },
	secondary: { label: "See how Sero grows", href: "#loop" },
};

export const problem = {
	headline: "Generic agents make you carry the workflow.",
	body: "You paste the same context, repeat the same instructions, reopen the same tools, and keep the useful parts in your head. A chat can help with one task, but it rarely becomes part of how you work.",
	resolution: "Sero turns useful workflows into durable workspace capabilities.",
};

export const thesis = {
	headline: "Your Sero can become different from mine.",
	pillars: [
		{
			title: "Shape the agent",
			body: "Edit memory, identity, prompts, skills, specialist agents, models, and profiles.",
		},
		{
			title: "Shape the tools",
			body: "Add plugins with tools, commands, UI, widgets, runtimes, providers, and external integrations.",
		},
		{
			title: "Shape the workspace",
			body: "Keep projects, sessions, runtime, context, and plugin state together.",
		},
	],
};

export const loop = {
	headline: "When Sero is missing a capability, ask it to make one.",
	tagline: "Ask for a capability. Turn it into a plugin. Keep it forever.",
	steps: [
		{
			n: "01",
			label: "Ask",
			body: "“I need a weekly planning assistant for this project.”",
			receipt: "chat → request capability",
		},
		{
			n: "02",
			label: "Build",
			body: "Sero helps scaffold a plugin: shared state, tools, UI, runtime — files you can keep iterating on.",
			receipt: "plugins/weekly-planner/{manifest, tool.ts, App.tsx}",
		},
		{
			n: "03",
			label: "Activate",
			body: "Local Plugin Development runs the checkout directly in Sero.",
			receipt: "Admin → Plugins → Local · status: live",
		},
		{
			n: "04",
			label: "Use",
			body: "The new tool, panel, command, or widget appears in the workspace.",
			receipt: "sidebar.app: weekly-planner · tool: planner.add_task",
		},
		{
			n: "05",
			label: "Keep improving",
			body: "Next week, ask Sero to extend it. The capability stays.",
			receipt: "diff: planner@0.2 → planner@0.3",
		},
	],
};

export type BecomePanel = {
	id: string;
	title: string;
	tagline: string;
	defaults: string[];
	mineExample: string;
	image: ImageMetadata;
};

export const becomeNote = "Examples — your Sero will be different.";

export const become: BecomePanel[] = [
	{
		id: "coding",
		title: "Coding partner",
		tagline: "Repos, branches, diffs, reviews, tests, terminals, previews.",
		defaults: [
			"Git plugin",
			"Subagents (scout, reviewer, test-writer)",
			"Local runtime + containers",
		],
		mineExample: "“Add a release-checklist app for this monorepo.”",
		image: images.gitShipDeck,
	},
	{
		id: "assistant",
		title: "Personal assistant",
		tagline: "Reminders, recurring prompts, profiles, personal memory.",
		defaults: ["Scheduler plugin", "Memory plugin", "Web plugin"],
		mineExample: "“Remind me each Friday to log expenses, then file them.”",
		image: images.cronJobs,
	},
	{
		id: "research",
		title: "Research desk",
		tagline: "Search, sources, bookmarks, summaries, saved context.",
		defaults: ["Web plugin", "MCP plugin", "Custom skills + agents"],
		mineExample: "“Build a paper-tracker plugin that watches arXiv categories.”",
		image: images.research,
	},
	{
		id: "ops",
		title: "Operations console",
		tagline: "Dashboards, monitors, routines, external APIs, jobs.",
		defaults: ["Plugin UIs + widgets", "Background runtimes", "Provider plugins"],
		mineExample: "“Make a deploy console that pings my staging cluster.”",
		image: images.kanban,
	},
];

export const pluginAnatomy = [
	{ slot: "ui", label: "UI panel", note: "React surface, persistent" },
	{ slot: "tools", label: "Agent tools", note: "Pi-callable functions" },
	{ slot: "commands", label: "Commands", note: "User-invoked actions" },
	{ slot: "state", label: "Shared state", note: "File-backed, profile-scoped" },
	{ slot: "runtime", label: "Background runtime", note: "Long-running jobs" },
	{ slot: "widgets", label: "Dashboard widgets", note: "Composable surfaces" },
	{ slot: "prompts", label: "Prompts / skills", note: "Reusable behaviors" },
	{ slot: "provider", label: "Provider / integration", note: "External services" },
];

export const builtins = [
	{ name: "Memory", desc: "Identity, profile, long-term facts, daily logs.", img: images.memory },
	{ name: "Scheduler", desc: "Recurring prompts and reminders.", img: images.cronJobsEditor },
	{ name: "Web", desc: "Search, fetch, code lookup, bookmarks.", img: images.research },
	{ name: "Git", desc: "Branches, staging, commits, diffs, history.", img: images.gitManagement },
	{ name: "MCP", desc: "Connect external MCP tools and resources.", img: images.mcpManager },
	{ name: "Admin", desc: "Edit agents, skills, prompts, plugins, sessions.", img: images.adminAgents },
];

export const cta = {
	headline: "Make Sero yours.",
	sub: "Start with a local agent workspace. Then teach it the tools, assistants, and workflows you want to keep.",
	primary: { label: "Get Sero", href: links.install },
	secondary: { label: "Read plugin docs", href: links.pluginDocs },
	tertiary: { label: "View source", href: links.github },
};

export const footer = {
	tagline: "workshop OS · alpha · local-first · macOS apple silicon",
	bottomLeft: "plugins are how sero learns new work.",
	bottomRight: "© sero · source-only OSS",
	links: [
		{ label: "Docs", href: links.docs },
		{ label: "GitHub", href: links.github },
		{ label: "License", href: links.license },
	],
};
