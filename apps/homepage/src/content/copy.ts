// Single source of truth for every marketing string and every URL on the
// homepage. Section components import from here. Updating a CTA target or a
// tagline in one place updates the whole site.

import type { ImageMetadata } from "astro";
import seroChat from "@docs-images/sero-chat.jpg";
import explorerBrowser from "@docs-images/explorer-browser.jpg";
import explorerDevServers from "@docs-images/explorer-dev-servers.jpg";
import gitShipDeck from "@docs-images/git-ship-deck.jpg";
import cronJobs from "@docs-images/cron-jobs-editor-crop.jpg";
import research from "@docs-images/research.jpg";
import kanban from "@docs-images/kanban.jpg";
import memory from "@docs-images/memory.jpg";
import cronJobsEditor from "@docs-images/cron-jobs-editor-crop.jpg";
import gitManagement from "@docs-images/git-management.jpg";
import mcpManager from "@docs-images/mcp.jpg";
import adminAgents from "@docs-images/admin-agents.jpg";

export const site = {
	name: "Sero",
	domain: "sero-ai.dev",
	url: "https://sero-ai.dev",
	docs: "https://docs.sero-ai.dev",
	github: "https://github.com/sero-labs/sero",
	tagline: "An agent you can make your own.",
	description:
		"A local-first desktop workspace for macOS, Linux, and Windows — bringing coding agents, tools, memory, apps together as your work changes.",
};

export const links = {
	install: `${site.docs}/guide/installation-requirements`,
	docs: site.docs,
	pluginDocs: `${site.docs}/guide/plugins-and-apps`,
	github: site.github,
	releases: `${site.github}/releases`,
	license: `${site.github}/blob/main/LICENSE`,
};

export const images = {
	seroChat,
	explorerBrowser,
	explorerDevServers,
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
	{ label: "About", href: "#what-it-is" },
	{ label: "Make it yours", href: "#become" },
	{ label: "Plugins", href: "https://docs.sero-ai.dev/plugins/catalog.html" },
	{ label: "Docs", href: links.docs },
	{ label: "GitHub", href: links.github },
];

export const hero = {
	eyebrow: "Sero · source beta · local-first",
	headline: "Build the agent only you need.",
	sub: site.description,
	support:
		"Start with Pi's proven agent loop, then add Sero's desktop shell for coding, research, plugins, memory, secure environments, and day-to-day tasks.",
	primary: { label: "Read setup requirements", href: links.install },
	secondary: { label: "See how Sero grows", href: "#loop" },
};

export const problem = {
	headline: "Most AI tools don't know your project.",
	body: "They run in a separate tab, start fresh every session, and need you to explain yourself from scratch. You end up bridging the gap manually — copying context, switching windows, repeating yourself.",
	resolution: "Sero puts the agent inside your workspace, where it can see your files, run tools, and remember what matters.",
};

export const thesis = {
	headline: "One workspace, shaped around how you work.",
	pillars: [
		{
			title: "Customise the agent",
			body: "Set up memory, identity, custom prompts, specialist agents, and the models you want to use.",
		},
		{
			title: "Add new capabilities",
			body: "Install plugins that add panels, agent tools, commands, background jobs, and external integrations.",
		},
		{
			title: "Keep everything together",
			body: "Projects, sessions, tool state, and context all live in the same place — not scattered across tabs.",
		},
	],
};

export const loop = {
	headline: "Need something Sero doesn't do yet? You can add it.",
	tagline: "Ask. Build a plugin. Use it straight away.",
	steps: [
		{
			n: "01",
			label: "Ask",
			body: "Tell Sero what you need: “I want a weekly planner for this project.”",
			receipt: "chat → describe the capability",
		},
		{
			n: "02",
			label: "Build",
			body: "Sero helps you scaffold a plugin — a manifest, some tools, and optionally a UI panel.",
			receipt: "plugins/weekly-planner/{manifest, tool.ts, App.tsx}",
		},
		{
			n: "03",
			label: "Activate",
			body: "Load it in Admin → Local Plugin Development. It’s live inside Sero immediately.",
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
			"Local runtimes: Apple Container, Docker/Podman, or Host",
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

export type Feature = {
	id: string;
	title: string;
	body: string;
	image: ImageMetadata;
	imageAlt: string;
};

export const features: Feature[] = [
	{
		id: "containers",
		title: "Local development workspaces.",
		body: "Use Apple Container or Docker/Podman for isolated container-backed projects, or explicit Host mode for direct local workflows where supported. Container-backed runtimes keep dev-server ports isolated across projects - no more juggling ports!",
		image: images.explorerDevServers,
		imageAlt: "Dev Servers panel showing multiple projects running on isolated container-backed runtime addresses",
	},
	{
		id: "agents",
		title: "Built on Pi's agent harness.",
		body: "Sero builds on Pi's tools, skills, prompts, agents, and extension model — then adds a desktop workspace around them. Built-in specialists like scout, reviewer, and test-writer are plain Markdown files you can edit, customise, or duplicate.",
		image: images.adminAgents,
		imageAlt: "Admin panel showing a list of custom agent definitions with model and thinking tier badges",
	},
	{
		id: "browser",
		title: "The agent can see your running app.",
		body: "With a container-backed runtime or a ready Host browser pack, Sero's built-in browser opens dev servers and any URL. The agent can take screenshots, record short clips, and check its own work visually — without you having to describe what you see.",
		image: images.explorerBrowser,
		imageAlt: "Sero workspace with the in-app browser showing a live dev server preview alongside the agent chat",
	},
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
	sub: "Start with a solid agent workspace. Add what you need as you go.",
	primary: { label: "Read setup requirements", href: links.install },
	secondary: { label: "Read plugin docs", href: links.pluginDocs },
	tertiary: { label: "View source", href: links.github },
};

export const footer = {
	tagline: "source beta · macOS · Linux · Windows · local-first",
	bottomLeft: "",
	bottomRight: "© sero",
	links: [
		{ label: "Docs", href: links.docs },
		{ label: "GitHub", href: links.github },
		{ label: "License", href: links.license },
	],
};
