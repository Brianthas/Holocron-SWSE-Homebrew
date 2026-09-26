// Evaluates an expression in the running Foundry client over the Chrome DevTools Protocol. Foundry
// must be started with --remote-debugging-port (default 9222, override with CDP_PORT). The target
// is the first page whose URL contains /game, so a client on the setup or join screen is refused.

interface CdpTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface EvaluateResponse {
  id: number;
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } };
  error?: { message: string };
}

const PORT = Number(process.env["CDP_PORT"] ?? 9222);
const TIMEOUT_MS = Number(process.env["CDP_TIMEOUT_MS"] ?? 15000);

export async function findGameTarget(): Promise<CdpTarget> {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = (await response.json()) as CdpTarget[];
  const game = targets.find((t) => t.type === "page" && t.url.includes("/game") && t.webSocketDebuggerUrl);
  if (!game) {
    const urls = targets.filter((t) => t.type === "page").map((t) => t.url).join(", ") || "none";
    throw new Error(`no Foundry game page on port ${PORT} (pages: ${urls})`);
  }
  return game;
}

export async function evaluate(expression: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const target = await findGameTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl as string);
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      socket.close();
      rejectPromise(new Error(`CDP evaluate timed out after ${timeoutMs}ms; the page may still be running it`));
    }, timeoutMs);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as EvaluateResponse;
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.error) return rejectPromise(new Error(message.error.message));
      const details = message.result?.exceptionDetails;
      if (details) return rejectPromise(new Error(details.exception?.description ?? details.text ?? "exception"));
      resolvePromise(message.result?.result?.value);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      rejectPromise(new Error(`CDP socket error on ${target.webSocketDebuggerUrl}`));
    });
  });
}
