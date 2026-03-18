import type { BotContext } from "../context.ts";
import { DenoHttpDownloader, DenoTempFiles, FfmpegTranscoder } from "@integrations/mod.ts";
import { isExclusiveWebmUrl } from "@core/features/webm/detectWebm.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";

export function createWebmHandler() {
  const downloader = new DenoHttpDownloader();
  const temp = new DenoTempFiles();
  const transcoder = new FfmpegTranscoder();

  return async function webmHandler(ctx: BotContext) {
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg || typeof msg.text !== "string") return;
    if (!tenant.settings.featureFlags.webmConversion) return;

    const url = isExclusiveWebmUrl(msg.text);
    if (!url) return;

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const tmpDir = await temp.createTempDir("nodobot-webm-");
    const inPath = `${tmpDir}/input.webm`;
    const outPath = `${tmpDir}/output.mp4`;
    try {
      await downloader.downloadToFile(url, inPath);

      await transcoder.webmToMp4(inPath, outPath, {
        mode: tenant.settings.webmConversion.mode,
        crf: tenant.settings.webmConversion.crf,
        audioBitrateKbps: tenant.settings.webmConversion.audioBitrateKbps,
        ffmpegPreset: tenant.settings.webmConversion.ffmpegPreset,
      });

      const caption = renderTemplate(tenant.settings.webmConversion.postTemplate, { author });
      await ctx.api.sendVideo(tenant.chatId, { source: outPath }, { caption, parse_mode: "HTML" });
      if (tenant.settings.webmConversion.deleteOriginalMessage) {
        await ctx.api.deleteMessage(tenant.chatId, msg.message_id).catch(() => {});
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await ctx.api.sendMessage(tenant.chatId, `WebM conversion failed: ${err}`).catch(() => {});
    } finally {
      await temp.removePath(tmpDir);
    }
  };
}

