// Per-capability motion layered on each screen. Every builder receives the
// 3D holder around the screen and returns a draw(t) function.

import { BEAT, ease, el, hash, lerp, pose, prog, pulse, rng, svgEl } from "../lib.js";
import { crop, screen } from "../screens.js";

function chip(parent, html, cls = "") {
	return el("div", `chip ${cls}`, parent, `<span class="dot"></span>${html}`);
}

/** Pop a chip out of the screen toward the viewer. */
function popOut(node, t, t0, x, y, z, bob = 6) {
	const p = prog(t, t0, t0 + 0.42);
	const s = p <= 0 ? 0 : ease.outBack(p);
	const float = Math.sin((t - t0) * 2.4 + x) * bob;
	pose(node, `translate3d(${x}px,${y + float}px,${z * ease.outExpo(p)}px) scale(${0.55 + 0.45 * s})`, Math.min(1, p * 3));
}

function memory(holder, { w, h, C }) {
	const scan = el("div", "scanbar", holder);
	const facts = [
		["prefers pnpm over npm", -0.06, 0.1, 190],
		["ships releases on fridays", 0.5, 0.22, 150],
		["phoenix studio → vite + react", -0.03, 0.6, 230],
		["runs tests before commits", 0.48, 0.8, 170],
	].map(([text, fx, fy, z]) => ({ node: chip(holder, text), x: fx * w, y: fy * h, z }));
	return (t) => {
		const sweep = ((t - C) * 0.55) % 1;
		Object.assign(scan.style, { left: `${0.035 * w}px`, width: `${0.16 * w}px`, top: `${(0.1 + sweep * 0.82) * h}px`, height: `${0.026 * h}px` });
		scan.style.opacity = String(prog(t, C + 0.2, C + 0.4));
		facts.forEach((f, k) => popOut(f.node, t, C + 0.45 + k * (BEAT / 2), f.x, f.y, f.z));
	};
}

function browser(holder, { w, shot, C }) {
	const region = [0.214, 0.095, 0.472, 0.881];
	const R = { x: region[0] * w, y: shot.barH + region[1] * shot.viewH, w: region[2] * w, h: region[3] * shot.viewH };
	const finder = el("div", "finder", holder);
	Object.assign(finder.style, { left: `${R.x}px`, top: `${R.y}px`, width: `${R.w}px`, height: `${R.h}px` });
	for (const c of ["tl", "tr", "bl", "br"]) el("i", c, finder);
	const tag = el("div", "finder-tag", finder, "● browser · 192.168.64.55:3000");
	const flash = el("div", "finder-flash", finder);
	const thumbW = R.w * 0.42;
	const thumb = crop(holder, "browser", thumbW, region);
	thumb.classList.add("thumb");
	const saved = chip(holder, "screenshot.png · 1920×1080");
	return (t) => {
		const p = ease.outExpo(prog(t, C + 0.3, C + 0.7));
		pose(finder, `translateZ(20px) scale(${lerp(1.3, 1, p)})`, p);
		tag.style.opacity = String(prog(t, C + 0.55, C + 0.7));
		flash.style.opacity = String(t >= C + 0.94 ? 0.9 * pulse(t, C + 0.94, 7) : 0);
		const t0 = C + 1.0;
		const q = ease.inOutCubic(prog(t, t0, t0 + 0.42));
		const x = lerp(R.x + R.w / 2, 0.8 * w, q) - thumbW / 2;
		const y = lerp(R.y + R.h / 2, 0.52 * shot.height, q) - (thumbW * R.h) / R.w / 2;
		const s = lerp(R.w / thumbW, 1, q);
		const z = Math.sin(q * Math.PI) * 220 + q * 120;
		pose(thumb, `translate3d(${x}px,${y}px,${z}px) rotateZ(${-5 * q}deg) scale(${s})`, t >= t0 ? 1 : 0);
		popOut(saved, t, C + 1.38, 0.62 * w, 0.52 * shot.height + (thumbW * R.h) / R.w / 2 + 16, 140, 3);
	};
}

const CODE = [
	["package.json", '"sero": {\n  "app": {\n    "id": "planner",\n    "name": "Weekly Planner"\n  }\n}'],
	["extension/tools.ts", 'pi.registerTool({\n  name: "planner_add",\n  label: "Add task",\n  execute: addTask,\n});'],
	["ui/PlannerApp.tsx", "export function PlannerApp() {\n  const [state] = useAppState();\n  return <Week tasks={state.tasks} />;\n}"],
];
const TASKS = ["Draft release notes", "Review PR #380", "Plan sprint goals", "Log expenses"];

function plugins(holder, { w, h, C }) {
	const win = el("div", "screen mockwin", holder);
	Object.assign(win.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${w * 0.012}px` });
	const bar = el("div", "screen-bar", win);
	bar.style.cssText += `height:${w * 0.028}px;gap:${w * 0.006}px;padding-left:${w * 0.012}px`;
	for (const c of ["#ec6a5e", "#f4bf4f", "#61c554"]) el("i", "", bar).style.cssText = `background:${c};width:${w * 0.009}px;height:${w * 0.009}px`;
	const side = el("div", "mw-side", win);
	el("div", "mw-h", side, "apps");
	for (const name of ["Dashboard", "Explorer", "Admin", "Scheduler", "Git"]) el("div", "mw-item", side, name);
	const fresh = el("div", "mw-item fresh", side, "Weekly Planner <b>new</b>");
	const main = el("div", "mw-main", win);
	const hint = el("div", "mw-hint", main);
	const ask = "I want a weekly planner for this project.";

	const cards = CODE.map(([file, code], k) => {
		const card = el("div", "codecard", holder);
		el("div", "cc-head", card, file);
		const pre = el("div", "cc-body", card);
		const lines = code.split("\n").map((line) => el("div", "", pre, line.replace(/&/g, "&amp;").replace(/</g, "&lt;") || "&nbsp;"));
		const r = (n) => hash(k * 11 + n);
		return { card, lines, fx: 0.2 + k * 0.19, fy: 0.16 + k * 0.1, rz: (k - 1) * 6, z: 40 + k * 50, sx: (r(1) - 0.5) * 900, sy: -300 - r(2) * 200, sry: (r(3) - 0.5) * 80 };
	});
	const planner = el("div", "planner", holder);
	planner.innerHTML = `<div class="pl-top"><b>Weekly Planner</b><span class="pl-live">● live</span></div><div class="pl-sub">plugin · this week · ${TASKS.length} tasks</div>`;
	const rows = TASKS.map((task) => el("div", "pl-row", planner, `<i></i><span>${task}</span>`));
	const PW = 0.56 * w;
	Object.assign(planner.style, { width: `${PW}px`, left: `${0.62 * w - PW / 2}px`, top: `${0.2 * h}px` });

	return (t) => {
		const typed = Math.floor(ask.length * prog(t, C + 0.02, C + 0.4));
		const caret = Math.floor(t / (BEAT / 2)) % 2 ? "" : "▍";
		hint.innerHTML = typed ? `<b>&gt;</b> <span class="ask">${ask.slice(0, typed)}</span><b>${caret}</b>` : "Ask Sero anything…";
		hint.classList.toggle("sent", t > C + 0.44);
		const collapse = ease.inCubic(prog(t, C + 0.9, C + 1.08));
		cards.forEach((c, k) => {
			const p = ease.outExpo(prog(t, C + 0.2 + k * 0.1, C + 0.75 + k * 0.1));
			const x = lerp(c.fx * w + c.sx, c.fx * w, p);
			const y = lerp(c.fy * h + c.sy, c.fy * h, p);
			const cx = lerp(x, 0.62 * w - 210, collapse);
			const cy = lerp(y, 0.4 * h, collapse);
			const z = lerp(600, c.z, p) + collapse * 120;
			pose(c.card, `translate3d(${cx}px,${cy}px,${z}px) rotateY(${(1 - p) * c.sry}deg) rotateZ(${c.rz * (1 - collapse)}deg) scale(${1 - collapse * 0.8})`, Math.min(1, p * 2) * (1 - collapse));
			c.lines.forEach((line, i) => {
				const q = prog(t, C + 0.35 + k * 0.1 + i * 0.05, C + 0.5 + k * 0.1 + i * 0.05);
				line.style.clipPath = `inset(0 ${(1 - q) * 100}% 0 0)`;
			});
		});
		const pp = prog(t, C + 1.0, C + 1.35);
		pose(planner, `translateZ(${60 + 60 * (1 - pp)}px) scale(${pp <= 0 ? 0.6 : 0.6 + 0.4 * ease.outBack(pp)})`, Math.min(1, pp * 3));
		rows.forEach((row, k) => row.classList.toggle("done", t >= C + 1.25 + k * (BEAT / 4)));
		const f = ease.outExpo(prog(t, C + 1.05, C + 1.4));
		fresh.style.maxHeight = `${f * 60}px`;
		fresh.style.transform = `translateX(${(1 - f) * -40}px)`;
		fresh.style.opacity = String(f);
	};
}

function graphify(holder, { w, h, C }) {
	const area = { x: 0.012 * w, y: 0.075 * h, w: 0.555 * w, h: 0.86 * h };
	const dim = el("div", "graph-dim", holder);
	Object.assign(dim.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` });
	const svg = svgEl("svg", { width: area.w, height: area.h, class: "graph" }, holder);
	Object.assign(svg.style, { left: `${area.x}px`, top: `${area.y}px` });
	const r = rng(7);
	const nodes = [];
	while (nodes.length < 30) {
		const n = { x: 40 + r() * (area.w - 80), y: 40 + r() * (area.h - 80) };
		if (nodes.every((m) => Math.hypot(m.x - n.x, m.y - n.y) > 62)) nodes.push(n);
	}
	const mid = { x: area.w * 0.45, y: area.h * 0.45 };
	const root = nodes.reduce((a, b) => (Math.hypot(a.x - mid.x, a.y - mid.y) < Math.hypot(b.x - mid.x, b.y - mid.y) ? a : b));
	const edges = new Map();
	nodes.forEach((a, i) => {
		const near = nodes.map((b, j) => [Math.hypot(a.x - b.x, a.y - b.y), j]).sort((p, q) => p[0] - q[0]);
		for (const [, j] of near.slice(1, 4)) edges.set([Math.min(i, j), Math.max(i, j)].join(), [Math.min(i, j), Math.max(i, j)]);
	});
	// Breadth-first reveal from the root, like the traversal in the screenshot.
	const depth = new Map([[nodes.indexOf(root), 0]]);
	const parent = new Map();
	const queue = [nodes.indexOf(root)];
	while (queue.length) {
		const i = queue.shift();
		for (const [a, b] of edges.values()) {
			const j = a === i ? b : b === i ? a : -1;
			if (j >= 0 && !depth.has(j)) {
				depth.set(j, depth.get(i) + 1);
				parent.set(j, i);
				queue.push(j);
			}
		}
	}
	const appear = (i) => C + 0.3 + (depth.get(i) ?? 7) * 0.12;
	const lines = [...edges.values()].map(([a, b]) => {
		const tree = parent.get(b) === a || parent.get(a) === b;
		const [from, to] = parent.get(a) === b ? [b, a] : [a, b];
		const line = svgEl("line", { x1: nodes[from].x, y1: nodes[from].y, x2: nodes[to].x, y2: nodes[to].y, class: tree ? "tree" : "link" }, svg);
		const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
		line.style.strokeDasharray = `${len}`;
		return { line, len, t0: Math.max(appear(a), appear(b)) - 0.12, tree };
	});
	const LABELS = ["pathfinding.ts", "runAStar()", "runDijkstra()", "types.ts", "maze.ts", "getNeighbours()"];
	const circles = nodes.map((n, i) => {
		const c = svgEl("circle", { cx: n.x, cy: n.y, r: 7, class: n === root ? "root" : "" }, svg);
		const k = n === root ? 0 : i % 5 === 1 ? 1 + (i % LABELS.length) : -1;
		const label = k >= 0 && k < LABELS.length ? svgEl("text", { x: n.x + 14, y: n.y + 5 }, svg) : null;
		if (label) label.textContent = LABELS[k];
		return { c, label, i, d: Math.hypot(n.x - root.x, n.y - root.y) };
	});
	const q = el("div", "graph-query", holder, "graphify_search · BFS depth=2 · 46 related nodes");
	Object.assign(q.style, { left: `${area.x + 18}px`, top: `${area.y + 16}px` });
	return (t) => {
		dim.style.opacity = String(0.88 * prog(t, C + 0.1, C + 0.35));
		q.style.opacity = String(prog(t, C + 0.2, C + 0.35));
		for (const l of lines) {
			const p = ease.outCubic(prog(t, l.t0, l.t0 + 0.14));
			l.line.style.strokeDashoffset = String(l.len * (1 - p));
			l.line.style.opacity = String(p > 0 ? (l.tree ? 1 : 0.35) : 0);
		}
		const wave = (t - (C + 1.25)) * 900;
		for (const n of circles) {
			const a = t - appear(n.i);
			const boost = wave > 0 ? Math.exp(-Math.abs(n.d - wave) / 40) : 0;
			const r = a < 0 ? 0 : 7 * Math.min(1, a / 0.1) * (1 + 0.6 * Math.exp(-a * 10)) + boost * 6;
			n.c.setAttribute("r", String(r));
			if (n.label) n.label.style.opacity = String(prog(t, appear(n.i) + 0.05, appear(n.i) + 0.25));
		}
	};
}

function rooms(holder, { w, h, C }) {
	const decks = [
		{ node: screen(holder, "board", w * 0.8, "side-card").root, x: 0.08 * w, y: -0.3 * h, z: -420, rz: -5, t0: C + 0.1 },
		{ node: screen(holder, "plan", w * 0.8, "side-card").root, x: 0.3 * w, y: 0.28 * h, z: -640, rz: 6, t0: C + 0.22 },
	];
	const crew = [
		["scout", "#10b981", 0.03, 0.06],
		["reviewer", "#f05523", 0.66, 0.1],
		["test-writer", "#8b5cf6", 0.06, 0.78],
		["conductor", "#f89621", 0.62, 0.84],
	].map(([name, color, fx, fy]) => {
		const node = el("div", "chip crew", holder, `<span class="bot" style="background:${color}"><i></i><i></i></span>${name}`);
		return { node, x: fx * w, y: fy * h };
	});
	return (t) => {
		for (const d of decks) {
			const p = ease.outExpo(prog(t, d.t0, d.t0 + 0.55));
			pose(d.node, `translate3d(${d.x}px,${d.y + (1 - p) * 900}px,${d.z}px) rotateZ(${d.rz * p}deg)`, Math.min(1, p * 2));
		}
		crew.forEach((c, k) => popOut(c.node, t, C + 0.55 + k * (BEAT / 2), c.x, c.y, 200));
	};
}

function local(holder, { w, h, C }) {
	const pad = 34;
	const D = 220;
	const zf = 40;
	const x0 = -pad;
	const y0 = -pad;
	const BW = w + pad * 2;
	const BH = h + pad * 2;
	const edges = [];
	const edge = (kind, x, y, z, len) => {
		const node = el("i", `edge ${kind}`, holder);
		Object.assign(node.style, { left: `${x}px`, top: `${y}px`, [kind === "v" ? "height" : "width"]: `${len}px` });
		edges.push({ node, kind, z });
	};
	for (const z of [zf, zf - D]) {
		edge("h", x0, y0, z, BW);
		edge("h", x0, y0 + BH, z, BW);
		edge("v", x0, y0, z, BH);
		edge("v", x0 + BW, y0, z, BH);
	}
	for (const [x, y] of [[x0, y0], [x0 + BW, y0], [x0, y0 + BH], [x0 + BW, y0 + BH]]) edge("d", x, y, zf, D);
	const pills = ["host", "docker / podman", "apple container"].map((name, k) => ({ node: chip(holder, name, k === 2 ? "flame" : ""), x: (0.02 + k * 0.3) * w, y: -pad - 70 }));
	const oss = chip(holder, "open source · apache-2.0");
	// The Dev Servers popover: every project on :3000, each in its own runtime.
	const servers = el("div", "servers", holder);
	el("div", "sv-head", servers, "<i></i>Dev Servers <span>(3 running)</span>");
	const rows = [
		["Phoenix Studio", "vite", "53"],
		["Atlas Design Tokens", "vite", "55"],
		["harbor-api", "node", "54"],
	].map(([name, kind, ip]) => el("div", "sv-row", servers, `<i></i><b>${name}</b><em>${kind}</em><small>:3000 · http://192.168.64.${ip}:3000</small>`));
	return (t) => {
		edges.forEach((e, k) => {
			const p = ease.outCubic(prog(t, C + 0.22 + k * 0.035, C + 0.55 + k * 0.035));
			const grow = e.kind === "v" ? `scaleY(${p})` : `scaleX(${p})`;
			const turn = e.kind === "d" ? "rotateY(90deg)" : "";
			e.node.style.transform = `translateZ(${e.z}px) ${turn} ${grow}`;
			e.node.style.opacity = String(p > 0 ? 1 : 0);
		});
		pills.forEach((p, k) => popOut(p.node, t, C + 0.94 + k * (BEAT / 4), p.x, p.y, zf, 3));
		popOut(oss, t, C + 1.35, 0.04 * w, 0.84 * h, 160, 3);
		popOut(servers, t, C + 0.4, 0.5 * w, 0.3 * h, 190, 4);
		rows.forEach((row, k) => {
			const r = ease.outExpo(prog(t, C + 0.55 + k * (BEAT / 2), C + 0.9 + k * (BEAT / 2)));
			pose(row, `translateX(${(1 - r) * 40}px)`, r);
			row.classList.toggle("up", t > C + 0.7 + k * (BEAT / 2));
		});
	};
}

export const OVERLAYS = { memory, browser, plugins, graphify, rooms, local };
