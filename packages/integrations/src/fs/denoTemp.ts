import type { TempFilePort } from "@core/contracts/mediaPorts.ts";

export class DenoTempFiles implements TempFilePort {
  async createTempDir(prefix: string): Promise<string> {
    return await Deno.makeTempDir({ prefix });
  }

  async removePath(path: string): Promise<void> {
    await Deno.remove(path, { recursive: true }).catch(() => {});
  }
}

