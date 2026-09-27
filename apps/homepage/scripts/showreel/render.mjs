#!/usr/bin/env node
// Renders the reel to MP4: parallel headless Chromium workers capture
// sub-frames, ffmpeg blends them into motion blur, then grades and muxes.
//
//   node render.mjs                      full render to out/sero-reel.mp4
//   node render.mjs --stills 2.5,8,14    PNG stills for review
//   node render.mjs --fps 30 --samples 1 fast draft
//   node render.mjs --regrade            re-grade and re-mux the last capture
//
// Needs Playwright (Chromium) and an ffmpeg with libx264. Set FFMPEG to use
// a specific ffmpeg binary.

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const out = path.join(here, "out");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const DURATION = 30;

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.join(" ")
		.split("--")
		.filter(Boolean)
		.map((a) => a.trim().split(/\s+/)),
);
const fps = Number(args.fps ?? 60);
const samples = Number(args.samples ?? 4);
const workers = Number(args.workers ?? Math.max(1, Math.min(6, os.cpus().length)));
const shutter = 0.5; // 180° shutter

function loadChromium() {
	const require = createRequire(import.meta.url);
	const globalRoot = execFileSync("npm", ["root", "-g"]).toString().trim();
	const id = require.resolve("playwright", { paths: [here, repo, globalRoot] });
	return require(id).chromium;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".wav": "audio/wav" };

function serve() {
	const server = http.createServer((req, res) => {
		const file = path.join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
		if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
		fs.createReadStream(file).pipe(res);
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function openPage(chromium, url) {
	const browser = await chromium.launch({ args: ["--disable-lcd-text", "--font-render-hinting=none", "--force-color-profile=srgb"] });
	const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
	page.on("pageerror", (e) => console.error("page error:", e.message));
	await page.goto(url);
	await page.evaluate(() => window.showreelReady);
	const cdp = await page.context().newCDPSession(page);
	const grab = async (t) => {
		await page.evaluate((x) => window.seek(x), t);
		const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
		return Buffer.from(data, "base64");
	};
	return { browser, grab };
}

function ffmpeg(argv) {
	const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["pipe", "inherit", "inherit"] });
	const done = new Promise((resolve, reject) => p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
	return { stdin: p.stdin, done };
}

async function write(stream, buf) {
	if (!stream.write(buf)) await new Promise((r) => stream.once("drain", r));
}

async function renderSegment(chromium, url, index, f0, f1) {
	const { browser, grab } = await openPage(chromium, url);
	const seg = path.join(out, `seg-${String(index).padStart(2, "0")}.mkv`);
	// tmix averages each window of `samples` sub-frames; select keeps one per frame.
	const blend = samples > 1 ? `tmix=frames=${samples},select='eq(mod(n\\,${samples})\\,${samples - 1})',` : "";
	const enc = ffmpeg(["-f", "image2pipe", "-framerate", String(fps * samples), "-c:v", "png", "-i", "-", "-vf", `${blend}setpts=N/${fps}/TB`, "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "6", "-pix_fmt", "yuv444p", seg]);
	for (let f = f0; f < f1; f++) {
		for (let k = 0; k < samples; k++) await write(enc.stdin, await grab((f + (k / samples) * shutter) / fps));
		if (index === 0 && f % 30 === 0) process.stdout.write(`\r  frame ${f - f0}/${f1 - f0} (worker 0)`);
	}
	enc.stdin.end();
	await enc.done;
	await browser.close();
	return seg;
}

// Bloom on hot highlights, chromatic kicks on the two impacts, grain, vignette.
const HITS = [7.5, 26.25];
function grade() {
	const ca = HITS.flatMap((t) => [
		`rgbashift=rh=-9:bh=9:rv=2:bv=-2:enable='between(t,${t},${t + 0.06})'`,
		`rgbashift=rh=-5:bh=5:enable='between(t,${t + 0.06},${t + 0.16})'`,
		`rgbashift=rh=-2:bh=2:enable='between(t,${t + 0.16},${t + 0.3})'`,
	]);
	const tail = [...ca, "vignette=angle=PI/5.2", "format=yuv420p", "noise=c0s=4:c0f=t+u"].join(",");
	return `[0:v]format=gbrp,split[a][b];[b]curves=all='0/0 0.55/0 1/1',gblur=sigma=28[g];[a][g]blend=all_mode=screen:all_opacity=0.55,${tail}[v]`;
}

async function main() {
	fs.mkdirSync(out, { recursive: true });
	const server = await serve();
	const url = `http://127.0.0.1:${server.address().port}/apps/homepage/scripts/showreel/index.html`;
	const chromium = loadChromium();

	if (args.stills) {
		const { browser, grab } = await openPage(chromium, url);
		for (const t of args.stills.split(",").map(Number)) {
			fs.writeFileSync(path.join(out, `still-${t.toFixed(2)}.png`), await grab(t));
		}
		await browser.close();
		server.close();
		return;
	}

	// The ungraded master is kept so --regrade can re-run the grade alone.
	const master = path.join(out, "master.mkv");
	if (!("regrade" in args)) {
		const frames = Math.round(DURATION * fps);
		const per = Math.ceil(frames / workers);
		console.log(`Rendering ${frames} frames × ${samples} samples on ${workers} workers`);
		const started = Date.now();
		const segs = await Promise.all(
			Array.from({ length: workers }, (_, i) => renderSegment(chromium, url, i, i * per, Math.min(frames, (i + 1) * per))),
		);
		console.log(`\n  captured in ${((Date.now() - started) / 1000).toFixed(0)}s`);
		const list = path.join(out, "segments.txt");
		fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n"));
		await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", master]).done;
		for (const s of [...segs, list]) fs.rmSync(s);
	}
	server.close();

	const audio = path.join(out, "soundtrack.wav");
	const final = path.join(out, "sero-reel.mp4");
	const hasAudio = fs.existsSync(audio);
	await ffmpeg([
		"-i", master,
		...(hasAudio ? ["-i", audio] : []),
		"-filter_complex", grade(),
		"-map", "[v]", ...(hasAudio ? ["-map", "1:a", "-c:a", "aac", "-b:a", "256k"] : []),
		"-c:v", "libx264", "-preset", "slow", "-crf", String(args.crf ?? 20), "-profile:v", "high",
		"-movflags", "+faststart", "-t", String(DURATION), final,
	]).done;
	console.log(`Wrote ${path.relative(process.cwd(), final)}${hasAudio ? "" : " (no soundtrack.wav found, silent)"}`);
}

await main();
