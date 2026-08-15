import type { HttpDownloadPort } from "@core/contracts/mediaPorts.ts";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 20_000;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) {
      const timeoutErr = new Error(`HTTP download timed out after ${timeoutMs}ms`);
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export class DenoHttpDownloader implements HttpDownloadPort {
  #headers: Record<string, string>;
  #timeoutMs: number;

  constructor(
    defaultHeaders: Record<string, string> = {},
    opts?: { timeoutMs?: number },
  ) {
    this.#headers = {
      "user-agent": DEFAULT_USER_AGENT,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...defaultHeaders,
    };
    this.#timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async downloadToBytes(url: string): Promise<Uint8Array> {
    const res = await fetchWithTimeout(url, this.#headers, this.#timeoutMs);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadToFile(url: string, outPath: string): Promise<void> {
    const res = await fetchWithTimeout(url, this.#headers, this.#timeoutMs);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    if (res.headers.get("content-length") === "0") {
      throw new Error("download failed: empty body");
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error("download failed: empty body");
    }
    await Deno.writeFile(outPath, bytes);
  }
}
