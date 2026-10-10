// Starts x402-demo/server.ts as a child process and resolves once it listens.
import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("./server.ts", import.meta.url));

export function startPaidApi(port: number, env: Record<string, string> = {}): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, PORT: String(port), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr!.on("data", (d) => (stderr += d));
    child.stdout!.on("data", (d) => String(d).includes("Paid API on") && resolve(child));
    child.on("exit", (code) => reject(new Error(`paid API exited (${code}): ${stderr}`)));
  });
}
