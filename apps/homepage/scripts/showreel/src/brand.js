// Brand marks, loaded from the repository's own SVG sources so the reel
// always matches the current phoenix emblem and word-mark.

const ASSETS = "../../../../assets";
let phoenixSource = "";
let wordmarkSource = "";
let instance = 0;

export async function loadBrand() {
	const [phoenix, wordmark] = await Promise.all([
		fetch(`${ASSETS}/phoenix2.svg`).then((r) => r.text()),
		fetch(`${ASSETS}/logo-dark.svg`).then((r) => r.text()),
	]);
	// The darkest phoenix red disappears on a dark stage; the homepage and
	// OG card lift it to #7A2020 for the same reason.
	phoenixSource = phoenix.replaceAll("#490811", "#7A2020");
	wordmarkSource = wordmark;
}

function inject(source, parent, className) {
	const id = `m${instance++}_`;
	const holder = document.createElement("div");
	holder.innerHTML = source.replaceAll("SVGID_", `${id}SVGID_`).replace(/<style[\s\S]*?<\/style>/, "");
	const svg = holder.querySelector("svg");
	svg.setAttribute("class", className);
	parent.appendChild(svg);
	return svg;
}

const PHOENIX_FILLS = ["#7A2020", "url(#{id}SVGID_1_)", "url(#{id}SVGID_2_)", "#7A2020"];

/** Phoenix emblem. Returns the svg and its four paths in source order. */
export function phoenix(parent, className = "phoenix") {
	const id = `m${instance}_`;
	const svg = inject(phoenixSource, parent, className);
	const paths = [...svg.querySelectorAll("path")];
	paths.forEach((p, i) => {
		p.removeAttribute("class");
		p.setAttribute("fill", PHOENIX_FILLS[i].replace("{id}", id));
	});
	return { svg, paths };
}

/** "Sero" word-mark in the light ink colour. Returns the svg and glyph paths. */
export function wordmark(parent, className = "wordmark") {
	const svg = inject(wordmarkSource, parent, className);
	const paths = [...svg.querySelectorAll("path")];
	for (const p of paths) {
		p.removeAttribute("class");
		p.setAttribute("fill", "#F4EDE4");
		p.style.transformBox = "fill-box";
		p.style.transformOrigin = "50% 100%";
	}
	return { svg, paths };
}

/** Prepare a path for a stroke draw-on. Returns its length. */
export function prepareStroke(path, color, width) {
	const len = path.getTotalLength();
	path.setAttribute("stroke", color);
	path.setAttribute("stroke-width", String(width));
	path.setAttribute("stroke-linejoin", "round");
	path.style.strokeDasharray = `${len}`;
	return len;
}
