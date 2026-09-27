// 0:11.25–0:22.5 — six capabilities, one bar each. Every cut uses a
// different transition; a rail at the bottom tracks progress.

import { ring } from "../fx.js";
import { scramble } from "../hud.js";
import { at, BAR, ease, el, lerp, pose, prog, revealChars, splitChars, spring, tf, tw } from "../lib.js";
import { SHOTS, screen, sweep } from "../screens.js";
import { OVERLAYS } from "./overlays.js";

const FIRST = 6; // bar index of the first capability
const FEATURES = [
	{ key: "memory", label: "memory", lines: ["it", "remembers."], caption: "Memory that carries across every session.", shot: "memory", side: "right", enter: "rise" },
	{ key: "browser", label: "browser", lines: ["it sees", "its work."], caption: "A built-in browser for previews, screenshots and clips.", shot: "browser", side: "left", enter: "whip" },
	{ key: "plugins", label: "plugins", lines: ["it builds", "its own", "tools."], caption: "Ask for a plugin. Use it straight away.", shot: null, side: "right", enter: "flip" },
	{ key: "graphify", label: "graphify", lines: ["it knows", "your code."], caption: "A local map of every repo, kept up to date.", shot: "graphify", side: "left", enter: "zoom" },
	{ key: "rooms", label: "rooms", lines: ["it works", "as a team."], caption: "Rooms of specialist agents, run from one board.", shot: "room", side: "right", enter: "deal" },
	{ key: "local", label: "local-first", lines: ["it runs", "on your", "machine."], caption: "macOS, Linux and Windows. Host, Docker or Apple Container.", shot: "chat", side: "left", enter: "iris" },
];
const SCREEN_W = 1060;
const MAX_H = 640;

// Group poses for each transition. `p` runs 0..1 through the move.
const MOVES = {
	rise: { in: (p) => ({ y: (1 - p) * 900, rx: -(1 - p) * 30 }), out: (p) => ({ y: -p * 900, rx: p * 20, o: 1 - p }) },
	whip: { in: (p) => ({ x: (1 - p) * 2300 }), out: (p) => ({ x: -p * 2300 }) },
	flip: { in: (p) => ({ rx: -(1 - p) * 88, y: (1 - p) * 260, o: Math.min(1, p * 3) }), out: (p) => ({ rx: p * 88, y: -p * 260, o: 1 - p }) },
	zoom: { in: (p) => ({ s: 0.45 + 0.55 * p, o: Math.min(1, p * 2.5) }), out: (p) => ({ s: 1 + p * 3.2, o: 1 - p }) },
	deal: { in: (p) => ({ y: (1 - p) * 1150, rz: -(1 - p) * 9 }), out: (p) => ({ y: p * 1250, rz: p * 12 }) },
	iris: { in: () => ({}), out: (p) => ({ s: 1 - 0.12 * p, o: 1 - p * 0.7 }) },
	pull: { in: () => ({}), out: (p) => ({ x: 340 * p, s: 1 - 0.45 * p, o: 1 - p }) },
};

const items = [];
let rail;

function buildFeature(root, f, i) {
	const C = at(FIRST + i);
	const group = el("div", "fgroup", root);
	const right = f.side === "right";
	const cx = right ? 1300 : 620;
	const text = el("div", "ftext", group);
	text.style.left = right ? "130px" : "1210px";
	const labelEl = el("div", "flabel", text);
	const head = el("div", "fhead", text);
	const lines = f.lines.map((line, k) => {
		const row = el("div", k === f.lines.length - 1 ? "accent" : "", head);
		return splitChars(el("span", "mask", row), line);
	});
	const cap = el("div", "fcap", text, f.caption);

	const holder = el("div", "holder", group);
	let shot = null;
	let w = SCREEN_W;
	let h = SCREEN_W * 0.6;
	if (f.shot) {
		const s = SHOTS[f.shot];
		w = Math.min(SCREEN_W, Math.round((MAX_H - (s.chrome ? 30 : 0)) * (s.w / s.h)));
		shot = screen(holder, f.shot, w);
		h = shot.height;
	}
	Object.assign(holder.style, { width: `${w}px`, height: `${h}px`, left: `${cx - w / 2}px`, top: `${520 - h / 2}px` });
	const overlay = OVERLAYS[f.key](holder, { w, h, shot, C });
	return { ...f, i, C, next: at(FIRST + i + 1), group, text, labelEl, lines, cap, holder, shot, overlay, right, cx };
}

function groupPose(item, t) {
	const nextMove = i => (i + 1 < FEATURES.length ? FEATURES[i + 1].enter : "pull");
	const pin = ease.outExpo(prog(t, item.C - 0.04, item.C + 0.5));
	const pout = ease.inCubic(prog(t, item.next - 0.22, item.next + 0.06));
	const a = item.i === 0 ? MOVES.rise.in(pin) : MOVES[item.enter].in(pin);
	const b = MOVES[nextMove(item.i)].out(pout);
	return {
		x: (a.x ?? 0) + (b.x ?? 0),
		y: (a.y ?? 0) + (b.y ?? 0),
		rx: (a.rx ?? 0) + (b.rx ?? 0),
		rz: (a.rz ?? 0) + (b.rz ?? 0),
		s: (a.s ?? 1) * (b.s ?? 1),
		o: (a.o ?? 1) * (b.o ?? 1),
	};
}

function drawFeature(item, t, env) {
	const g = groupPose(item, t);
	pose(item.group, tf(g), g.o);
	if (item.enter === "iris") {
		const r = 1500 * ease.outCubic(prog(t, item.C - 0.05, item.C + 0.42));
		item.group.style.clipPath = r >= 1499 ? "none" : `circle(${r}px at 960px 540px)`;
		ring(env.front, t, { t0: item.C - 0.05, x: 960, y: 540, r0: 0, r1: 1500, dur: 0.42, width: 5, color: "16,185,129" });
	}

	// Screen: settles with a spring, then drifts slowly toward the viewer.
	const d = t - item.C;
	const settle = 1 - spring(d, 1.1, 4.5);
	const side = item.right ? -1 : 1;
	const ry = side * (15 + settle * 22) - side * tw(t, item.C, item.next, 0, 5, ease.linear);
	const rx = 4 + settle * 10;
	const z = tw(t, item.C, item.next, -40, 60, ease.linear);
	item.holder.style.transform = `translateZ(${z}px) rotateY(${ry}deg) rotateX(${rx}deg)`;
	if (item.shot) sweep(item.shot.sheen, prog(t, item.C + 0.25, item.C + 1.05));

	item.labelEl.textContent = scramble(`0${item.i + 1} / 06 — ${item.label}`, prog(t, item.C, item.C + 0.35), item.i * 31);
	item.lines.forEach((chars, k) => revealChars(chars, t, item.C + 0.06 + k * 0.08, { stagger: 0.018, dur: 0.45 }));
	const c = ease.outExpo(prog(t, item.C + 0.3, item.C + 0.8));
	pose(item.cap, `translateY(${(1 - c) * 24}px)`, c);
	item.overlay(t, env);
}

function buildRail(root) {
	const node = el("div", "rail", root);
	const line = el("div", "rail-line", node);
	const fill = el("div", "rail-fill", node);
	const head = el("div", "rail-head", node);
	const stops = FEATURES.map((f, i) => {
		const stop = el("div", "rail-stop", node);
		stop.style.left = `${(i / (FEATURES.length - 1)) * 100}%`;
		el("i", "", stop);
		el("span", "", stop, f.label);
		return stop;
	});
	rail = { node, line, fill, head, stops };
}

function drawRail(t) {
	const grow = ease.outExpo(prog(t, at(FIRST) - 0.45, at(FIRST) + 0.4));
	const gone = ease.inCubic(prog(t, at(FIRST + 6) - 0.25, at(FIRST + 6) + 0.1));
	pose(rail.node, `translateY(${gone * 60}px)`, 1 - gone);
	rail.line.style.transform = `scaleX(${grow})`;
	const pos = Math.min(FEATURES.length - 1, Math.max(0, (t - at(FIRST)) / BAR));
	const frac = pos / (FEATURES.length - 1);
	rail.fill.style.transform = `scaleX(${frac * grow})`;
	rail.head.style.left = `${frac * 100}%`;
	pose(rail.head, "translate(-50%,-50%)", grow);
	rail.stops.forEach((stop, i) => {
		const on = prog(t, at(FIRST) - 0.45 + i * 0.06, at(FIRST) - 0.2 + i * 0.06);
		const active = Math.floor(pos + 1e-6) === i;
		stop.classList.toggle("active", active);
		stop.classList.toggle("done", pos > i);
		pose(stop, `translate(-50%, 0) scale(${lerp(0.4, 1, ease.outBack(on))})`, on);
	});
}

export default {
	scenes: [
		...FEATURES.map((f, i) => {
			let item;
			return {
				from: at(FIRST + i) - 0.12,
				to: at(FIRST + i + 1) + 0.12,
				build: (root) => {
					root.classList.add("fscene");
					item = buildFeature(root, f, i);
				},
				draw: (t, env) => drawFeature(item, t, env),
			};
		}),
		{ from: at(FIRST) - 0.5, to: at(FIRST + 6) + 0.15, build: buildRail, draw: (t) => drawRail(t) },
	],
};
