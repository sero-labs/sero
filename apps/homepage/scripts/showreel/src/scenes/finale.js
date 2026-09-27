// 0:22.5–0:30 — pull back to the whole workspace, spin the ask → build →
// use → grow loop, and land on the end card.

import { phoenix, prepareStroke, wordmark } from "../brand.js";
import { burst, embers, flare, glow, ring, streaks } from "../fx.js";
import { at, BEAT, clamp, DURATION, ease, el, lerp, pose, prog, pulse, revealChars, splitChars, spring, svgEl, tw } from "../lib.js";
import { screen } from "../screens.js";

const WALL = at(12);
const LOOP = at(13);
const END = at(14);
const TILE_W = 520;
const TILE_H = 326;
const GAP = 34;
const GRID = [
	["research", "design", "board", "git", "cron"],
	["graphify", "browser", "chat", "memory", "room"],
	["agents", "plugins", "plan", "loom", "gallery"],
];
// Receipts from the homepage's self-extension loop.
const STATIONS = [
	{ word: "ask", note: "chat → describe the capability", ang: -90 },
	{ word: "build", note: "plugins/weekly-planner/", ang: 0 },
	{ word: "use", note: "sidebar.app: weekly-planner", ang: 90 },
	{ word: "grow", note: "planner@0.2 → planner@0.3", ang: 180 },
];
const R = 300;

const wall = {};
const loop = {};
const end = {};

function buildWall(root) {
	root.classList.add("wall-scene");
	wall.plane = el("div", "plane", root);
	const PW = 5 * TILE_W + 4 * GAP;
	const PH = 3 * TILE_H + 2 * GAP;
	wall.tiles = GRID.flatMap((row, r) =>
		row.map((key, c) => {
			const tile = el("div", "tile", wall.plane);
			const x = -PW / 2 + c * (TILE_W + GAP);
			const y = -PH / 2 + r * (TILE_H + GAP);
			Object.assign(tile.style, { width: `${TILE_W}px`, height: `${TILE_H}px`, left: `${x}px`, top: `${y}px` });
			screen(tile, key, TILE_W);
			return { tile, d: Math.hypot(c - 2, (r - 1) * 1.3) };
		}),
	);
	const svg = svgEl("svg", { class: "traces", width: PW, height: PH }, wall.plane);
	Object.assign(svg.style, { left: `${-PW / 2}px`, top: `${-PH / 2}px`, transform: "translateZ(2px)" });
	const paths = [];
	for (let r = 1; r < 3; r++) {
		const y = r * (TILE_H + GAP) - GAP / 2;
		paths.push(svgEl("path", { d: `M0 ${y} H${PW}` }, svg));
	}
	for (let c = 1; c < 5; c++) {
		const x = c * (TILE_W + GAP) - GAP / 2;
		paths.push(svgEl("path", { d: `M${x} 0 V${PH}` }, svg));
	}
	wall.paths = paths.map((p, i) => ({ p, len: p.getTotalLength(), i }));
	wall.scrim = el("div", "scrim", root);
	// The homepage hero line, typed like a terminal on the second row.
	const build = el("div", "wall-title", root);
	Object.assign(build.style, { top: "372px", fontSize: "120px", fontWeight: "700" });
	const need = el("div", "wall-title accent", root);
	Object.assign(need.style, { top: "512px", fontSize: "120px", fontWeight: "700" });
	wall.build = splitChars(el("span", "mask", build), "build the agent");
	wall.need = el("span", "", need);
	wall.cursor = el("span", "cursor", need);
	wall.titles = [build, need];
}

function drawWall(t) {
	const p = ease.outExpo(prog(t, WALL - 0.08, WALL + 1.1));
	const out = ease.inCubic(prog(t, LOOP - 0.25, LOOP + 0.12));
	const s = lerp(1.75, 0.6, p) * (1 - out * 0.45);
	// Match cut: the centre tile takes over from the last capability screen.
	const fadeIn = prog(t, WALL - 0.02, WALL + 0.12);
	const rx = lerp(0, 16, p) + t * 0.4 - WALL * 0.4;
	const rz = lerp(0, -6, p);
	pose(wall.plane, `translateZ(${-out * 900}px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${s})`, fadeIn * (1 - out));
	for (const tl of wall.tiles) {
		const k = ease.outExpo(prog(t, WALL + 0.02 + tl.d * 0.05, WALL + 0.6 + tl.d * 0.05));
		const center = tl.d === 0;
		pose(tl.tile, `translateZ(${center ? 0 : lerp(-260, 0, k)}px)`, center ? 1 : k);
	}
	for (const { p: path, len, i } of wall.paths) {
		const draw = ease.outCubic(prog(t, WALL + 0.35 + i * 0.05, WALL + 0.9 + i * 0.05));
		path.style.strokeDasharray = `${len * draw} ${len}`;
		path.style.opacity = String(0.85 * draw);
	}
	pose(wall.scrim, "none", prog(t, WALL + 0.25, WALL + 0.6) * (1 - out));
	revealChars(wall.build, t, WALL + 0.44, { stagger: 0.02, dur: 0.45 });
	const need = "only_you_need";
	const typed = Math.floor(need.length * prog(t, at(12, 2), at(12, 2) + 0.42));
	wall.need.textContent = need.slice(0, typed);
	const blink = Math.floor(t / (BEAT / 2)) % 2 === 0;
	pose(wall.cursor, "none", t > at(12, 1.8) && (typed < need.length || blink) ? 1 : 0);
	wall.titles.forEach((n, i) => {
		const o = ease.inExpo(prog(t, LOOP - 0.3 + i * 0.04, LOOP + i * 0.04));
		pose(n, `translateY(${-o * 180}px)`, 1 - o);
	});
}

function buildLoop(root) {
	const svg = svgEl("svg", { class: "loop-ring", viewBox: "0 0 1920 1080" }, root);
	loop.group = svgEl("g", {}, svg);
	svgEl("circle", { class: "track", cx: 960, cy: 540, r: R }, loop.group);
	loop.ticks = svgEl("g", {}, loop.group);
	for (let i = 0; i < 72; i++) {
		const a = (i / 72) * Math.PI * 2;
		const r1 = i % 6 === 0 ? R + 16 : R + 22;
		svgEl("line", { x1: 960 + Math.cos(a) * r1, y1: 540 + Math.sin(a) * r1, x2: 960 + Math.cos(a) * (R + 30), y2: 540 + Math.sin(a) * (R + 30) }, loop.ticks);
	}
	loop.stops = STATIONS.map((s) => {
		const a = (s.ang * Math.PI) / 180;
		return svgEl("circle", { class: "stop", cx: 960 + Math.cos(a) * R, cy: 540 + Math.sin(a) * R, r: 12 }, loop.group);
	});
	loop.mark = phoenix(root, "loop-phoenix").svg;
	loop.labels = STATIONS.map((s) => {
		const node = el("div", "loop-label", root);
		const word = splitChars(el("span", "mask", node), s.word);
		el("small", "", node, s.note);
		const a = (s.ang * Math.PI) / 180;
		const x = 960 + Math.cos(a) * (R + 70);
		const y = 540 + Math.sin(a) * (R + 70);
		const ax = s.ang === 0 ? 0 : s.ang === 180 ? -100 : -50;
		const ay = s.ang === -90 ? -100 : s.ang === 90 ? 0 : -50;
		Object.assign(node.style, { left: `${x}px`, top: `${y}px`, textAlign: s.ang === 180 ? "right" : s.ang === 0 ? "left" : "center" });
		return { node, word, ax, ay, x, y };
	});
}

const lit = (k) => LOOP + k * BEAT;

/** Comet angle in degrees: lands on each station on the beat, then whirls. */
function cometAngle(t) {
	if (t <= lit(0)) return -90;
	for (let k = 1; k < 4; k++) {
		if (t <= lit(k)) return -90 + 90 * (k - 1) + 90 * ease.inOutCubic(prog(t, lit(k) - BEAT, lit(k)));
	}
	const w = prog(t, lit(3), END - 0.12);
	return 180 + 720 * w * w;
}

function drawLoop(t, ctx) {
	const on = ease.outExpo(prog(t, LOOP - 0.2, LOOP + 0.3));
	const shrink = ease.inExpo(prog(t, END - 0.2, END));
	const scale = lerp(0.7, 1, on) * (1 - shrink);
	loop.group.style.transformOrigin = "960px 540px";
	loop.group.style.transform = `scale(${scale})`;
	loop.group.style.opacity = String(on);
	loop.ticks.style.transformOrigin = "960px 540px";
	loop.ticks.style.transform = `rotate(${(t - LOOP) * 24}deg)`;
	const heat = pulse(t, lit(0), 5) + pulse(t, lit(1), 5) + pulse(t, lit(2), 5) + pulse(t, lit(3), 5);
	loop.mark.style.filter = `drop-shadow(0 0 ${16 + 30 * heat}px rgba(240,85,35,0.8))`;
	pose(loop.mark, `scale(${lerp(0.4, 1, spring(t - LOOP + 0.1, 1.2, 5)) * (1 + shrink * 0.6)})`, on * (1 - shrink));
	loop.stops.forEach((c, k) => c.classList.toggle("lit", t >= lit(k)));
	loop.labels.forEach((l, k) => {
		revealChars(l.word, t, lit(k) - 0.04, { stagger: 0.03, dur: 0.35 });
		l.node.style.color = t >= lit(k) ? "var(--phos)" : "var(--ink)";
		const pull = shrink;
		const x = lerp(0, 960 - l.x, pull);
		const y = lerp(0, 540 - l.y, pull);
		pose(l.node, `translate(calc(${l.ax}% + ${x}px), calc(${l.ay}% + ${y}px)) scale(${1 - pull})`, prog(t, lit(k) - 0.04, lit(k) + 0.1) * (1 - pull));
	});

	if (t < lit(0) - 0.02) return;
	const ang = cometAngle(t);
	const speed = Math.abs(cometAngle(t + 0.01) - ang) / 0.01; // degrees per second
	const trail = clamp(30 + speed * 0.12, 30, 330);
	const rr = R * scale;
	ctx.globalCompositeOperation = "lighter";
	for (let i = 0; i < 48; i++) {
		const f = i / 48;
		const a = ((ang - trail * f) * Math.PI) / 180;
		glow(ctx, 960 + Math.cos(a) * rr, 540 + Math.sin(a) * rr, 46 * (1 - f * 0.7), (1 - f) ** 1.5 * 0.55, "phos");
	}
	const a = (ang * Math.PI) / 180;
	glow(ctx, 960 + Math.cos(a) * rr, 540 + Math.sin(a) * rr, 90, 1, "phos");
	glow(ctx, 960 + Math.cos(a) * rr, 540 + Math.sin(a) * rr, 34, 1, "ink");
	ctx.globalCompositeOperation = "source-over";
	for (let k = 0; k < 4; k++) {
		const sa = (STATIONS[k].ang * Math.PI) / 180;
		ring(ctx, t, { t0: lit(k), x: 960 + Math.cos(sa) * rr, y: 540 + Math.sin(sa) * rr, r0: 8, r1: 110, dur: 0.5, width: 4, color: "16,185,129" });
	}
	streaks(ctx, t, { t0: END - 0.35, t1: END, x: 960, y: 540, count: 80, inward: true, alpha: 0.5, color: "110,231,183", seed: 9 });
}

function buildEnd(root) {
	end.card = el("div", "endcard", root);
	end.hero = phoenix(end.card, "end-phoenix");
	end.lengths = end.hero.paths.map((p) => prepareStroke(p, "#f89621", 0.45));
	end.mark = wordmark(end.card, "end-wordmark");
	end.sheen = el("div", "end-sheen", end.card);
	const tag = el("div", "end-tag", end.card);
	end.tagText = el("span", "", tag);
	end.cursor = el("span", "cursor", tag);
	end.tag = el("div", "end-os", end.card, "<i></i>your personal agent OS");
	end.rule = el("div", "end-rule", end.card);
	end.foot = el("div", "end-foot", end.card, "<b>sero-ai.dev</b><span>open source · local-first · macOS · Linux · Windows</span>");
}

function drawEnd(t, ctx) {
	const d = t - END;
	pose(end.card, `scale(${1 + tw(t, END, DURATION, 0, 0.035, ease.linear)})`, 1);
	const s = 0.35 + 0.65 * spring(d, 1.2, 5);
	end.hero.svg.style.transform = `scale(${s})`;
	end.hero.svg.style.transformOrigin = "50% 60%";
	end.hero.paths.forEach((p, i) => {
		const draw = ease.outCubic(prog(t, END + i * 0.04, END + 0.4 + i * 0.04));
		p.style.strokeDashoffset = String(end.lengths[i] * (1 - draw));
		p.style.fillOpacity = String(ease.outCubic(prog(t, END + 0.1 + i * 0.04, END + 0.45 + i * 0.04)));
		p.style.strokeOpacity = String(1 - prog(t, END + 0.45, END + 0.8));
	});
	let beats = 0;
	for (let k = 1; k < 8; k++) beats += pulse(t, END + k * BEAT, 6) * 0.25;
	const heat = 1.2 * pulse(t, END, 2.5) + 0.55 + beats;
	end.hero.svg.style.filter = `drop-shadow(0 0 ${14 + 30 * heat}px rgba(240,85,35,${Math.min(0.9, 0.3 + 0.35 * heat)}))`;
	end.mark.paths.forEach((p, i) => {
		const k = ease.outExpo(prog(t, END + 0.3 + i * 0.05, END + 0.9 + i * 0.05));
		p.style.transform = `translateY(${(1 - k) * 115}%)`;
	});
	const sweep = prog(t, END + 1.9, END + 2.6);
	end.sheen.style.backgroundPosition = `${lerp(100, -10, ease.inOutCubic(sweep))}% 0`;
	end.sheen.style.opacity = String(sweep > 0 && sweep < 1 ? 1 : 0);
	const text = "Grow your own Agent.";
	const n = Math.floor(text.length * prog(t, END + 0.75, END + 1.35));
	end.tagText.textContent = text.slice(0, n);
	const blink = Math.floor(t / (BEAT / 2)) % 2 === 0;
	pose(end.cursor, "none", t > END + 0.7 && (t < END + 1.4 || blink) ? 1 : 0);
	const f = ease.outExpo(prog(t, END + 1.4, END + 2));
	pose(end.tag, `translateY(${(1 - f) * 14}px)`, f);
	pose(end.rule, `scaleX(${ease.outExpo(prog(t, END + 1.3, END + 2.1))})`, 1);
	pose(end.foot, `translateY(${(1 - f) * 20}px)`, f);

	flare(ctx, t, { t0: END, x: 960, y: 380, len: 1300, dur: 0.7, color: "180,255,220" });
	ring(ctx, t, { t0: END, x: 960, y: 380, r1: 1000, dur: 1, width: 12, color: "16,185,129" });
	ring(ctx, t, { t0: END + 0.05, x: 960, y: 380, r1: 700, dur: 0.9, width: 6 });
	burst(ctx, t, { t0: END, x: 960, y: 380, count: 260, speed: 1700, life: 2, size: 26, seed: 33, kinds: ["hot", "phos", "flame", "ember"] });
	embers(ctx, t, { t0: END + 0.3, x: 960, y: 560, w: 300, h: 40, rate: 26, rise: 140, size: 22, seed: 14 });
	embers(ctx, t, { t0: END + 0.3, x: 960, y: 1120, w: 1900, h: 40, rate: 18, rise: 170, size: 16, life: 4, seed: 15, alpha: 0.6 });
}

export default {
	scenes: [
		{ from: WALL - 0.1, to: LOOP + 0.2, build: buildWall, draw: (t) => drawWall(t) },
		{ from: LOOP - 0.25, to: END + 0.02, build: buildLoop, draw: (t, env) => drawLoop(t, env.front) },
		{ from: END - 0.01, to: DURATION + 1, build: buildEnd, draw: (t, env) => drawEnd(t, env.front) },
	],
};
