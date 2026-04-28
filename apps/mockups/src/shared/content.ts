// Shared marketing content for all landing-page variants.
// Single source of truth: copy from docs/plans/sero-landing-page-marketing-site.md.

import explorerView from "@docs-images/explorer-view.jpg";
import chatImage from "@docs-images/chat.jpg";
import seroChat from "@docs-images/sero-chat.jpg";
import explorerEditor from "@docs-images/explorer-editor.jpg";
import explorerDiff from "@docs-images/explorer-diff.jpg";
import explorerTerminal from "@docs-images/explorer-terminal.jpg";
import explorerBrowser from "@docs-images/explorer-browser.jpg";
import adminAgents from "@docs-images/admin-agents.jpg";
import adminSkills from "@docs-images/admin-skills.jpg";
import adminSettings from "@docs-images/admin-settings.jpg";
import promptManagement from "@docs-images/prompt-management.jpg";
import localPluginPreview from "@docs-images/local-plugin-preview.jpg";
import appStore from "@docs-images/app-store.jpg";
import appDiscovery from "@docs-images/app-discovery.jpg";
import pluginManagement from "@docs-images/plugin-management.jpg";
import memory from "@docs-images/memory.jpg";
import memoryChat from "@docs-images/memory-chat.jpg";
import slashCommands from "@docs-images/slash-commands.jpg";
import gitManagement from "@docs-images/git-management.jpg";
import gitShipDeck from "@docs-images/git-ship-deck.jpg";
import cronJobs from "@docs-images/cron-jobs.jpg";
import cronJobsEditor from "@docs-images/cron-jobs-editor.jpg";
import research from "@docs-images/research.jpg";
import mcp from "@docs-images/mcp.jpg";
import mcpManager from "@docs-images/mcp-manager.jpg";
import themeEditor from "@docs-images/theme-editor.jpg";
import modelTiers from "@docs-images/model-tiers.jpg";
import kanban from "@docs-images/kanban.jpg";
import imagegen from "@docs-images/imagegen.jpg";
import debate from "@docs-images/debate.jpg";

export const images = {
	explorerView,
	chat: chatImage,
	seroChat,
	explorerEditor,
	explorerDiff,
	explorerTerminal,
	explorerBrowser,
	adminAgents,
	adminSkills,
	adminSettings,
	promptManagement,
	localPluginPreview,
	appStore,
	appDiscovery,
	pluginManagement,
	memory,
	memoryChat,
	slashCommands,
	gitManagement,
	gitShipDeck,
	cronJobs,
	cronJobsEditor,
	research,
	mcp,
	mcpManager,
	themeEditor,
	modelTiers,
	kanban,
	imagegen,
	debate,
};

export const hero = {
	eyebrow: "Sero · macOS alpha · local-first",
	headline: "Build the agent only you need.",
	sub: "A local-first macOS workspace bringing your coding agents, tools, memory, and apps together — extensible through plugins as your work changes.",
	support:
		"Start with a capable agent workspace. Add the plugins, agents, and skills your work actually needs — a coding partner, research desk, or project cockpit shaped around you.",
	primary: "Get the macOS alpha",
	secondary: "See how Sero grows",
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
			body: "Sero scaffolds a plugin: shared state, tools, UI, runtime.",
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
	image: string;
};

export const become: BecomePanel[] = [
	{
		id: "coding",
		title: "Coding partner",
		tagline: "Repos, branches, diffs, reviews, tests, terminals, previews.",
		defaults: ["Git plugin", "Subagents (scout, reviewer, test-writer)", "Local runtime + containers"],
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
	primary: "Get Sero",
	secondary: "Read plugin docs",
	tertiary: "View source",
};

export const navLinks = ["Product", "Make it yours", "Plugins", "Docs", "GitHub"];
