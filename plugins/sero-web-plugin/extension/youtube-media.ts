import { execFileSync } from "node:child_process";
import { formatSeconds, isTimeoutError, mapFfmpegError, readExecError, trimErrorText } from "./utils.js";
import type { FrameResult, VideoFrame } from "./extract.js";

export type StreamInfo = { streamUrl: string; duration: number | null };
export type StreamResult = StreamInfo | { error: string };

function mapYtDlpError(err: unknown): string {
	const { code, stderr, message } = readExecError(err);
	if (code === "ENOENT") return "yt-dlp is not installed. Install with: brew install yt-dlp";
	if (isTimeoutError(err)) return "yt-dlp timed out fetching video info";
	const lower = stderr.toLowerCase();
	if (lower.includes("private")) return "Video is private or unavailable";
	if (lower.includes("sign in")) return "Video is age-restricted and requires authentication";
	if (lower.includes("not available")) return "Video is unavailable in your region or has been removed";
	if (lower.includes("live")) return "Cannot extract frames from a live stream";
	const snippet = trimErrorText(stderr || message);
	return snippet ? `yt-dlp failed: ${snippet}` : "yt-dlp failed";
}

export async function getYouTubeStreamInfo(videoId: string): Promise<StreamResult> {
	try {
		const output = execFileSync(
			"yt-dlp",
			["--print", "duration", "-g", `https://www.youtube.com/watch?v=${videoId}`],
			{ timeout: 15000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		).trim();
		const lines = output.split(/\r?\n/);
		const rawDuration = lines[0]?.trim();
		const streamUrl = lines[1]?.trim();
		if (!streamUrl) return { error: "yt-dlp failed: missing stream URL" };
		const parsedDuration = rawDuration && rawDuration !== "NA" ? Number.parseFloat(rawDuration) : Number.NaN;
		const duration = Number.isFinite(parsedDuration) ? parsedDuration : null;
		return { streamUrl, duration };
	} catch (err) {
		return { error: mapYtDlpError(err) };
	}
}

async function extractFrameFromStream(streamUrl: string, seconds: number): Promise<FrameResult> {
	try {
		const buffer = execFileSync(
			"ffmpeg",
			[
				"-ss",
				String(seconds),
				"-i",
				streamUrl,
				"-frames:v",
				"1",
				"-f",
				"image2pipe",
				"-vcodec",
				"mjpeg",
				"pipe:1",
			],
			{ maxBuffer: 5 * 1024 * 1024, timeout: 30000, stdio: ["pipe", "pipe", "pipe"] },
		);
		if (buffer.length === 0) return { error: "ffmpeg failed: empty output" };
		return { data: buffer.toString("base64"), mimeType: "image/jpeg" };
	} catch (err) {
		return { error: mapFfmpegError(err) };
	}
}

export async function extractYouTubeFrame(
	videoId: string,
	seconds: number,
	streamInfo?: StreamInfo,
): Promise<FrameResult> {
	const info = streamInfo ?? (await getYouTubeStreamInfo(videoId));
	if ("error" in info) return info;
	return extractFrameFromStream(info.streamUrl, seconds);
}

export async function extractYouTubeFrames(
	videoId: string,
	timestamps: number[],
	streamInfo?: StreamInfo,
): Promise<{ frames: VideoFrame[]; duration: number | null; error: string | null }> {
	const info = streamInfo ?? (await getYouTubeStreamInfo(videoId));
	if ("error" in info) return { frames: [], duration: null, error: info.error };
	const results = await Promise.all(
		timestamps.map(async (timestamp) => {
			const frame = await extractFrameFromStream(info.streamUrl, timestamp);
			if ("error" in frame) return { error: frame.error };
			return { ...frame, timestamp: formatSeconds(timestamp) };
		}),
	);
	const frames = results.filter((frame): frame is VideoFrame => "data" in frame);
	const errorResult = results.find((frame): frame is { error: string } => "error" in frame);
	return {
		frames,
		duration: info.duration,
		error: frames.length === 0 && errorResult ? errorResult.error : null,
	};
}

export async function fetchYouTubeThumbnail(videoId: string): Promise<{ data: string; mimeType: string } | null> {
	try {
		const res = await fetch(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length === 0) return null;
		return { data: buffer.toString("base64"), mimeType: "image/jpeg" };
	} catch {
		return null;
	}
}
