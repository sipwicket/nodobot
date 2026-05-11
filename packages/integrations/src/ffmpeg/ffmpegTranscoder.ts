import type { TranscoderPort } from "@core/contracts/mediaPorts.ts";

export class FfmpegTranscoder implements TranscoderPort {
  async webmToMp4(
    inputPath: string,
    outputPath: string,
    opts: { crf: number; audioBitrateKbps: number; ffmpegPreset: string },
  ): Promise<void> {
    const args = [
      "-y",
      "-i",
      inputPath,
      // Prevents "Too many packets buffered for output stream" on high-res input
      "-max_muxing_queue_size",
      "9999",
      // ── Video ────────────────────────────────────────────────────────────────
      "-c:v",
      "libx264",
      "-crf",
      String(opts.crf),
      // Hard cap on peak bitrate – avoids crashes on modest connections
      "-maxrate",
      "4.5M",
      "-preset",
      opts.ffmpegPreset,
      '-vf "scale=1280:-2"',
      // Embeds global metadata required by some players
      "-flags",
      "+global_header",
      // Broadest device compatibility (older Android / iOS)
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "baseline",
      // Moves the moov atom to the front for instant playback / streaming
      "-movflags",
      "+faststart",
      // ── Audio ────────────────────────────────────────────────────────────────
      // aac is the only codec Telegram accepts; ac 2 = stereo max
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      `${opts.audioBitrateKbps}k`,
      outputPath,
    ];

    const cmd = new Deno.Command("ffmpeg", {
      args,
      stdout: "null",
      stderr: "piped",
    });
    const { code, stderr } = await cmd.output();
    if (code !== 0) {
      throw new Error(new TextDecoder().decode(stderr));
    }
  }
}
