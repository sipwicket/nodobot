export type InstaloaderPostDownloaderOpts = {
  /** Executable name or path (default `gallery-dl`). */
  command?: string;
  /** Path to cookies file passed to `gallery-dl --cookies` (e.g. `cookies.txt`). */
  cookiesFile?: string;
  maxConnectionAttempts?: number;
};

/** Expands a leading `~` so values like `~/.config/instaloader/session-USER` work when read from env (no shell expansion). */
function expandUserPath(path: string): string {
  if (path === "~") {
    return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? path;
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (!home) return path;
    const rest = path.slice(2).replaceAll("\\", "/");
    const base = home.replace(/[/\\]$/, "");
    return `${base}/${rest}`;
  }
  return path;
}

const MEDIA_EXT_IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MEDIA_EXT_VIDEO = new Set([".mp4", ".webm"]);

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i).toLowerCase();
}

function mediaKindForPath(path: string): "image" | "video" | null {
  const e = extOf(path);
  if (MEDIA_EXT_VIDEO.has(e)) return "video";
  if (MEDIA_EXT_IMAGE.has(e)) return "image";
  return null;
}

async function collectMediaUnder(root: string): Promise<{ path: string; kind: "image" | "video" }[]> {
  const paths: string[] = [];

  async function walk(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(child);
      } else {
        const k = mediaKindForPath(child);
        if (k) paths.push(child);
      }
    }
  }

  try {
    await walk(root);
  } catch {
    return [];
  }

  paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out: { path: string; kind: "image" | "video" }[] = [];
  for (const p of paths) {
    const k = mediaKindForPath(p);
    if (k) out.push({ path: p, kind: k });
  }
  return out;
}

function decodeErr(bytes: Uint8Array, max = 4000): string {
  const t = new TextDecoder().decode(bytes).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Downloads one Instagram post (by shortcode) into a subdirectory of `workDir`
 * using `gallery-dl`, then returns ordered media file paths.
 */
export class InstaloaderPostDownloader {
  #command: string;
  #cookiesFile?: string;
  #maxConnectionAttempts: number;

  constructor(opts: InstaloaderPostDownloaderOpts = {}) {
    this.#command = opts.command ?? "gallery-dl";
    this.#cookiesFile = opts.cookiesFile ? expandUserPath(opts.cookiesFile) : undefined;
    this.#maxConnectionAttempts = opts.maxConnectionAttempts ?? 5;
  }

  /** Absolute or expanded cookies path passed to `gallery-dl --cookies`, if configured. */
  get resolvedCookiesFile(): string | undefined {
    return this.#cookiesFile;
  }

  /**
   * @param shortcode Post shortcode without a leading hyphen.
   * @param workDir Empty directory used as Instaloader working directory (caller-owned).
   */
  async downloadPost(shortcode: string, workDir: string): Promise<{ path: string; kind: "image" | "video" }[]> {
    const target = shortcode.trim();
    const postDir = `${workDir}/${target}`;
    const postUrl = `https://www.instagram.com/p/${target}/`;

    const args: string[] = [];
    if (this.#cookiesFile) {
      args.push("--cookies", this.#cookiesFile);
    }
    args.push(
      "--quiet",
      "--directory",
      postDir,
      "--retries",
      String(this.#maxConnectionAttempts),
      postUrl,
    );

    const cmd = new Deno.Command(this.#command, {
      args,
      cwd: workDir,
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
    });

    let code: number;
    let stderr: Uint8Array;
    try {
      const out = await cmd.output();
      code = out.code;
      stderr = out.stderr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`gallery-dl executable not available ('${this.#command}'): ${msg}`);
    }
    const errText = decodeErr(stderr);

    const media = await collectMediaUnder(postDir);
    if (media.length > 0) return media;

    if (code !== 0) {
      throw new Error(
        errText ? `gallery-dl failed (${code}): ${errText}` : `gallery-dl failed with exit code ${code}`,
      );
    }
    throw new Error(
      errText ? `gallery-dl: no media files produced. ${errText}` : "gallery-dl: no media files produced",
    );
  }
}
