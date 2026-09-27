// Timing grid, easing, deterministic randomness and DOM helpers.
// Every visual is a pure function of time, so any frame renders on its own.

export const W = 1920;
export const H = 1080;
export const BPM = 128;
export const BEAT = 60 / BPM; // 0.46875 s
export const BAR = BEAT * 4; // 1.875 s
export const DURATION = BAR * 16; // 30 s
/** Time of a zero-based bar plus beats. */
export const at = (barIndex, beats = 0) => barIndex * BAR + beats * BEAT;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Linear progress of t through [a, b], clamped to 0..1. */
export const prog = (t, a, b) => clamp((t - a) / (b - a));

export const ease = {
	linear: (x) => x,
	inQuad: (x) => x * x,
	outQuad: (x) => 1 - (1 - x) * (1 - x),
	inCubic: (x) => x * x * x,
	outCubic: (x) => 1 - (1 - x) ** 3,
	inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
	outQuart: (x) => 1 - (1 - x) ** 4,
	inQuart: (x) => x ** 4,
	outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
	inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
	inOutExpo: (x) =>
		x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
	outBack: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
	inBack: (x) => 2.70158 * x ** 3 - 1.70158 * x * x,
};

/** Eased value between a and b while t moves through [t0, t1]. */
export const tw = (t, t0, t1, a, b, fn = ease.outExpo) => lerp(a, b, fn(prog(t, t0, t1)));

/** Damped spring response to a step at time 0. `s` is seconds since the step. */
export function spring(s, freq = 2.2, damping = 7) {
	if (s <= 0) return 0;
	return 1 - Math.exp(-damping * s) * Math.cos(freq * 2 * Math.PI * s);
}

/** Exponential decay pulse that starts at time `t0`. */
export const pulse = (t, t0, decay = 8) => (t < t0 ? 0 : Math.exp(-(t - t0) * decay));

/** Deterministic hash of an integer to 0..1. */
export function hash(n) {
	let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
	x ^= x >>> 13;
	x = Math.imul(x, 0xc2b2ae35);
	x ^= x >>> 16;
	return (x >>> 0) / 4294967296;
}

/** Seeded random generator (mulberry32). */
export function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Smooth 1D value noise in -1..1. */
export function noise(x, seed = 0) {
	const i = Math.floor(x);
	const f = x - i;
	const u = f * f * (3 - 2 * f);
	return lerp(hash(i * 131 + seed * 7919), hash((i + 1) * 131 + seed * 7919), u) * 2 - 1;
}

export function el(tag, className, parent, html) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (html !== undefined) node.innerHTML = html;
	if (parent) parent.appendChild(node);
	return node;
}

export function svgEl(tag, attrs, parent) {
	const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
	for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, String(v));
	if (parent) parent.appendChild(node);
	return node;
}

/** Build a CSS transform string. Units: px and degrees. */
export function tf({ x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, rx = 0, ry = 0, rz = 0 } = {}) {
	return `translate3d(${x}px,${y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s * sx},${s * sy})`;
}

/** Set transform and opacity in one call, hiding fully transparent nodes. */
export function pose(node, transform, opacity = 1) {
	node.style.transform = transform;
	node.style.opacity = String(clamp(opacity));
	node.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
}

/** Split text into per-character spans. Spaces keep their width. */
export function splitChars(parent, text, className = "ch") {
	return [...text].map((c) => el("span", className, parent, c === " " ? "&nbsp;" : c));
}

/** Word reveal: characters rise out of a mask with a stagger. */
export function revealChars(chars, t, t0, { stagger = 0.022, dur = 0.42, dist = 1.4 } = {}) {
	chars.forEach((c, i) => {
		const p = ease.outExpo(prog(t, t0 + i * stagger, t0 + i * stagger + dur));
		c.style.transform = `translateY(${(1 - p) * dist * 100}%)`;
		c.style.opacity = String(p > 0 ? 1 : 0);
	});
}

/** SMPTE-style timecode at 60 fps. */
export function timecode(t) {
	const f = Math.floor(t * 60 + 1e-6);
	const pad = (n) => String(n).padStart(2, "0");
	return `00:00:${pad(Math.floor(f / 60))}:${pad(f % 60)}`;
}
