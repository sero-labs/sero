// Real Sero screenshots from the docs, cropped to the app window.

import { el } from "./lib.js";

const DIR = "../../../docs-site/docs/assets/images";
// Docs captures with a macOS window frame on a white backdrop.
const FRAMED = { x: 112, y: 76, w: 3023, h: 1897, iw: 3248, ih: 2122 };
const full = (iw, ih) => ({ x: 0, y: 0, w: iw, h: ih, iw, ih, chrome: true });

export const SHOTS = {
	memory: { file: "memory.jpg", ...FRAMED },
	room: { file: "room.jpg", ...FRAMED },
	graphify: { file: "graphify.jpg", ...FRAMED },
	board: { file: "agent-board.jpg", ...FRAMED },
	design: { file: "design-library-2.jpg", ...FRAMED },
	git: { file: "git-app.jpg", ...FRAMED },
	research: { file: "research.jpg", ...FRAMED },
	cron: { file: "cron.jpg", ...FRAMED },
	agents: { file: "admin-agents.jpg", ...FRAMED },
	plugins: { file: "local-plugin-preview.jpg", ...FRAMED },
	loom: { file: "loom.jpg", ...FRAMED },
	gallery: { file: "design-library-4.jpg", ...FRAMED },
	browser: { file: "explorer-browser.jpg", ...full(3024, 1836) },
	chat: { file: "sero-chat.jpg", ...full(2508, 1778) },
	explorer: { file: "explorer.jpg", ...full(3024, 1800) },
	plan: { file: "orchestrator-plan-map-branches.jpg", ...full(3020, 1766) },
};

const MAX_W = 2048;
const urls = new Map();

/**
 * Fetch every screenshot once and downscale it. Full-size captures exceed
 * Chromium's image decode budget when a dozen are on stage at once.
 */
export async function loadShots() {
	await Promise.all(
		Object.entries(SHOTS).map(async ([key, s]) => {
			const blob = await fetch(`${DIR}/${s.file}`).then((r) => r.blob());
			const k = Math.min(1, MAX_W / s.iw);
			const bmp = await createImageBitmap(blob, { resizeWidth: Math.round(s.iw * k), resizeHeight: Math.round(s.ih * k), resizeQuality: "high" });
			const canvas = new OffscreenCanvas(bmp.width, bmp.height);
			canvas.getContext("2d").drawImage(bmp, 0, 0);
			urls.set(key, URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.93 })));
		}),
	);
}

/**
 * A screenshot in a window frame. Screens without their own frame get a
 * slim title bar so every screen reads as the same desktop app.
 */
export function screen(parent, key, width, className = "") {
	const s = SHOTS[key];
	const scale = width / s.w;
	const viewH = s.h * scale;
	const barH = s.chrome ? Math.round(width * 0.028) : 0;
	const root = el("div", `screen ${className}`, parent);
	root.style.width = `${width}px`;
	root.style.height = `${viewH + barH}px`;
	root.style.borderRadius = `${Math.round(width * 0.012)}px`;
	if (s.chrome) {
		const bar = el("div", "screen-bar", root);
		bar.style.height = `${barH}px`;
		bar.style.gap = `${barH * 0.22}px`;
		bar.style.paddingLeft = `${barH * 0.45}px`;
		for (const c of ["#ec6a5e", "#f4bf4f", "#61c554"]) {
			const dot = el("i", "", bar);
			dot.style.background = c;
			dot.style.width = dot.style.height = `${barH * 0.3}px`;
		}
	}
	const view = el("div", "screen-view", root);
	view.style.height = `${viewH}px`;
	const img = el("img", "", view);
	img.src = urls.get(key);
	img.style.width = `${s.iw * scale}px`;
	img.style.left = `${-s.x * scale}px`;
	img.style.top = `${-s.y * scale}px`;
	const sheen = el("div", "screen-sheen", root);
	return { root, view, img, sheen, width, height: viewH + barH, barH, viewH };
}

/** A crop of a screenshot region given in 0..1 fractions of the window. */
export function crop(parent, key, width, [fx, fy, fw, fh]) {
	const s = SHOTS[key];
	const scale = width / (s.w * fw);
	const root = el("div", "screen-crop", parent);
	root.style.width = `${width}px`;
	root.style.height = `${s.h * fh * scale}px`;
	const img = el("img", "", root);
	img.src = urls.get(key);
	img.style.width = `${s.iw * scale}px`;
	img.style.left = `${-(s.x + s.w * fx) * scale}px`;
	img.style.top = `${-(s.y + s.h * fy) * scale}px`;
	return root;
}

/** Diagonal light sweep across a screen. `p` runs 0..1. */
export function sweep(sheen, p) {
	sheen.style.transform = `translateX(${-120 + p * 240}%) skewX(-18deg)`;
	sheen.style.opacity = p <= 0 || p >= 1 ? "0" : "1";
}

export async function decodeAll(root) {
	await Promise.all([...root.querySelectorAll("img")].map((img) => img.decode()));
}
