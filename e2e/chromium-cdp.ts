import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { processExited, stopChild } from "./child-process.js";

const browserTargetSchema = z.object({
  type: z.literal("page"),
  webSocketDebuggerUrl: z.url(),
});

const cdpEnvelopeSchema = z
  .object({
    error: z
      .object({
        message: z.string(),
      })
      .passthrough()
      .optional(),
    id: z.number().optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
  })
  .passthrough();

const cdpEvaluationSchema = z
  .object({
    exceptionDetails: z.unknown().optional(),
    result: z
      .object({
        value: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type BrowserProcess = {
  child: ChildProcessWithoutNullStreams;
  page: CdpPage;
};

type CdpPending = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
};

type CdpWaiter = {
  method: string;
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timer: ReturnType<typeof globalThis.setTimeout>;
};

export class CdpPage {
  readonly #pending = new Map<number, CdpPending>();
  readonly #socket: WebSocket;
  readonly #waiters: CdpWaiter[] = [];
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      this.#receive(event.data);
    });
    socket.addEventListener("close", () => {
      this.#failAll(new Error("Chromium CDP connection closed"));
    });
  }

  static connect(url: string): Promise<CdpPage> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = globalThis.setTimeout(() => {
        socket.close();
        reject(new Error("Chromium CDP connection timed out"));
      }, 10_000);
      socket.addEventListener(
        "open",
        () => {
          globalThis.clearTimeout(timer);
          resolve(new CdpPage(socket));
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          globalThis.clearTimeout(timer);
          reject(new Error("Chromium CDP connection failed"));
        },
        { once: true },
      );
    });
  }

  close(): void {
    if (
      this.#socket.readyState === WebSocket.OPEN ||
      this.#socket.readyState === WebSocket.CONNECTING
    ) {
      this.#socket.close();
    }
  }

  async evaluate(expression: string): Promise<unknown> {
    const raw = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    const evaluation = cdpEvaluationSchema.parse(raw);
    assert.equal(
      evaluation.exceptionDetails,
      undefined,
      `browser expression failed: ${expression}`,
    );
    return evaluation.result.value;
  }

  async navigate(url: string, expectedUrl = url): Promise<void> {
    await this.send("Page.navigate", { url });
    await waitForCondition(
      this,
      `location.href === ${JSON.stringify(expectedUrl)}`,
      10_000,
      `browser navigation to ${url}`,
    );
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Chromium CDP command timed out: ${method}`));
      }, 10_000);
      this.#pending.set(id, { reject, resolve, timer });
      try {
        this.#socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        globalThis.clearTimeout(timer);
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  waitForEvent(method: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        const index = this.#waiters.findIndex(
          (waiter) => waiter.resolve === resolve,
        );
        if (index >= 0) {
          this.#waiters.splice(index, 1);
        }
        reject(new Error(`Chromium CDP event timed out: ${method}`));
      }, timeoutMs);
      this.#waiters.push({ method, reject, resolve, timer });
    });
  }

  #failAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    for (const waiter of this.#waiters.splice(0)) {
      globalThis.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  #receive(raw: unknown): void {
    try {
      if (typeof raw !== "string") {
        throw new Error("Chromium CDP sent a non-text message");
      }
      const parsed: unknown = JSON.parse(raw);
      const message = cdpEnvelopeSchema.parse(parsed);
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) {
          return;
        }
        globalThis.clearTimeout(pending.timer);
        this.#pending.delete(message.id);
        if (message.error !== undefined) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
      if (message.method === undefined) {
        return;
      }
      const index = this.#waiters.findIndex(
        (waiter) => waiter.method === message.method,
      );
      if (index < 0) {
        return;
      }
      const waiter = this.#waiters[index];
      if (waiter === undefined) {
        return;
      }
      this.#waiters.splice(index, 1);
      globalThis.clearTimeout(waiter.timer);
      waiter.resolve(message.params);
    } catch (error) {
      this.#failAll(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export async function startBrowser(home: string): Promise<BrowserProcess> {
  const executable = await chromeExecutable();
  const output: string[] = [];
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${path.join(home, "chromium")}`,
      "about:blank",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.on("error", (error) => output.push(`${error.message}\n`));
  try {
    const debuggerUrl = await waitForDevtoolsUrl(child, output);
    const debuggerEndpoint = new URL(debuggerUrl);
    const targetEndpoint = `http://${debuggerEndpoint.host}/json/list`;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (processExited(child)) {
        throw new Error(`Chromium exited during startup:\n${output.join("")}`);
      }
      const response = await fetch(targetEndpoint).catch(() => undefined);
      if (response?.ok) {
        const targetsValue: unknown = await response.json();
        const targets = z.array(z.unknown()).parse(targetsValue);
        for (const value of targets) {
          const parsed = browserTargetSchema.safeParse(value);
          if (parsed.success) {
            return {
              child,
              page: await CdpPage.connect(parsed.data.webSocketDebuggerUrl),
            };
          }
        }
      }
      await delay(50);
    }
    throw new Error(`Chromium did not expose a page target:\n${output.join("")}`);
  } catch (error) {
    await stopChild(child, "SIGTERM", "Chromium startup").catch(() => undefined);
    throw error;
  }
}

export async function stopBrowser(browser: BrowserProcess): Promise<void> {
  browser.page.close();
  await stopChild(browser.child, "SIGTERM", "Chromium");
}

export async function waitForCondition(
  page: CdpPage,
  expression: string,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (z.boolean().parse(await page.evaluate(expression))) {
      return;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${description}`);
}

export async function waitForText(
  page: CdpPage,
  selector: string,
  text: string,
  timeoutMs: number,
): Promise<void> {
  await waitForCondition(
    page,
    `document.querySelector(${JSON.stringify(selector)})?.textContent?.includes(${JSON.stringify(text)}) === true`,
    timeoutMs,
    `${selector} to contain ${text}`,
  );
}

async function chromeExecutable(): Promise<string> {
  const configured = process.env.CHROME_PATH;
  const candidates = [
    configured,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate.length === 0) {
      continue;
    }
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("browser journey needs Chrome or Chromium; set CHROME_PATH");
}

async function waitForDevtoolsUrl(
  child: ChildProcessWithoutNullStreams,
  output: string[],
): Promise<string> {
  // Coverage jobs run Chromium under llvm-cov load, so DevTools can take
  // materially longer than the ordinary command timeout to appear.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(output.join(""));
    if (match?.[1] !== undefined) {
      return match[1];
    }
    if (processExited(child)) {
      throw new Error(`Chromium exited before CDP was ready:\n${output.join("")}`);
    }
    await delay(50);
  }
  throw new Error(`Chromium did not publish its CDP URL:\n${output.join("")}`);
}
