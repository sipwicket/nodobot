import type { HttpDownloadPort } from "@core/contracts/mediaPorts.ts";

export class DenoHttpDownloader implements HttpDownloadPort {
  async downloadToBytes(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadToFile(url: string, outPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const file = await Deno.open(outPath, { write: true, create: true, truncate: true });
    try {
      if (!res.body) throw new Error("download failed: missing body");
      // Keep explicit ownership of file close to avoid double-close races.
      await res.body.pipeTo(file.writable, { preventClose: true });
    } finally {
      file.close();
    }
  }
}

