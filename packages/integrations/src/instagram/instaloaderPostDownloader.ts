export type InstaloaderPostDownloaderOpts = {
  /** Executable name or path (default `instaloader`). */
  command?: string;
  /** Instagram username for `--login` (uses Instaloader session file). */
  login?: string;
  /** Path passed to Instaloader `-f` / `--sessionfile` (load/store session). */
  sessionFile?: string;
  maxConnectionAttempts?: number;
};

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
 * using the Instaloader CLI, then returns ordered media file paths.
 */
export class InstaloaderPostDownloader {
  #command: string;
  #login?: string;
  #sessionFile?: string;
  #maxConnectionAttempts: number;

  constructor(opts: InstaloaderPostDownloaderOpts = {}) {
    this.#command = opts.command ?? "instaloader";
    this.#login = opts.login;
    this.#sessionFile = opts.sessionFile;
    this.#maxConnectionAttempts = opts.maxConnectionAttempts ?? 5;
  }

  /**
   * @param shortcode Post shortcode without a leading hyphen.
   * @param workDir Empty directory used as Instaloader working directory (caller-owned).
   */
  async downloadPost(shortcode: string, workDir: string): Promise<{ path: string; kind: "image" | "video" }[]> {
    const target = `-${shortcode}`;
    const postDir = `${workDir}/${target}`;

    const args: string[] = [];
    if (this.#sessionFile) {
      args.push("-f", this.#sessionFile);
    }
    if (this.#login) {
      args.push("--login", this.#login);
    }
    args.push(
      "-q",
      "--no-metadata-json",
      "--no-compress-json",
      "--no-captions",
      "--no-video-thumbnails",
      "--no-resume",
      "--sanitize-paths",
      "--max-connection-attempts",
      String(this.#maxConnectionAttempts),
      "--dirname-pattern",
      "{target}",
      "--",
      target,
    );

    const cmd = new Deno.Command(this.#command, {
      args,
      cwd: workDir,
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
    });

    const { code, stderr } = await cmd.output();
    const errText = decodeErr(stderr);

    const media = await collectMediaUnder(postDir);
    if (media.length > 0) return media;

    if (code !== 0) {
      throw new Error(
        errText ? `instaloader failed (${code}): ${errText}` : `instaloader failed with exit code ${code}`,
      );
    }
    throw new Error(
      errText ? `instaloader: no media files produced. ${errText}` : "instaloader: no media files produced",
    );
  }
}
