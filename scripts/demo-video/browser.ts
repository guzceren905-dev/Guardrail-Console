// Scrolls the dashboard in the demo Chrome window via the DevTools protocol.
// Only used while recording the demo video (Chrome started with --remote-debugging-port).
import type { View } from "./cues.ts";

const SELECTORS: Record<View, string | null> = {
  top: null,
  chart: ".spending-panel",
  guardrails: "#guardrails",
  activity: "#activity",
};

export class DashboardBrowser {
  private ws?: WebSocket;
  private nextId = 1;
  private readonly port: number;

  constructor(port: number) {
    this.port = port;
  }

  async connect(): Promise<void> {
    const targets = (await (await fetch(`http://127.0.0.1:${this.port}/json`)).json()) as { type: string; url: string; webSocketDebuggerUrl: string }[];
    const page = targets.find((t) => t.type === "page" && t.url.includes("guardrail-console"));
    if (!page) throw new Error("Dashboard tab not found in the demo browser");
    this.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws!.onopen = resolve;
      this.ws!.onerror = reject;
    });
  }

  private evaluate(expression: string): void {
    this.ws?.send(JSON.stringify({ id: this.nextId++, method: "Runtime.evaluate", params: { expression } }));
  }

  /** Shrinks the page so more of the dashboard fits the half-screen window. */
  zoom(factor: number): void {
    this.evaluate(`document.documentElement.style.zoom = "${factor}"`);
  }

  show(view: View): void {
    const selector = SELECTORS[view];
    this.evaluate(
      selector
        ? `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ behavior: "smooth", block: "start" })`
        : `window.scrollTo({ top: 0, behavior: "smooth" })`,
    );
  }

  close(): void {
    this.ws?.close();
  }
}
