// Stage assembly and the single `seek(t)` entry point the renderer drives.
// Open index.html?play in a browser to preview in real time, or
// index.html?t=12.4 to hold one frame.

import { loadBrand } from "./brand.js";
import { initFx, shake } from "./fx.js";
import { buildHud } from "./hud.js";
import { at, BAR, DURATION, el, ease, H, pose, prog, pulse, tw, W } from "./lib.js";
import { decodeAll, loadShots } from "./screens.js";
import features from "./scenes/features.js";
import finale from "./scenes/finale.js";
import ignite from "./scenes/ignite.js";
import intro from "./scenes/intro.js";

// [time, amplitude px, decay]
const IMPACTS = [
	[at(4), 30, 5],
	[at(13, 3.6), 10, 6],
	[at(14), 20, 5.5],
	...[0, 1, 2, 3, 4, 5].map((i) => [at(6 + i), 7, 9]),
];
// [time, strength, decay]
const FLASHES = [
	[at(4), 0.85, 9],
	[at(14), 0.45, 10],
	[at(1, 1.6), 0.18, 10],
];

const MODULES = [intro, ignite, features, finale];

function canvas(parent) {
	const c = el("canvas", "fx", parent);
	c.width = W;
	c.height = H;
	return c.getContext("2d");
}

async function init() {
	await Promise.all([300, 400, 500, 700, 800].map((w) => document.fonts.load(`${w} 40px "JB"`)));
	await Promise.all([loadBrand(), loadShots()]);
	initFx();

	const stage = document.getElementById("stage");
	const bg = el("div", "layer", stage);
	const bgBase = el("div", "layer bg-base", bg);
	const bgDots = el("div", "layer bg-dots", bg);
	el("div", "layer bg-scan", bg);
	const world = el("div", "world", stage);
	const back = canvas(world);
	const scenes = MODULES.flatMap((m) => m.scenes).map((s) => {
		const root = el("div", "scene", world);
		s.build(root);
		return { ...s, root };
	});
	const front = canvas(world);
	const barTop = el("div", "bar-top", stage);
	const barBottom = el("div", "bar-bottom", stage);
	const flash = el("div", "layer flash", stage);
	const hud = buildHud(stage);
	const fade = el("div", "layer fade", stage);
	await decodeAll(stage);

	const env = { back, front };

	window.seek = (t) => {
		back.clearRect(0, 0, W, H);
		front.clearRect(0, 0, W, H);

		const lit = tw(t, at(4) - 0.05, at(4) + 0.6, 0.18, 1, ease.outCubic);
		bgBase.style.opacity = String(lit);
		bgDots.style.opacity = String(prog(t, at(4), at(4) + 1) * 0.9);
		bgDots.style.transform = `translate(${(t * 9) % 48}px, ${(-t * 5) % 48}px)`;

		const cam = shake(t, IMPACTS);
		const breathe = 1 + Math.sin(t * 0.7) * 0.004;
		world.style.transform = `translate(${cam.x}px, ${cam.y}px) rotate(${cam.r}deg) scale(${breathe})`;

		for (const s of scenes) {
			const on = t >= s.from && t < s.to;
			s.root.style.display = on ? "" : "none";
			if (on) s.draw(t, env);
		}

		// Letterbox bars open on the drop.
		const bars = 118 * (1 - ease.outExpo(prog(t, at(4) - 0.02, at(4) + 0.4)));
		barTop.style.height = barBottom.style.height = `${bars}px`;

		let f = 0;
		for (const [t0, k, d] of FLASHES) f += k * pulse(t, t0, d);
		pose(flash, "none", f);
		pose(fade, "none", Math.max(1 - prog(t, 0, 0.35), prog(t, DURATION - 0.45, DURATION)));
		hud.draw(t);
	};

	const params = new URLSearchParams(location.search);
	if (innerWidth !== W) stage.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H)})`;
	if (params.has("play")) play();
	else window.seek(Number(params.get("t") ?? BAR * 4.4));
}

function play() {
	const audio = new Audio("out/soundtrack.wav");
	audio.loop = true;
	const start = performance.now();
	audio.play().catch(() => {});
	const tick = () => {
		const t = ((performance.now() - start) / 1000) % DURATION;
		window.seek(t);
		requestAnimationFrame(tick);
	};
	tick();
}

window.showreelReady = init();
