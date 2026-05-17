export type InstaloaderPostDownloaderOpts = {
  /** Executable name or path (default `gallery-dl`). */
  command?: string;
  /**
   * Path to the cookies file passed to `gallery-dl --cookies` (Mozilla/Netscape `cookies.txt` format).
   *
   * Path resolution rules:
   * - `~` and `~/...` are expanded against `$HOME` / `$USERPROFILE`.
   * - Relative paths are resolved against `Deno.cwd()` (the project root when launched
   *   via `deno task start` or via the Docker `WORKDIR /app`). This matters because
   *   `gallery-dl` is launched with `cwd` set to a temp directory, so a bare
   *   `cookies.txt` would otherwise be looked up next to the temp dir and silently miss.
   */
  cookiesFile?: string;
  maxConnectionAttempts?: number;
};

const ABSOLUTE_PATH_RE = /^(?:[/\\]|[A-Za-z]:[\\/])/;

/**
 * Expand a leading `~` and resolve relative paths against `Deno.cwd()` (project root).
 *
 * No shell expansion is performed; this is purely string-level so values read from env
 * (`~/.config/...`, `cookies.txt`, `/app/cookies.txt`, `C:\...`) all behave the same.
 */
function resolveCookiesPath(path: string): string {
  let p = path;
  if (p === "~") {
    return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? p;
  }
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (home) {
      const rest = p.slice(2).replaceAll("\\", "/");
      const base = home.replace(/[/\\]$/, "");
      p = `${base}/${rest}`;
    }
  }
  if (ABSOLUTE_PATH_RE.test(p)) return p;
  const cwd = Deno.cwd().replace(/[/\\]$/, "");
  return `${cwd}/${p}`;
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
 *
 * Authentication: gallery-dl no longer supports `-u/-p` for Instagram (it logs an
 * error and falls back to anonymous, which Instagram immediately redirects to its
 * login page). Authenticated downloads must be done via a `cookies.txt` exported
 * from a logged-in browser session.
 */
export class InstaloaderPostDownloader {
  #command: string;
  #cookiesFile?: string;
  #maxConnectionAttempts: number;

  constructor(opts: InstaloaderPostDownloaderOpts = {}) {
    this.#command = opts.command ?? "gallery-dl";
    this.#cookiesFile = opts.cookiesFile ? resolveCookiesPath(opts.cookiesFile) : undefined;
    this.#maxConnectionAttempts = opts.maxConnectionAttempts ?? 5;
  }

  /** Absolute, expanded cookies path that will be passed to `gallery-dl --cookies`, if configured. */
  get resolvedCookiesFile(): string | undefined {
    return this.#cookiesFile;
  }

  /**
   * @param shortcode Post shortcode without a leading hyphen.
   * @param workDir Empty directory used as gallery-dl working directory (caller-owned).
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
