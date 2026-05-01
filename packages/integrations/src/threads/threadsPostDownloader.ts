import { DenoHttpDownloader } from "../http/denoDownload.ts";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);
const MIN_MEDIA_FILE_BYTES = 1_024;

type MediaKind = "image" | "video";

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const idx = pathname.lastIndexOf(".");
    return idx >= 0 ? pathname.slice(idx) : "";
  } catch {
    return "";
  }
}

function mediaKindForUrl(url: string): MediaKind | null {
  const ext = extensionFromUrl(url);
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  if (url.includes(".mp4")) return "video";
  if (url.includes(".jpg") || url.includes(".jpeg") || url.includes(".png") || url.includes(".webp")) return "image";
  return null;
}

function normalizeCandidateForPostMedia(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const kind = mediaKindForUrl(rawUrl);
  if (!kind) return null;

  if (kind === "image") {
    // Threads post images commonly carry ig_cache_key; this avoids profile pics and UI assets.
    if (!parsed.searchParams.get("ig_cache_key")) return null;
  }

  if (kind === "video") {
    // Prefer direct CDN video objects and ignore unrelated mp4s from scripts/assets.
    const path = parsed.pathname.toLowerCase();
    if (!path.includes("/o1/v/t16/") && !path.endsWith(".mp4")) return null;
  }

  return rawUrl;
}

function mediaIdentityKey(url: string, kind: MediaKind): string {
  try {
    const parsed = new URL(url);
    if (kind === "image") {
      const cacheKey = parsed.searchParams.get("ig_cache_key");
      if (cacheKey) return `image:${cacheKey}`;
      return `image:${parsed.pathname}`;
    }
    return `video:${parsed.pathname}`;
  } catch {
    return `${kind}:${url}`;
  }
}

function imageCandidateScore(url: string): number {
  try {
    const parsed = new URL(url);
    const stp = parsed.searchParams.get("stp") ?? "";
    let score = 0;

    // Prefer non-preview variants over p###x### thumbnails.
    if (/_p\d+x\d+/.test(stp) || /(^|_)p\d+x\d+/.test(stp)) score -= 5_000;

    // Prefer explicit "full-ish" variants when present.
    if (stp.includes("dst-jpg")) score += 200;

    // Prefer larger dimension hints.
    const sMatch = stp.match(/s(\d+)x(\d+)/);
    if (sMatch) {
      const w = Number.parseInt(sMatch[1] ?? "0", 10);
      const h = Number.parseInt(sMatch[2] ?? "0", 10);
      score += w * h;
    }
    const pMatch = stp.match(/p(\d+)x(\d+)/);
    if (pMatch) {
      const w = Number.parseInt(pMatch[1] ?? "0", 10);
      const h = Number.parseInt(pMatch[2] ?? "0", 10);
      score += Math.floor((w * h) / 4);
    }

    // Slight tie-breaker for longer URLs (often carry richer signed params).
    score += Math.min(url.length, 500);
    return score;
  } catch {
    return 0;
  }
}

function videoCandidateScore(url: string): number {
  try {
    const parsed = new URL(url);
    const scope = `${parsed.pathname} ${parsed.search}`;
    let score = 0;

    // Prefer candidates with explicit dimension hints in path/query.
    const dimMatch = scope.match(/(\d{2,5})[xX](\d{2,5})/);
    if (dimMatch) {
      const w = Number.parseInt(dimMatch[1] ?? "0", 10);
      const h = Number.parseInt(dimMatch[2] ?? "0", 10);
      score += w * h;
    }

    // Prefer explicitly high quality profile variants.
    if (/\/hd\//i.test(scope) || /quality=hd/i.test(scope)) score += 50_000;
    if (/\/sd\//i.test(scope) || /quality=sd/i.test(scope)) score -= 10_000;

    // Tie-breaker for richer signed URLs.
    score += Math.min(url.length, 500);
    return score;
  } catch {
    return 0;
  }
}

function candidateScore(url: string, kind: MediaKind): number {
  if (kind === "image") return imageCandidateScore(url);
  return videoCandidateScore(url);
}

function pickBestCandidate(urls: Iterable<string>, kind: MediaKind): string | null {
  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const url of urls) {
    if (mediaKindForUrl(url) !== kind) continue;
    const score = candidateScore(url, kind);
    if (score > bestScore) {
      best = url;
      bestScore = score;
    }
  }
  return best;
}

function bestUrlFromSrcset(srcset: string, kind: MediaKind): string | null {
  const ranked: Array<{ url: string; descriptorScore: number; score: number }> = [];
  for (const token of srcset.split(",")) {
    const parts = token.trim().split(/\s+/).filter(Boolean);
    const url = parts[0];
    if (!url) continue;

    let descriptorScore = 0;
    const descriptor = parts[1] ?? "";
    if (/^\d+w$/.test(descriptor)) {
      descriptorScore = Number.parseInt(descriptor.slice(0, -1), 10);
    } else if (/^\d+(\.\d+)?x$/.test(descriptor)) {
      descriptorScore = Math.floor(Number.parseFloat(descriptor.slice(0, -1)) * 1_000);
    }

    ranked.push({
      url,
      descriptorScore,
      score: candidateScore(url, kind),
    });
  }

  if (ranked.length === 0) return null;
  // In srcset, the descriptor is the most reliable signal for resolution.
  ranked.sort((a, b) => {
    if (b.descriptorScore !== a.descriptorScore) return b.descriptorScore - a.descriptorScore;
    return b.score - a.score;
  });
  return ranked[0]?.url ?? null;
}

function dedupeCandidatesByIdentity(urls: string[]): string[] {
  const bestByKey = new Map<string, { url: string; kind: MediaKind; score: number }>();
  for (const candidate of urls) {
    const kind = mediaKindForUrl(candidate);
    if (!kind) continue;
    const key = mediaIdentityKey(candidate, kind);
    const score = candidateScore(candidate, kind);
    const existing = bestByKey.get(key);
    if (!existing || score > existing.score) {
      bestByKey.set(key, { url: candidate, kind, score });
    }
  }
  const ranked = Array.from(bestByKey.values());
  const videos = ranked.filter((entry) => entry.kind === "video").map((entry) => entry.url);
  const images = ranked.filter((entry) => entry.kind === "image").map((entry) => entry.url);
  return [...videos, ...images];
}

function sanitizeDecodedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
  if (trimmed.includes("threads.net/embed.js")) return null;
  return trimmed;
}

function decodeEscapedUrl(raw: string): string {
  return raw
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0025", "%")
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003D", "=")
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/")
    .replace(/\\"/g, '"');
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const codePoint = Number.parseInt(n, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    });
}

function normalizeExtractedText(raw: string): string {
  return raw
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractPageletTextFromHtml(html: string, sourceUrl: string): string | null {
  const scopedHtml = pickScopedHtml(html, sourceUrl);
  const withoutScripts = scopedHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const withBlockBreaks = withoutScripts
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n");
  const stripped = withBlockBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(stripped);
  const normalized = normalizeExtractedText(decoded);
  return normalized.length > 0 ? normalized : null;
}

async function removeIfExists(path: string): Promise<void> {
  await Deno.remove(path).catch(() => { });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
}

async function discoverPlaywrightChromiumPath(): Promise<string | undefined> {
  const configured = Deno.env.get("THREADS_CHROMIUM_PATH") ??
    Deno.env.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  if (configured && await fileExists(configured)) return configured;

  const os = Deno.build.os;
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
  const localAppData = Deno.env.get("LOCALAPPDATA") ?? "";

  const roots = os === "windows"
    ? [`${localAppData}\\ms-playwright`]
    : [`${home}/.cache/ms-playwright`, "/ms-playwright"];

  const relCandidates = os === "windows"
    ? ["chrome-win64\\chrome.exe"]
    : ["chrome-linux/chrome", "chrome-linux/headless_shell"];

  for (const root of roots) {
    if (!root) continue;
    const discovered = await discoverChromiumPathInRoot(root, relCandidates);
    if (discovered) return discovered;
  }

  return undefined;
}

async function discoverChromiumPathInRoot(
  root: string,
  relCandidates: string[],
): Promise<string | undefined> {
  const entries: Deno.DirEntry[] = [];
  try {
    for await (const entry of Deno.readDir(root)) {
      entries.push(entry);
    }
  } catch {
    return undefined;
  }

  const chromiumDirs = entries
    .filter((entry) => entry.isDirectory && entry.name.startsWith("chromium-"))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" }));

  for (const dir of chromiumDirs) {
    for (const rel of relCandidates) {
      const candidate = `${root}/${dir.name}/${rel}`.replaceAll("/", Deno.build.os === "windows" ? "\\" : "/");
      if (await fileExists(candidate)) return candidate;
    }
  }
  return undefined;
}

function extractPostCodeFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/post\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function pickScopedHtml(html: string, sourceUrl: string): string {
  const markerRegex = /data-pagelet="threads_post_page_(\d+)"/g;
  const markers = Array.from(html.matchAll(markerRegex));
  if (markers.length === 0) return html;

  const postCode = extractPostCodeFromUrl(sourceUrl);
  const slices = markers.map((match, idx) => {
    const start = match.index ?? 0;
    const end = markers[idx + 1]?.index ?? html.length;
    return {
      pageIndex: Number.parseInt(match[1] ?? "-1", 10),
      content: html.slice(start, end),
    };
  });

  if (postCode) {
    const postCodeNeedle = `/post/${postCode}`;
    const exactSlice = slices.find((slice) => slice.content.includes(postCodeNeedle));
    if (exactSlice) return exactSlice.content;
  }

  const firstPostSlice = slices.find((slice) => slice.pageIndex === 0);
  return firstPostSlice?.content ?? slices[0].content;
}

function extractCandidateUrlsFromHtml(html: string, sourceUrl: string): string[] {
  const scopedHtml = pickScopedHtml(html, sourceUrl);
  const candidates = new Set<string>();
  const directTagCandidates = new Set<string>();

  const addCandidate = (raw: string) => {
    const decoded = decodeEscapedUrl(raw);
    const sanitized = sanitizeDecodedUrl(decoded);
    if (!sanitized) return;
    if (!mediaKindForUrl(sanitized)) return;
    candidates.add(sanitized);
  };
  const addDirectTagCandidate = (raw: string) => {
    const decoded = decodeEscapedUrl(raw);
    const sanitized = sanitizeDecodedUrl(decoded);
    if (!sanitized) return;
    if (!mediaKindForUrl(sanitized)) return;
    directTagCandidates.add(sanitized);
  };

  // Most stable direct extraction when the page includes a hydrated <video> tag.
  const videoBlockRegex = /<video\b[\s\S]*?<\/video>/gi;
  const srcRegex = /\ssrc=(?:"([^"]+)"|'([^']+)')/gi;
  const srcsetRegex = /\ssrcset=(?:"([^"]+)"|'([^']+)')/gi;
  for (const video of scopedHtml.matchAll(videoBlockRegex)) {
    const block = video[0] ?? "";
    const videoCandidates = new Set<string>();
    for (const srcMatch of block.matchAll(srcRegex)) {
      const src = srcMatch[1] ?? srcMatch[2] ?? "";
      if (src) videoCandidates.add(src);
    }
    if (videoCandidates.size === 0) {
      for (const srcsetMatch of block.matchAll(srcsetRegex)) {
        const srcset = srcsetMatch[1] ?? srcsetMatch[2] ?? "";
        const best = bestUrlFromSrcset(srcset, "video");
        if (best) videoCandidates.add(best);
      }
    }
    const best = pickBestCandidate(videoCandidates, "video");
    if (best) addDirectTagCandidate(best);
  }

  // Extract image candidates only from <picture> descendants in the selected post pagelet.
  const pictureBlockRegex = /<picture\b[\s\S]*?<\/picture>/gi;
  for (const picture of scopedHtml.matchAll(pictureBlockRegex)) {
    const block = picture[0] ?? "";
    const pictureCandidates = new Set<string>();
    for (const srcMatch of block.matchAll(srcRegex)) {
      const src = srcMatch[1] ?? srcMatch[2] ?? "";
      if (src) pictureCandidates.add(src);
    }
    if (pictureCandidates.size === 0) {
      for (const srcsetMatch of block.matchAll(srcsetRegex)) {
        const srcset = srcsetMatch[1] ?? srcsetMatch[2] ?? "";
        const best = bestUrlFromSrcset(srcset, "image");
        if (best) pictureCandidates.add(best);
      }
    }
    const best = pickBestCandidate(pictureCandidates, "image");
    if (best) addDirectTagCandidate(best);
  }

  // If we found direct post media tags, prefer them and skip broad payload regex fallbacks.
  if (directTagCandidates.size > 0) {
    for (const candidate of directTagCandidates) addCandidate(candidate);
    return Array.from(candidates.values());
  }

  // Common Threads payload fields.
  const structuredFieldRegex = /"(?:video_url|display_url|image_url|url)"\s*:\s*"([^"]+)"/g;
  for (const match of scopedHtml.matchAll(structuredFieldRegex)) {
    addCandidate(match[1] ?? "");
  }

  // Generic escaped/unescaped URL fallback from the payload.
  const genericUrlRegex = /https?:\\?\/\\?\/[^\s"'<>]+/g;
  for (const match of scopedHtml.matchAll(genericUrlRegex)) {
    addCandidate(match[0]);
  }

  return Array.from(candidates.values());
}

export type ThreadsPostDownloaderOpts = {
  userAgent?: string;
  requestTimeoutMs?: number;
  downloader?: DenoHttpDownloader;
  enableBrowserFallback?: boolean;
};

export type ThreadsDownloadProgressStage =
  | "fetching-page"
  | "parsing-payload"
  | "extracting-candidates"
  | "downloading-media"
  | "refreshing-candidates"
  | "finalizing-download";

export type ThreadsDownloadProgress = {
  stage: ThreadsDownloadProgressStage;
  message: string;
  current?: number;
  total?: number;
};

export class ThreadsPostDownloader {
  #userAgent: string;
  #requestTimeoutMs: number;
  #downloader: DenoHttpDownloader;
  #enableBrowserFallback: boolean;

  constructor(opts: ThreadsPostDownloaderOpts = {}) {
    this.#userAgent = opts.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    this.#requestTimeoutMs = opts.requestTimeoutMs ?? 15_000;
    this.#downloader = opts.downloader ?? new DenoHttpDownloader();
    this.#enableBrowserFallback = opts.enableBrowserFallback ?? true;
  }

  async #fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#requestTimeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": this.#userAgent,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`threads fetch failed: ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`threads fetch timeout after ${this.#requestTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #fetchCandidatesFromBrowser(url: string): Promise<string[]> {
    const responseCandidates = new Set<string>();
    const domCandidates = new Set<string>();
    const normalizeCandidate = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      const decoded = decodeEscapedUrl(raw);
      const sanitized = sanitizeDecodedUrl(decoded);
      if (!sanitized) return null;
      if (!mediaKindForUrl(sanitized)) return null;
      return sanitized;
    };
    const addResponseCandidate = (raw: string | null | undefined) => {
      const normalized = normalizeCandidate(raw);
      if (!normalized) return;
      responseCandidates.add(normalized);
    };
    const addDomCandidate = (raw: string | null | undefined) => {
      const normalized = normalizeCandidate(raw);
      if (!normalized) return;
      domCandidates.add(normalized);
    };

    let browser: any;
    try {
      const { chromium } = await import("npm:playwright");
      const executablePath = await discoverPlaywrightChromiumPath();
      const launchAttempts: Array<Record<string, unknown>> = [];
      if (executablePath) launchAttempts.push({ executablePath });
      launchAttempts.push({ channel: "chrome" });
      if (Deno.build.os === "windows") launchAttempts.push({ channel: "msedge" });
      launchAttempts.push({});

      let launchError: unknown;
      for (const attempt of launchAttempts) {
        try {
          browser = await chromium.launch({
            headless: true,
            args: ["--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check"],
            ...attempt,
          });
          break;
        } catch (err) {
          launchError = err;
        }
      }
      if (!browser) throw launchError instanceof Error ? launchError : new Error("Unable to launch Chromium");
      const page = await browser.newPage({
        userAgent: this.#userAgent,
      });

      page.on("response", (response: any) => {
        const responseUrl = String(response.url?.() ?? "");
        addResponseCandidate(responseUrl);
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.#requestTimeoutMs });
      await page.waitForTimeout(4_000);

      const domUrls = await page.evaluate(() => {
        const urls: string[] = [];
        const root =
          document.querySelector('[data-pagelet="threads_post_page_0"]') ?? document;
        const pushSrcsetUrls = (srcset: string | null | undefined) => {
          if (!srcset) return null;
          for (const token of srcset.split(",")) {
            const parts = token.trim().split(/\s+/).filter(Boolean);
            const url = parts[0];
            if (!url) continue;
            urls.push(url);
          }
        };
        for (const video of root.querySelectorAll("video")) {
          if (video.currentSrc) urls.push(video.currentSrc);
          if (video.src) urls.push(video.src);
          for (const source of video.querySelectorAll("source")) {
            if (source.src) urls.push(source.src);
          }
        }
        for (const picture of root.querySelectorAll("picture")) {
          const img = picture.querySelector("img");
          if (img?.src) {
            urls.push(img.src);
          } else {
            pushSrcsetUrls(img?.srcset);
            if (img?.currentSrc) urls.push(img.currentSrc);
          }
          const dataSrc = img?.getAttribute("data-src");
          if (dataSrc) urls.push(dataSrc);
        }
        return urls;
      });
      for (const u of domUrls) addDomCandidate(u);

      // Hydrated DOM + observed responses are usually fresher than embedded payload URLs.
      // Only fall back to HTML parsing when we failed to collect anything live.
      if (domCandidates.size === 0 && responseCandidates.size === 0) {
        const hydratedHtml = await page.content();
        const htmlCandidates = extractCandidateUrlsFromHtml(hydratedHtml, url);
        for (const u of htmlCandidates) addResponseCandidate(u);
      }
    } finally {
      try {
        await browser?.close();
      } catch {
        // Ignore browser shutdown errors in fallback path.
      }
    }

    // Prefer post-root DOM media only. Network responses can include unrelated feed assets.
    const all = domCandidates.size > 0
      ? Array.from(domCandidates.values())
      : Array.from(responseCandidates.values());
    const videos = all.filter((u) => mediaKindForUrl(u) === "video");
    const images = all.filter((u) => mediaKindForUrl(u) === "image");
    return [...videos, ...images];
  }

  async #extractPostTextFromBrowser(url: string): Promise<string | null> {
    let browser: any;
    try {
      const { chromium } = await import("npm:playwright");
      const executablePath = await discoverPlaywrightChromiumPath();
      const launchAttempts: Array<Record<string, unknown>> = [];
      if (executablePath) launchAttempts.push({ executablePath });
      launchAttempts.push({ channel: "chrome" });
      if (Deno.build.os === "windows") launchAttempts.push({ channel: "msedge" });
      launchAttempts.push({});

      let launchError: unknown;
      for (const attempt of launchAttempts) {
        try {
          browser = await chromium.launch({
            headless: true,
            args: ["--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check"],
            ...attempt,
          });
          break;
        } catch (err) {
          launchError = err;
        }
      }
      if (!browser) throw launchError instanceof Error ? launchError : new Error("Unable to launch Chromium");

      const page = await browser.newPage({
        userAgent: this.#userAgent,
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.#requestTimeoutMs });
      await page.waitForTimeout(4_000);

      const text = await page.evaluate(() => {
        const root = document.querySelector('[data-pagelet="threads_post_page_0"]') as HTMLElement | null;
        return root?.innerText ?? null;
      });
      const normalizedText = text ? normalizeExtractedText(text) : "";
      if (normalizedText) return normalizedText;

      const hydratedHtml = await page.content();
      return extractPageletTextFromHtml(hydratedHtml, url);
    } finally {
      try {
        await browser?.close();
      } catch {
        // Ignore browser shutdown errors in fallback path.
      }
    }
  }

  async #pickCandidates(
    url: string,
    report?: (
      stage: ThreadsDownloadProgressStage,
      message: string,
      extra?: { current?: number; total?: number },
    ) => Promise<void>,
  ): Promise<string[]> {
    const emit = report ?? (async () => {});
    const pickStaticCandidates = async () => {
      await emit("fetching-page", "Fetching Threads post page...");
      const html = await this.#fetchHtml(url);
      await emit("parsing-payload", "Parsing Threads payload...");
      await emit("extracting-candidates", "Extracting media candidates...");
      const allCandidates = dedupeCandidatesByIdentity(
        extractCandidateUrlsFromHtml(html, url)
          .map((candidate) => normalizeCandidateForPostMedia(candidate))
          .filter((candidate): candidate is string => Boolean(candidate)),
      );
      const videos = allCandidates.filter((u) => mediaKindForUrl(u) === "video");
      const images = allCandidates.filter((u) => mediaKindForUrl(u) === "image");
      return [...videos, ...images];
    };

    if (!this.#enableBrowserFallback) {
      return await pickStaticCandidates();
    }

    // Prefer hydrated DOM extraction: Threads post media is often unavailable in static HTML.
    try {
      const browserCandidates = dedupeCandidatesByIdentity(
        (await this.#fetchCandidatesFromBrowser(url))
          .map((candidate) => normalizeCandidateForPostMedia(candidate))
          .filter((candidate): candidate is string => Boolean(candidate)),
      );
      if (browserCandidates.length > 0) {
        const videos = browserCandidates.filter((u) => mediaKindForUrl(u) === "video");
        const images = browserCandidates.filter((u) => mediaKindForUrl(u) === "image");
        return [...videos, ...images];
      }
    } catch {
      // Fall through to static extraction when browser extraction fails.
    }

    return await pickStaticCandidates();
  }

  async inspectPostMediaCandidates(url: string): Promise<Array<{ url: string; kind: MediaKind }>> {
    const candidates = await this.#pickCandidates(url);
    return candidates
      .map((candidate) => {
        const kind = mediaKindForUrl(candidate);
        if (!kind) return null;
        return { url: candidate, kind };
      })
      .filter((item): item is { url: string; kind: MediaKind } => item !== null);
  }

  async extractPostText(url: string): Promise<string | null> {
    if (this.#enableBrowserFallback) {
      try {
        const browserText = await this.#extractPostTextFromBrowser(url);
        if (browserText) return browserText;
      } catch {
        // Fall through to static extraction when browser extraction fails.
      }
    }
    const html = await this.#fetchHtml(url);
    return extractPageletTextFromHtml(html, url);
  }

  async downloadPostMedia(
    url: string,
    outDir: string,
    opts: {
      onProgress?: (progress: ThreadsDownloadProgress) => Promise<void> | void;
    } = {},
  ): Promise<Array<{ path: string; kind: MediaKind }>> {
    const report = async (
      stage: ThreadsDownloadProgressStage,
      message: string,
      extra: { current?: number; total?: number } = {},
    ) => {
      await opts.onProgress?.({
        stage,
        message,
        ...extra,
      });
    };

    const candidates = await this.#pickCandidates(url, report);
    if (candidates.length === 0) {
      throw new Error("threads: no media URLs found in page payload");
    }
    await report("extracting-candidates", `Found ${candidates.length} media candidate(s).`);

    const files: Array<{ path: string; kind: MediaKind }> = [];
    const usedUrls = new Set<string>();
    const skippedDownloads: Array<{ url: string; reason: string }> = [];
    let seq = 1;
    for (const mediaUrl of candidates) {
      await report("downloading-media", `Downloading media ${seq}/${candidates.length}...`, {
        current: seq,
        total: candidates.length,
      });
      const kind = mediaKindForUrl(mediaUrl);
      if (!kind) continue;

      const tryDownload = async (candidateUrl: string) => {
        const ext = extensionFromUrl(candidateUrl) || (kind === "video" ? ".mp4" : ".jpg");
        const filename = `threads-${String(seq).padStart(2, "0")}${ext}`;
        const outPath = `${outDir}/${filename}`;
        await this.#downloader.downloadToFile(candidateUrl, outPath);
        const stat = await Deno.stat(outPath).catch(() => null);
        if (!stat?.isFile || stat.size <= MIN_MEDIA_FILE_BYTES) {
          const size = stat?.size ?? 0;
          await removeIfExists(outPath);
          throw new Error(`downloaded ${kind} file too small (${size} bytes)`);
        }
        files.push({ path: outPath, kind });
        usedUrls.add(candidateUrl);
        seq += 1;
      };

      let downloaded = false;
      try {
        await tryDownload(mediaUrl);
        downloaded = true;
      } catch (error) {
        // Signed Threads CDN URLs can expire quickly; refresh once and retry.
        await report("refreshing-candidates", `Fetching valid URL for item ${seq}/${candidates.length}...`, {
          current: seq,
          total: candidates.length,
        });
        const refreshedCandidates = await this.#pickCandidates(url, report);
        const refreshed = refreshedCandidates.find((u) =>
          mediaKindForUrl(u) === kind && !usedUrls.has(u)
        ) ??
          refreshedCandidates.find((u) => mediaKindForUrl(u) === kind);
        if (!refreshed) {
          const reason = error instanceof Error ? error.message : String(error);
          skippedDownloads.push({ url: mediaUrl, reason });
          continue;
        }
        try {
          await tryDownload(refreshed);
          downloaded = true;
        } catch (retryError) {
          const reason = retryError instanceof Error ? retryError.message : String(retryError);
          skippedDownloads.push({ url: refreshed, reason });
        }
      }
      if (!downloaded) {
        continue;
      }
    }
    await report("finalizing-download", "Validating downloaded media...");

    const expectedKinds = new Set<MediaKind>(
      candidates
        .map((candidate) => mediaKindForUrl(candidate))
        .filter((kind): kind is MediaKind => kind !== null),
    );
    const downloadedKinds = new Set<MediaKind>(files.map((file) => file.kind));
    const missingKinds = Array.from(expectedKinds.values()).filter((kind) => !downloadedKinds.has(kind));

    if (files.length === 0) {
      const details = skippedDownloads.map((item) => `${item.url} (${item.reason})`).join("; ");
      const suffix = details ? ` [${details}]` : "";
      throw new Error(`threads: payload parsed but media downloads failed${suffix}`);
    }
    if (missingKinds.length > 0) {
      const details = skippedDownloads.map((item) => `${item.url} (${item.reason})`).join("; ");
      const suffix = details ? ` [${details}]` : "";
      throw new Error(`threads: missing downloaded media kinds (${missingKinds.join(", ")})${suffix}`);
    }
    await report("finalizing-download", `Downloaded ${files.length} media file(s).`);
    return files;
  }
}
