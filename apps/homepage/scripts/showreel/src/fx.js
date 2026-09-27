// Canvas particle effects. Each particle is an analytic function of time
// (spawn time, velocity, drag), so no simulation state carries between frames.

import { ease, hash, noise, prog } from "./lib.js";

const sprites = {};

function sprite(inner, mid, outer) {
	const c = document.createElement("canvas");
	c.width = c.height = 128;
	const g = c.getContext("2d");
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, inner);
	grad.addColorStop(0.18, mid);
	grad.addColorStop(0.45, outer);
	grad.addColorStop(1, "rgba(0,0,0,0)");
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return c;
}

export function initFx() {
	sprites.hot = sprite("rgba(255,250,235,1)", "rgba(255,196,110,0.9)", "rgba(240,85,35,0.25)");
	sprites.flame = sprite("rgba(255,214,150,1)", "rgba(248,150,33,0.8)", "rgba(240,85,35,0.18)");
	sprites.ember = sprite("rgba(255,170,90,1)", "rgba(240,85,35,0.75)", "rgba(122,32,32,0.2)");
	sprites.phos = sprite("rgba(220,255,240,1)", "rgba(52,211,153,0.85)", "rgba(5,150,105,0.2)");
	sprites.ink = sprite("rgba(255,255,255,1)", "rgba(230,227,216,0.6)", "rgba(230,227,216,0.1)");
}

export function glow(ctx, x, y, size, alpha = 1, kind = "flame") {
	if (alpha <= 0.002 || size <= 0.2) return;
	ctx.globalAlpha = Math.min(1, alpha);
	ctx.drawImage(sprites[kind], x - size / 2, y - size / 2, size, size);
}

/** Rising embers emitted from a region between t0 and t1. */
export function embers(ctx, t, o) {
	const { t0, t1 = 1e9, x, y, w = 200, h = 20, rate = 40, seed = 1, rise = 120, size = 22, life = 2.4, kind = "ember", alpha = 1, sway = 40 } = o;
	const first = Math.max(0, Math.floor((t - life * 1.6 - t0) * rate));
	const last = Math.floor((Math.min(t, t1) - t0) * rate);
	ctx.globalCompositeOperation = "lighter";
	for (let k = first; k <= last; k++) {
		const r = (n) => hash(seed * 100003 + k * 17 + n);
		const ts = t0 + k / rate + r(1) / rate;
		const L = life * (0.55 + r(2) * 1.05);
		const a = t - ts;
		if (a < 0 || a > L) continue;
		const p = a / L;
		const px = x + (r(3) - 0.5) * w + noise(a * 0.9 + k, seed) * sway * p * 2;
		const py = y + (r(4) - 0.5) * h - rise * (0.5 + r(5)) * a - 18 * a * a;
		const flicker = 0.75 + 0.25 * Math.sin(a * 23 + k);
		const fade = Math.min(1, p * 8) * (1 - p) ** 1.4;
		glow(ctx, px, py, size * (0.45 + r(6) * 0.9) * (1 - p * 0.5), fade * flicker * alpha, kind);
	}
	ctx.globalCompositeOperation = "source-over";
	ctx.globalAlpha = 1;
}

/** Radial explosion with drag. Particles slow down, drift up and cool off. */
export function burst(ctx, t, o) {
	const { t0, x, y, count = 300, speed = 1400, drag = 3.2, life = 1.8, seed = 7, size = 26, lift = 60, kinds = ["hot", "flame", "ember"], alpha = 1 } = o;
	const a = t - t0;
	if (a < 0 || a > life * 1.6) return;
	ctx.globalCompositeOperation = "lighter";
	for (let i = 0; i < count; i++) {
		const r = (n) => hash(seed * 7919 + i * 31 + n);
		const L = life * (0.4 + r(1) * 1.1);
		if (a > L) continue;
		const ang = r(2) * Math.PI * 2;
		const sp = speed * (0.12 + r(3) ** 1.6 * 0.9);
		const d = (sp / drag) * (1 - Math.exp(-drag * a));
		const px = x + Math.cos(ang) * d;
		const py = y + Math.sin(ang) * d * 0.82 - lift * a * a;
		const p = a / L;
		const kind = kinds[Math.min(kinds.length - 1, Math.floor(p * kinds.length + r(4) * 0.6))];
		glow(ctx, px, py, size * (0.35 + r(5)) * (1 - p * 0.6), (1 - p) ** 1.2 * alpha, kind);
	}
	ctx.globalCompositeOperation = "source-over";
	ctx.globalAlpha = 1;
}

/** Expanding shockwave ring. */
export function ring(ctx, t, { t0, x, y, r0 = 10, r1 = 900, dur = 0.9, width = 10, color = "240,85,35", alpha = 1 }) {
	const p = prog(t, t0, t0 + dur);
	if (p <= 0 || p >= 1) return;
	const e = ease.outExpo(p);
	ctx.globalCompositeOperation = "lighter";
	ctx.globalAlpha = 1;
	ctx.strokeStyle = `rgba(${color},${(1 - p) ** 1.5 * alpha})`;
	ctx.lineWidth = Math.max(0.5, width * (1 - e));
	ctx.beginPath();
	ctx.ellipse(x, y, r0 + (r1 - r0) * e, (r0 + (r1 - r0) * e) * 0.92, 0, 0, Math.PI * 2);
	ctx.stroke();
	ctx.globalCompositeOperation = "source-over";
}

/** Speed lines rushing toward (implode) or away from (explode) a point. */
export function streaks(ctx, t, { t0, t1, x, y, count = 90, seed = 3, inward = true, color = "230,227,216", alpha = 0.7, maxR = 1300 }) {
	const p = prog(t, t0, t1);
	if (p <= 0 || p >= 1) return;
	ctx.globalCompositeOperation = "lighter";
	ctx.lineCap = "round";
	for (let i = 0; i < count; i++) {
		const r = (n) => hash(seed * 4099 + i * 13 + n);
		const ang = r(1) * Math.PI * 2;
		const local = (p * (1.4 + r(2)) + r(3)) % 1;
		const head = inward ? maxR * (1 - ease.inCubic(local)) : maxR * ease.outCubic(local);
		const len = 60 + r(4) * 260 * (inward ? 1 - local : local);
		const tail = inward ? head + len : Math.max(0, head - len);
		ctx.strokeStyle = `rgba(${color},${alpha * Math.sin(local * Math.PI) * (0.3 + r(5) * 0.7)})`;
		ctx.lineWidth = 1 + r(6) * 2.5;
		ctx.beginPath();
		ctx.moveTo(x + Math.cos(ang) * head, y + Math.sin(ang) * head);
		ctx.lineTo(x + Math.cos(ang) * tail, y + Math.sin(ang) * tail);
		ctx.stroke();
	}
	ctx.globalCompositeOperation = "source-over";
	ctx.globalAlpha = 1;
}

/** Hand-held camera shake from decaying impacts. */
export function shake(t, impacts) {
	let x = 0;
	let y = 0;
	let r = 0;
	for (const [t0, amp, decay = 7] of impacts) {
		if (t < t0) continue;
		const k = amp * Math.exp(-(t - t0) * decay);
		x += noise((t - t0) * 38, 11) * k;
		y += noise((t - t0) * 38, 23) * k;
		r += noise((t - t0) * 30, 37) * k * 0.04;
	}
	return { x, y, r };
}

/** Anamorphic lens flare: a thin horizontal light streak. */
export function flare(ctx, t, { t0, x, y, len = 1600, dur = 0.7, color = "255,190,120", alpha = 1 }) {
	const p = prog(t, t0, t0 + dur);
	if (p <= 0 || p >= 1) return;
	const k = (1 - p) ** 2 * alpha;
	const half = len * (0.6 + 0.4 * ease.outExpo(p));
	ctx.globalCompositeOperation = "lighter";
	for (const [h, a] of [[70, 0.12], [14, 0.4], [3, 1]]) {
		const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
		g.addColorStop(0, `rgba(${color},0)`);
		g.addColorStop(0.5, `rgba(${color},${a * k})`);
		g.addColorStop(1, `rgba(${color},0)`);
		ctx.fillStyle = g;
		ctx.globalAlpha = 1;
		ctx.beginPath();
		ctx.ellipse(x, y, half, h / 2, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalCompositeOperation = "source-over";
}
