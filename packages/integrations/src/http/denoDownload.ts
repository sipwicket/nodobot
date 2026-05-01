import type { HttpDownloadPort } from "@core/contracts/mediaPorts.ts";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 20_000;

function buildDownloadHeaders(url: string): HeadersInit {
  let referer = "https://www.instagram.com/";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("threads.net") || host.includes("threads.com") || host.includes("cdninstagram.com")) {
      referer = "https://www.threads.com/";
    }
  } catch {
    // Ignore invalid URL; keep default headers.
  }
  return {
    "user-agent": DEFAULT_USER_AGENT,
    // Use browser-like accept values to avoid CDN zero-body edge cases on media URLs.
    "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "referer": referer,
  };
}

async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: buildDownloadHeaders(url),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class DenoHttpDownloader implements HttpDownloadPort {
  async downloadToBytes(url: string): Promise<Uint8Array> {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadToFile(url: string, outPath: string): Promise<void> {
    const res = await fetchWithTimeout(url);
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

