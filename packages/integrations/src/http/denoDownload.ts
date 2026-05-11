import type { HttpDownloadPort } from "@core/contracts/mediaPorts.ts";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class DenoHttpDownloader implements HttpDownloadPort {
  #headers: Record<string, string>;

  constructor(defaultHeaders: Record<string, string> = {}) {
    this.#headers = {
      "user-agent": DEFAULT_USER_AGENT,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...defaultHeaders,
    };
  }

  async downloadToBytes(url: string): Promise<Uint8Array> {
    const res = await fetchWithTimeout(url, this.#headers);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadToFile(url: string, outPath: string): Promise<void> {
    const res = await fetchWithTimeout(url, this.#headers);
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
