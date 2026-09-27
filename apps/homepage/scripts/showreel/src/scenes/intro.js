// 0:00–0:07.5 — "every agent starts as a spark", then the burnout loop of
// fresh sessions that forget everything, imploding into the ember.

import { burst, embers, glow, streaks } from "../fx.js";
import { at, BEAT, ease, el, hash, lerp, noise, pose, prog, revealChars, splitChars, tw } from "../lib.js";

const WORDS = [
	{ text: "every", t: at(0, 1), size: 118, weight: 300 },
	{ text: "agent", t: at(0, 2), size: 230, weight: 800 },
	{ text: "starts", t: at(0, 3), size: 150, weight: 500 },
	{ text: "as a", t: at(1, 0), size: 118, weight: 300 },
	{ text: "spark", t: at(1, 1), size: 250, weight: 800 },
];
const SHOUTS = [
	[at(2, 0), "new tab."],
	[at(2, 1), "new session."],
	[at(2, 2), "explain it"],
	[at(2, 3), "all again."],
	[at(3, 0), "copy."],
	[at(3, 0.5), "paste."],
];
const REPEATS = [at(3, 1), at(3, 1.5), at(3, 2), at(3, 2.25), at(3, 2.5), at(3, 2.75)];
const COLLAPSE = at(3, 3);
const DROP = at(4);
const TITLES = ["new chat", "untitled", "new session", "new chat", "chat (2)", "new tab", "untitled 3"];
const CX = 960;
const CY = 540;

let words = [];
let dot = { x: CX, y: CY };
let wins = [];
let shouts = [];
let repeats = [];

function buildSpark(root) {
	words = WORDS.map((w, i) => {
		const node = el("div", "kword", root);
		Object.assign(node.style, { fontSize: `${w.size}px`, fontWeight: String(w.weight), top: "500px" });
		const mask = el("span", "mask", node);
		const chars = splitChars(mask, w.text);
		let period = null;
		if (i === WORDS.length - 1) {
			period = el("span", "ch", mask, ".");
			period.style.color = "transparent";
		}
		node.style.transform = "translate(-50%, -50%)";
		return { ...w, node, chars, period };
	});
	const last = words[words.length - 1];
	const r = last.period.getBoundingClientRect();
	dot = { x: r.left + r.width / 2 - last.size * 0.1, y: r.top + last.size * 0.77 };
}

function buildBurnout(root) {
	const cols = 8;
	const rows = 5;
	const ww = 196;
	const wh = 122;
	const gap = 22;
	const x0 = (1920 - (cols * ww + (cols - 1) * gap)) / 2;
	const y0 = (1080 - (rows * wh + (rows - 1) * gap)) / 2;
	const cells = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = x0 + c * (ww + gap) + ww / 2;
			const y = y0 + r * (wh + gap) + wh / 2;
			const d = Math.hypot(x - CX, (y - CY) * 1.4);
			if (d < 150) continue;
			cells.push({ x, y, d: d + hash(r * 17 + c) * 120 });
		}
	}
	cells.sort((a, b) => a.d - b.d);
	const step = BEAT / 4;
	wins = cells.map((cell, i) => {
		const node = el("div", "chatwin", root);
		node.innerHTML = `<div class="cw-head"><i></i><i></i><i></i><span>${TITLES[i % TITLES.length]}</span></div><p>How can I help you today?</p><div class="cw-input">Ask anything…</div>`;
		Object.assign(node.style, { width: `${ww}px`, height: `${wh}px`, left: `${cell.x - ww / 2}px`, top: `${cell.y - wh / 2}px` });
		const u = i / (cells.length - 1);
		const t0 = at(2) + Math.round((3.1 * Math.sqrt(u)) / step) * step;
		return { node, ...cell, t0, spin: (hash(i * 3 + 1) - 0.5) * 220, lag: hash(i * 5 + 2) * 0.12 };
	});
	shouts = SHOUTS.map(([t0, text], i) => {
		const node = el("div", "shout", root);
		const box = el("div", "shout-box", node);
		const mask = el("span", "mask", box);
		return { t0, t1: i + 1 < SHOUTS.length ? SHOUTS[i + 1][0] : REPEATS[0], node, box, chars: splitChars(mask, text), tilt: (hash(i + 40) - 0.5) * 4, dx: (hash(i + 50) - 0.5) * 120 };
	});
	repeats = REPEATS.map((t0, i) => {
		const node = el("div", "shout repeat", root);
		const box = el("div", "shout-box", node);
		box.textContent = "repeat.";
		return { t0, node, box, y: (i - 2.5) * 124, dx: (hash(i + 70) - 0.5) * 160 };
	});
}

/** Scale of the "spark" word; the ember follows it so it stays the period. */
function sparkScale(t) {
	const w = words[4];
	return 0.8 + 0.2 * ease.outExpo(prog(t, w.t, w.t + 0.45)) + tw(t, w.t, at(1, 3.5), 0, 0.05, ease.linear);
}

/** The ember: idle drift, flies into the period of "spark", then waits at centre. */
function emberAt(t) {
	const idle = { x: CX + noise(t * 0.6, 1) * 26, y: 720 + noise(t * 0.5, 2) * 14 - t * 8 };
	const land = words[4].t;
	if (t < land) return idle;
	if (t < land + 0.34) {
		const e = ease.outCubic(prog(t, land, land + 0.34));
		const from = emberAt(land - 1e-4);
		const k = sparkScale(t);
		const to = { x: CX + (dot.x - CX) * k, y: 500 + (dot.y - 500) * k };
		return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) - Math.sin(Math.PI * e) * 140 };
	}
	const leave = at(1, 3.5);
	const k = sparkScale(Math.min(t, leave));
	const sx = CX + (dot.x - CX) * k;
	const sy = 500 + (dot.y - 500) * k;
	const e = ease.inOutCubic(prog(t, leave, at(2) + 0.1));
	return { x: lerp(sx, CX, e) + noise(t * 0.8, 3) * 6 * e, y: lerp(sy, CY, e) + noise(t * 0.7, 4) * 6 * e };
}

function drawEmber(ctx, t) {
	const p = emberAt(t);
	const land = words[4].t + 0.34;
	const pop = t > land ? Math.exp(-(t - land) * 6) : 0;
	const grow = tw(t, at(2), COLLAPSE, 0, 12, ease.inQuad) + tw(t, COLLAPSE, DROP, 0, 110, ease.inExpo);
	const flick = 0.85 + 0.15 * noise(t * 14, 9);
	const size = (34 + grow) * (1 + pop * 0.9) * flick;
	const beat = Math.exp(-((t % BEAT) / BEAT) * 5) * (t > land ? 0.25 : 0);
	ctx.globalCompositeOperation = "lighter";
	glow(ctx, p.x, p.y, size * 7, 0.22 + beat, "ember");
	glow(ctx, p.x, p.y, size * 2.6, 0.75, "flame");
	glow(ctx, p.x, p.y, size, 1, "hot");
	ctx.globalCompositeOperation = "source-over";
	embers(ctx, t, { t0: 0.2, t1: DROP, x: p.x, y: p.y, w: 20, h: 10, rate: 9, rise: 60, size: 12, life: 1.6, seed: 5, sway: 25 });
	const at0 = emberAt(land);
	burst(ctx, t, { t0: land - 0.02, x: at0.x, y: at0.y, count: 40, speed: 700, life: 0.8, size: 14, seed: 12 });
}

function drawSpark(t) {
	words.forEach((w, i) => {
		const next = i + 1 < words.length ? words[i + 1].t : at(1, 3.5);
		const inE = ease.outExpo(prog(t, w.t, w.t + 0.45));
		const outP = prog(t, next - 0.02, next + 0.16);
		const last = i === words.length - 1;
		if (t < w.t || (!last && outP >= 1)) {
			pose(w.node, "translate(-50%,-50%)", 0);
			return;
		}
		revealChars(w.chars, t, w.t, { stagger: 0.02, dur: 0.38 });
		if (last) {
			pose(w.node, `translate(-50%,-50%) scale(${sparkScale(t)})`, 1);
			// The letters burn away upward, leaving only the ember.
			const burn = at(1, 3);
			w.chars.forEach((c, k) => {
				const p = ease.inCubic(prog(t, burn + k * 0.05, burn + k * 0.05 + 0.4));
				c.style.filter = p > 0 ? `blur(${p * 14}px)` : "none";
				if (p <= 0) return;
				c.style.transform = `translateY(${-p * 160}px) scale(${1 - p * 0.3})`;
				c.style.opacity = String(1 - p);
			});
			return;
		}
		const s = (0.72 + 0.28 * inE) * (1 + ease.inQuad(outP) * 2.2);
		w.node.style.filter = outP > 0 ? `blur(${outP * 18}px)` : "none";
		pose(w.node, `translate(-50%,-50%) scale(${s})`, 1 - outP);
	});
}

function drawBurnout(t, ctx) {
	const cp = (w) => ease.inCubic(prog(t, COLLAPSE + w.lag * 0.5, DROP - 0.04));
	for (const w of wins) {
		if (t < w.t0) {
			pose(w.node, "none", 0);
			continue;
		}
		const inP = ease.outExpo(prog(t, w.t0, w.t0 + 0.16));
		const age = tw(t, w.t0 + 0.4, w.t0 + 1.6, 1, 0.5, ease.outCubic);
		const c = cp(w);
		const x = (CX - w.x) * c;
		const y = (CY - w.y) * c;
		pose(w.node, `translate(${x}px,${y}px) rotate(${w.spin * c}deg) scale(${(0.86 + 0.14 * inP) * (1 - c * 0.97)})`, inP * age * (1 - c * 0.6));
	}
	const col = ease.inCubic(prog(t, COLLAPSE, DROP - 0.05));
	for (const s of shouts) {
		const on = t >= s.t0 && t < s.t1;
		if (!on) {
			pose(s.node, "none", 0);
			continue;
		}
		const k = prog(t, s.t0, s.t0 + 0.09);
		s.box.style.transform = `scaleX(${ease.outExpo(k)})`;
		revealChars(s.chars, t, s.t0 + 0.02, { stagger: 0.012, dur: 0.22 });
		const settle = 1.08 - 0.08 * ease.outExpo(prog(t, s.t0, s.t0 + 0.2));
		pose(s.node, `translate(calc(-50% + ${s.dx}px),-50%) rotate(${s.tilt}deg) scale(${settle})`, 1);
	}
	repeats.forEach((r, i) => {
		if (t < r.t0) {
			pose(r.node, "none", 0);
			return;
		}
		const newest = i === repeats.length - 1 || t < repeats[i + 1].t0;
		r.box.style.color = newest ? "var(--alert)" : "var(--mute)";
		const jolt = Math.exp(-(t - r.t0) * 30) * 30;
		const y = r.y * (1 - col);
		pose(r.node, `translate(calc(-50% + ${(r.dx + jolt) * (1 - col)}px), calc(-50% + ${y}px)) scale(${1 - col})`, (newest ? 1 : 0.4) * (1 - col * 0.5));
	});
	streaks(ctx, t, { t0: COLLAPSE - 0.2, t1: DROP, x: CX, y: CY, count: 110, inward: true, alpha: 0.55 });
}

export default {
	scenes: [
		{
			from: 0,
			to: at(2) + 0.2,
			build: buildSpark,
			draw: (t) => drawSpark(t),
		},
		{
			from: at(2) - 0.01,
			to: DROP,
			build: buildBurnout,
			draw: (t, env) => drawBurnout(t, env.front),
		},
		{
			from: 0,
			to: DROP + 0.02,
			build: () => {},
			draw: (t, env) => drawEmber(t >= at(2) && t < COLLAPSE ? env.back : env.front, t),
		},
	],
};
