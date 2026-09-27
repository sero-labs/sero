// 0:07.5–0:11.25 — the drop. The ember ignites into the phoenix and the
// word-mark, then "grow your own agent." while a capability tree grows.

import { phoenix, prepareStroke, wordmark } from "../brand.js";
import { burst, embers, flare, glow, ring } from "../fx.js";
import { at, BEAT, ease, el, hash, lerp, pose, prog, pulse, revealChars, rng, splitChars, spring, tw } from "../lib.js";

const DROP = at(4);
const TAG = at(5);
const OUT = at(6);
const PX = 960;
const PY = 430;
const LABELS = ["memory", "skills", "plugins", "browser", "agents", "tools", "prompts", "mcp"];

let lockup;
let halo;
let hero;
let lengths = [];
let mark;
let lines = [];
let cursor;
const segs = [];
const leaves = [];

function buildIgnite(root) {
	lockup = el("div", "lockup", root);
	halo = el("div", "halo", lockup);
	hero = phoenix(lockup, "hero-phoenix");
	lengths = hero.paths.map((p) => prepareStroke(p, "#f89621", 0.45));
	mark = wordmark(lockup, "hero-wordmark");
}

function buildTagline(root) {
	const spec = [
		{ text: "grow", t: TAG, top: 132, size: 300, weight: 800, cls: "" },
		{ text: "your own", t: at(5, 1), top: 452, size: 118, weight: 300, cls: "" },
		{ text: "agent.", t: at(5, 2), top: 572, size: 300, weight: 800, cls: "accent" },
	];
	lines = spec.map((s) => {
		const node = el("div", `tline ${s.cls}`, root);
		Object.assign(node.style, { top: `${s.top}px`, fontSize: `${s.size}px`, fontWeight: String(s.weight) });
		if (s.text === "your own") node.style.color = "var(--ink-2)";
		const mask = el("span", "mask", node);
		return { ...s, node, chars: splitChars(mask, s.text) };
	});
	cursor = el("span", "cursor", lines[2].node);

	const r = rng(42);
	const grow = (x, y, ang, len, depth, t0) => {
		const x1 = x + Math.cos(ang) * len;
		const y1 = y + Math.sin(ang) * len;
		const dur = 0.15 + depth * 0.012;
		segs.push({ x, y, x1, y1, depth, t0, t1: t0 + dur });
		if (depth >= 7) {
			leaves.push({ x: x1, y: y1, t: t0 + dur, i: leaves.length });
			return;
		}
		const n = depth > 1 && r() < 0.28 ? 3 : 2;
		for (let i = 0; i < n; i++) {
			const a = ang + (i - (n - 1) / 2) * (0.42 + r() * 0.3) + (r() - 0.5) * 0.25;
			grow(x1, y1, a, len * (0.7 + r() * 0.12), depth + 1, t0 + dur * 0.8 + r() * 0.03);
		}
	};
	grow(1480, 1030, -Math.PI / 2, 190, 0, TAG + 0.04);
}

function drawIgnite(t, ctx) {
	const d = t - DROP;
	const exit = ease.inExpo(prog(t, TAG - 0.2, TAG + 0.12));
	const s = (0.45 + 0.55 * spring(d, 1.3, 5)) * (1 + exit * 0.25);
	pose(lockup, `translateY(${-exit * 950}px) scale(${s})`, 1);
	hero.paths.forEach((p, i) => {
		const draw = ease.outCubic(prog(t, DROP + i * 0.05, DROP + 0.45 + i * 0.05));
		p.style.strokeDashoffset = String(lengths[i] * (1 - draw));
		p.style.fillOpacity = String(ease.outCubic(prog(t, DROP + 0.14 + i * 0.05, DROP + 0.55 + i * 0.05)));
		p.style.strokeOpacity = String(1 - prog(t, DROP + 0.5, DROP + 0.85));
	});
	let beats = 0;
	for (let k = 1; k < 4; k++) beats += pulse(t, DROP + k * BEAT, 7) * 0.5;
	const heat = 1.3 * pulse(t, DROP, 2.5) + 0.55 + beats;
	hero.svg.style.filter = `drop-shadow(0 0 ${14 + 34 * heat}px rgba(240,85,35,${Math.min(0.95, 0.3 + 0.35 * heat)}))`;
	pose(halo, `scale(${0.6 + 0.5 * heat})`, Math.min(1, 0.35 + 0.5 * heat));
	mark.paths.forEach((p, i) => {
		const k = ease.outExpo(prog(t, DROP + 0.42 + i * 0.055, DROP + 1 + i * 0.055));
		p.style.transform = `translateY(${(1 - k) * 115}%)`;
	});

	const lift = -exit * 950;
	flare(ctx, t, { t0: DROP, x: PX, y: PY, len: 1500, dur: 0.8 });
	ring(ctx, t, { t0: DROP, x: PX, y: PY, r1: 1100, dur: 1.0, width: 14 });
	ring(ctx, t, { t0: DROP + 0.06, x: PX, y: PY, r1: 760, dur: 0.9, width: 6, color: "16,185,129" });
	burst(ctx, t, { t0: DROP, x: PX, y: PY, count: 420, speed: 2300, drag: 3, life: 2.2, size: 30, seed: 21 });
	embers(ctx, t, { t0: DROP + 0.25, t1: TAG - 0.1, x: PX, y: PY + 170 + lift, w: 260, h: 60, rate: 34, rise: 150, size: 24, seed: 8 });
}

function drawTagline(t, ctx) {
	const out = (i) => ease.inExpo(prog(t, OUT - 0.26 + i * 0.04, OUT + 0.04 + i * 0.04));
	lines.forEach((l, i) => {
		revealChars(l.chars, t, l.t, { stagger: 0.03, dur: 0.5 });
		const o = out(i);
		pose(l.node, `translateY(${-o * 260}px)`, 1 - o);
	});
	// "grow" literally gains weight as it lands.
	const g = lines[0];
	g.node.style.fontWeight = String(Math.round(tw(t, TAG, TAG + 0.8, 100, 800, ease.outCubic)));
	g.node.style.letterSpacing = `${tw(t, TAG, TAG + 0.8, 0.02, -0.05, ease.outCubic)}em`;
	const blink = Math.floor((t - lines[2].t) / (BEAT / 2)) % 2 === 0;
	pose(cursor, "none", t > lines[2].t + 0.3 && blink ? 1 : 0);

	const fade = 1 - ease.inCubic(prog(t, OUT - 0.25, OUT + 0.1));
	const lift = -ease.inExpo(prog(t, OUT - 0.25, OUT + 0.1)) * 320;
	if (fade <= 0) return;
	ctx.globalCompositeOperation = "lighter";
	ctx.lineCap = "round";
	for (const sg of segs) {
		const p = ease.outCubic(prog(t, sg.t0, sg.t1));
		if (p <= 0) continue;
		const x1 = lerp(sg.x, sg.x1, p);
		const y1 = lerp(sg.y, sg.y1, p);
		const w = Math.max(1.2, 11 * 0.7 ** sg.depth);
		ctx.globalAlpha = fade;
		ctx.strokeStyle = `rgba(16,185,129,${0.14})`;
		ctx.lineWidth = w * 4;
		ctx.beginPath();
		ctx.moveTo(sg.x, sg.y + lift);
		ctx.lineTo(x1, y1 + lift);
		ctx.stroke();
		ctx.strokeStyle = `rgba(110,231,183,${0.95 - sg.depth * 0.06})`;
		ctx.lineWidth = w;
		ctx.stroke();
	}
	ctx.font = "500 19px JB";
	for (const lf of leaves) {
		const a = t - lf.t;
		if (a < 0) continue;
		const pop = Math.min(1, a / 0.12) * (1 + 0.6 * Math.exp(-a * 9));
		const twinkle = 0.75 + 0.25 * Math.sin(t * 9 + lf.i);
		const hot = hash(lf.i * 13) < 0.14;
		glow(ctx, lf.x, lf.y + lift, 26 * pop, fade * twinkle, hot ? "flame" : "phos");
		if (lf.i % 16 === 3) {
			ctx.globalAlpha = fade * Math.min(1, a / 0.25);
			ctx.fillStyle = "#e6e3d8";
			ctx.fillText(LABELS[Math.floor(lf.i / 16) % LABELS.length], lf.x + 16, lf.y + lift + 6);
		}
	}
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = "source-over";
}

export default {
	scenes: [
		{ from: DROP - 0.01, to: TAG + 0.2, build: buildIgnite, draw: (t, env) => drawIgnite(t, env.front) },
		{ from: TAG - 0.05, to: OUT + 0.2, build: buildTagline, draw: (t, env) => drawTagline(t, env.back) },
	],
};
