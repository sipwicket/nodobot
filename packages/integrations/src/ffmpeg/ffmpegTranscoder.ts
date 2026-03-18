import type { TranscoderPort } from "@core/contracts/mediaPorts.ts";

export class FfmpegTranscoder implements TranscoderPort {
  async webmToMp4(
    inputPath: string,
    outputPath: string,
    opts: { mode: "standard" | "ultraFast"; crf: number; audioBitrateKbps: number; ffmpegPreset: "ultrafast" },
  ): Promise<void> {
    const baseArgs = ["-y", "-i", inputPath];
    const videoArgs = ["-c:v", "libx264", "-preset", opts.ffmpegPreset, "-crf", String(opts.crf), "-tune", "fastdecode"];

    const audioArgs = opts.mode === "ultraFast"
      ? ["-c:a", "copy"]
      : ["-c:a", "aac", "-b:a", `${opts.audioBitrateKbps}k`];

    const args = [
      ...baseArgs,
      ...videoArgs,
      ...audioArgs,
      "-movflags",
      "+faststart",
      "-threads",
      "0",
      outputPath,
    ];

    const cmd = new Deno.Command("ffmpeg", { args, stdout: "null", stderr: "piped" });
    const { code, stderr } = await cmd.output();
    if (code === 0) return;

    // If ultraFast audio copy fails, retry with re-encode (legacy behavior).
    if (opts.mode === "ultraFast") {
      const retryArgs = [
        ...baseArgs,
        ...videoArgs,
        "-c:a",
        "aac",
        "-b:a",
        `${opts.audioBitrateKbps}k`,
        "-movflags",
        "+faststart",
        "-threads",
        "0",
        outputPath,
      ];
      const retry = new Deno.Command("ffmpeg", { args: retryArgs, stdout: "null", stderr: "piped" });
      const retryOut = await retry.output();
      if (retryOut.code === 0) return;
      throw new Error(new TextDecoder().decode(retryOut.stderr));
    }

    throw new Error(new TextDecoder().decode(stderr));
  }
}

