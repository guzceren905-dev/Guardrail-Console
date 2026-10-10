// Post-processes the recorded demo: speeds up long narration-free waits
// (transaction confirmation, dashboard refresh) and crops the window title bars.
//   node scripts/demo-video/tighten.ts <in.mp4> <out.mp4>
import { execFileSync, spawnSync } from "node:child_process";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: tighten.ts <in.mp4> <out.mp4>");
  process.exit(1);
}

const MIN_GAP = 8; // seconds of silence before a gap is sped up
const KEEP_HEAD = 1.5; // normal-speed seconds kept at the start of a gap
const KEEP_TAIL = 2.5; // and at its end, so the result is visible
const SPEED = 4;
const TITLE_BAR = Number(process.env.TITLE_BAR_PX ?? 42); // px at 1920 width

const probe = (args: string[]) => execFileSync("ffprobe", ["-v", "error", ...args, input], { encoding: "utf8" }).trim();
const duration = Number(probe(["-show_entries", "format=duration", "-of", "csv=p=0"]));
const [width, height] = probe(["-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0"]).split(",").map(Number);

// silencedetect reports on stderr.
const { stderr: text } = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", "silencedetect=noise=-40dB:d=1.5", "-vn", "-f", "null", "-"], { encoding: "utf8" });
const starts = [...text.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
const ends = [...text.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));

type Segment = { start: number; end: number; speed: number };
const segments: Segment[] = [];
let cursor = 0;
starts.forEach((s, i) => {
  const e = ends[i] ?? duration;
  if (e - s < MIN_GAP) return;
  const fastStart = s + KEEP_HEAD;
  const fastEnd = e - KEEP_TAIL;
  segments.push({ start: cursor, end: fastStart, speed: 1 });
  segments.push({ start: fastStart, end: fastEnd, speed: SPEED });
  cursor = fastEnd;
});
segments.push({ start: cursor, end: duration, speed: 1 });

const atempo = (speed: number) => (speed === 1 ? "" : `,${Array(Math.log2(speed)).fill("atempo=2").join(",")}`);
const filters = segments.map((seg, i) =>
  `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=(PTS-STARTPTS)/${seg.speed}[v${i}];` +
  `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS${atempo(seg.speed)}[a${i}]`,
);
const cropH = Math.floor((height - Math.round((TITLE_BAR * width) / 1920)) / 2) * 2;
const graph = `${filters.join(";")};${segments.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${segments.length}:v=1:a=1[vc][a];[vc]crop=${width}:${cropH}:0:${height - cropH}[v]`;

execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output]);
const outDuration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output], { encoding: "utf8" }));
console.log(`${duration.toFixed(1)}s -> ${outDuration.toFixed(1)}s, ${segments.filter((s) => s.speed > 1).length} waits sped up ${SPEED}x`);
