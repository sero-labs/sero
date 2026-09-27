// Reel slate overlay: safe-frame corners, timecode, section names.

import { phoenix } from "./brand.js";
import { at, el, hash, pose, prog, timecode } from "./lib.js";

const SECTIONS = [
	[0, "01 — spark"],
	[at(2), "02 — burnout"],
	[at(4), "03 — ignition"],
	[at(5), "04 — grow"],
	[at(6), "05 — capabilities"],
	[at(12), "06 — the loop"],
	[at(14), "07 — sero"],
];
const GLYPHS = "▚▞▙▟▓▒░/<>*#01";

/** Characters resolve left to right out of random glyphs. */
export function scramble(text, p, seed = 0) {
	const n = text.length;
	return [...text]
		.map((c, i) => {
			if (c === " ") return " ";
			if (p * (n + 6) > i + 6) return c;
			if (p * (n + 6) < i) return "";
			return GLYPHS[Math.floor(hash(seed + i * 7 + Math.floor(p * 40)) * GLYPHS.length)];
		})
		.join("");
}

export function buildHud(stage) {
	const root = el("div", "layer hud", stage);
	const inset = 34;
	for (const [v, h] of [["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]]) {
		const c = el("div", "corner", root);
		c.style[v] = c.style[h] = `${inset}px`;
		c.style[`border-${v}-width`] = c.style[`border-${h}-width`] = "2px";
	}
	const tl = el("div", "slot", root);
	Object.assign(tl.style, { left: `${inset + 38}px`, top: `${inset + 4}px` });
	const mark = phoenix(tl, "mini").svg;
	const brand = el("span", "", tl, "sero");
	el("span", "", tl, "/").style.opacity = "0.4";
	el("span", "", tl, "motion reel 2026");
	const tr = el("div", "slot", root);
	Object.assign(tr.style, { right: `${inset + 38}px`, top: `${inset + 4}px` });
	const rec = el("i", "rec", tr);
	el("span", "", tr, "rec");
	const tc = el("span", "", tr);
	tc.style.fontVariantNumeric = "tabular-nums";
	const bl = el("div", "slot", root);
	Object.assign(bl.style, { left: `${inset + 38}px`, bottom: `${inset + 2}px` });
	const section = el("span", "", bl);
	const br = el("div", "slot", root);
	Object.assign(br.style, { right: `${inset + 38}px`, bottom: `${inset + 2}px` });
	el("span", "", br, "1920×1080 · 60p · 128 bpm");

	return {
		draw(t) {
			const vis = prog(t, 0.2, 0.9) * (1 - prog(t, at(14) - 0.2, at(14) + 0.1));
			pose(root, "none", vis);
			mark.style.opacity = String(prog(t, at(4) + 0.4, at(4) + 0.8));
			brand.style.color = t > at(4) ? "var(--ink)" : "";
			rec.style.opacity = Math.floor(t * 2) % 2 ? "0.25" : "1";
			tc.textContent = timecode(t);
			let i = 0;
			while (i + 1 < SECTIONS.length && t >= SECTIONS[i + 1][0]) i++;
			const [t0, text] = SECTIONS[i];
			section.textContent = scramble(text, prog(t, t0, t0 + 0.4), i * 101);
		},
	};
}
