// Records the narrated demo video on macOS.
//   node scripts/demo-video/record.ts <output.mp4>
// Needs: Screen Recording permission for the app running this script,
// Automation permission to control Terminal, Google Chrome, ffmpeg.
// Layout: a clean Chrome profile with the dashboard on the left, Terminal
// running the demo on the right. Other Terminal windows are minimized during
// the recording, and the video is cropped to the two windows (no menu bar or
// Dock). Narration is macOS `say`, aligned to the demo's cue timestamps.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { cues } from "./cues.ts";

const output = resolve(process.argv[2] ?? "guardrail-console-demo.mp4");
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DASHBOARD = "https://guardrail-console.vercel.app";
const VOICE = process.env.DEMO_VOICE ?? "Samantha";
const CDP_PORT = 9333;
const work = join(dirname(output), `.demo-work-${Date.now()}`);
mkdirSync(work, { recursive: true });

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
const osascript = (script: string) => run("osascript", ["-e", script]);

// 1. Narration clips.
const durations: Record<string, number> = {};
for (const [id, cue] of Object.entries(cues)) {
  const clip = join(work, `${id}.aiff`);
  run("say", ["-v", VOICE, "-r", "178", "-o", clip, cue.text]);
  durations[id] = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]));
}
const timeline = join(work, "timeline.jsonl");
const narrationFile = join(work, "narration.json");
writeFileSync(narrationFile, JSON.stringify({ durations, timeline, cdpPort: CDP_PORT }));
console.log(`narration: ${Object.keys(durations).length} clips, ${Object.values(durations).reduce((a, b) => a + b, 0).toFixed(0)}s`);

// 2. Layout from the main screen's logical size.
const [, , screenW, screenH] = osascript('tell application "Finder" to get bounds of window of desktop').split(", ").map(Number);
const MENU = 33;
const dockHidden = run("defaults", ["read", "com.apple.dock", "autohide"]) === "1";
const DOCK = dockHidden ? 0 : Number(run("defaults", ["read", "com.apple.dock", "tilesize"])) + 26;
const bottom = screenH - DOCK;
const split = Math.round(screenW * 0.6);

// Clean, throwaway Chrome profile: no bookmarks, tabs or history on screen.
spawn("open", ["-na", "Google Chrome", "--args",
  `--user-data-dir=${join(work, "chrome")}`, `--app=${DASHBOARD}`,
  `--window-position=0,${MENU}`, `--window-size=${split},${bottom - MENU}`,
  `--remote-debugging-port=${CDP_PORT}`, "--no-first-run", "--no-default-browser-check", "--disable-features=Translate"]);
for (let i = 0; i < 40; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json() as { url: string }[];
    if (targets.some((t) => t.url.includes("guardrail-console"))) break;
  } catch { /* not up yet */ }
  await sleep(500);
}
await sleep(9_000); // first live data load

const go = join(work, "go");
const done = join(work, "done");
// Clear the screen before the capture starts (the typed command and shell
// prompt contain the user name and home path), and never return to the prompt
// before the window is closed.
const command = [
  "clear",
  `cd ${JSON.stringify(REPO)}`,
  `while [ ! -f ${JSON.stringify(go)} ]; do sleep 0.2; done`,
  `DEMO_NARRATION=${JSON.stringify(narrationFile)} node --env-file-if-exists=.env.local scripts/testnet/demo.ts`,
  `touch ${JSON.stringify(done)}`,
  "exec sleep 601", // marker process, ended before the window is closed
].join("; ");
// Keep the user's own Terminal windows out of the video.
const userWindows = osascript('tell application "Terminal" to get id of every window').split(", ").filter(Boolean);
for (const id of userWindows) osascript(`tell application "Terminal" to set miniaturized of window id ${id} to true`);
osascript(`tell application "Terminal"
  activate
  do script ${JSON.stringify(command)}
  delay 0.5
  set bounds of front window to {${split}, ${MENU}, ${screenW}, ${bottom}}
  set font size of current settings of selected tab of front window to 12
  set custom title of selected tab of front window to "Guardrail Console demo"
  set title displays custom title of selected tab of front window to true
  set title displays device name of selected tab of front window to false
  set title displays shell path of selected tab of front window to false
  set title displays window size of selected tab of front window to false
end tell`);
await sleep(1_500);

// 3. Record the main screen with ffmpeg (stopped with "q" on stdin).
const raw = join(work, "screen.mp4");
const capture = spawn("ffmpeg", ["-v", "error", "-y", "-f", "avfoundation", "-capture_cursor", "0", "-framerate", "30",
  "-pixel_format", "nv12", "-i", process.env.DEMO_SCREEN_DEVICE ?? "Capture screen 0:none",
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", raw], { stdio: ["pipe", "inherit", "inherit"] });
const captureExit = new Promise((r) => capture.on("exit", r));
await sleep(2_000); // device start-up
writeFileSync(go, "");
console.log("recording…");
while (!existsSync(done) && capture.exitCode === null) await sleep(500);
if (capture.exitCode !== null) throw new Error(`screen capture stopped early (exit ${capture.exitCode})`);
await sleep(2_500);
const stoppedAt = Date.now();
capture.stdin!.end("q");
await captureExit;
console.log("recording stopped");

// 4. Clean up the windows and bring the user's app back.
try { run("pkill", ["-f", join(work, "chrome")]); } catch { /* already gone */ }
try { run("pkill", ["-f", "^sleep 601$"]); } catch { /* already gone */ }
await sleep(500);
try { osascript('tell application "Terminal" to close (every window whose custom title of selected tab is "Guardrail Console demo")'); } catch { /* ignore */ }
for (const id of userWindows) {
  try { osascript(`tell application "Terminal" to set miniaturized of window id ${id} to false`); } catch { /* ignore */ }
}
try { run("open", ["-a", "Claude"]); } catch { /* ignore */ }

// 5. Mix narration at the cue times, crop to the two windows and encode.
const [frameW] = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", raw]).split("\n").map(Number);
const scale = frameW / screenW;
const crop = `crop=${Math.round(screenW * scale)}:${Math.round((bottom - MENU) * scale)}:0:${Math.round(MENU * scale)}`;
// Video time 0 = when the recording stopped minus its duration.
const rawDuration = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]));
const videoOrigin = stoppedAt - rawDuration * 1000;
const events = readFileSync(timeline, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; t: number });
const inputs = events.flatMap((e) => ["-i", join(work, `${e.id}.aiff`)]);
const delays = events.map((e, i) => `[${i + 1}:a]adelay=${Math.max(0, Math.round(e.t - videoOrigin))}:all=1[a${i}]`).join(";");
const mix = `${delays};${events.map((_, i) => `[a${i}]`).join("")}amix=inputs=${events.length}:normalize=0:duration=longest[a]`;
run("ffmpeg", ["-v", "error", "-y", "-i", raw, ...inputs, "-filter_complex", mix,
  "-map", "0:v", "-map", "[a]", "-vf", `${crop},scale=1920:-2`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", output]);
console.log(`video: ${output}`);
console.log(`work files: ${work}`);
