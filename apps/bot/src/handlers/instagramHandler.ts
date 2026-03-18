import type { BotContext } from "../context.ts";
import { DenoHttpDownloader, DenoTempFiles, InstagramClient } from "@integrations/mod.ts";
import { extractInstagramMediaUrls } from "@core/features/instagram/mediaExtract.ts";
import { extractShortcode, getInstagramPathname, fixInstagramUrl } from "@core/features/link/normalizers.ts";
import { generateProgressBar } from "@shared/progressBar.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { InputFile } from "npm:grammy@1.36.0";

function extForType(t: "video" | "image"): string {
  return t === "video" ? "mp4" : "jpg";
}

export function createInstagramHandler() {
  const downloader = new DenoHttpDownloader();
  const temp = new DenoTempFiles();

  return async function instagramHandler(ctx: BotContext) {
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg || typeof msg.text !== "string") return;
    if (!tenant.settings.featureFlags.instagramDownload || !tenant.settings.instagram.preferNativeDownload) return;

    const entities = msg.entities ?? [];
    // Only handle when the message contains exactly one url entity.
    const urlEntities = entities.filter((e) => e.type === "url");
    if (urlEntities.length !== 1) return;
    const url = msg.text.slice(urlEntities[0].offset, urlEntities[0].offset + urlEntities[0].length);
    const pathname = getInstagramPathname(url);
    if (!pathname) return;

    const shortcode = extractShortcode(pathname);
    if (!shortcode) return;

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";

    // Delete original early (legacy behavior).
    if (tenant.settings.instagram.deleteOriginalMessage) {
      await ctx.api.deleteMessage(tenant.chatId, msg.message_id).catch(() => {});
    }

    // Progress message.
    const progress = tenant.settings.instagram.progressUpdates
      ? await ctx.api.sendMessage(tenant.chatId, `${generateProgressBar(1, 5)} Fetching Instagram media...`)
      : null;

    const reporter = progress
      ? async (text: string) => {
        await ctx.api.editMessageText(tenant.chatId, progress.message_id, text).catch(() => {});
      }
      : undefined;

    const ig = new InstagramClient({
      cookies: Deno.env.get("INSTAGRAM_COOKIES") ?? undefined,
      minRequestIntervalMs: tenant.settings.instagram.minRequestIntervalMs,
      retryBackoffMs: tenant.settings.instagram.retryBackoffMs,
    });

    let tempDir: string | null = null;
    try {
      const apiResult = await ig.getBlobMedia(shortcode, reporter);
      const media = extractInstagramMediaUrls(apiResult);
      if (media.length === 0) throw new Error("instagram: no media items");

      tempDir = await temp.createTempDir("nodobot-ig-");
      if (reporter) await reporter(`${generateProgressBar(2, 5)} Downloading ${media.length} items...`);

      const items: { kind: "image" | "video"; path: string; caption?: string }[] = [];
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        const outPath = `${tempDir}/${String(i + 1).padStart(2, "0")}.${extForType(m.type)}`;
        await downloader.downloadToFile(m.url, outPath);
        items.push({ kind: m.type === "video" ? "video" : "image", path: outPath });
      }

      if (reporter) await reporter(`${generateProgressBar(4, 5)} Sending to chat...`);
      const caption = renderTemplate(tenant.settings.instagram.postTemplate, { author, count: String(items.length) });
      // Telegram albums max 10.
      const batchSize = Math.min(tenant.settings.instagram.maxMediaGroupSize, 10);
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize).map((it, idx) => ({
          ...it,
          caption: i === 0 && idx === 0 ? caption : undefined,
        }));
        await ctx.api.sendMediaGroup(
          tenant.chatId,
          batch.map((it) => ({
            type: it.kind === "video" ? "video" : "photo",
            media: new InputFile(it.path),
            caption: it.caption,
            parse_mode: "HTML",
          })) as any,
        );
      }

      if (progress) {
        await ctx.api.deleteMessage(tenant.chatId, progress.message_id).catch(() => {});
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // Fallback to URL fixer (legacy behavior).
      if (tenant.settings.featureFlags.instagramFallbackFix) {
        const fixed = fixInstagramUrl(pathname, tenant.settings.instagram.fallbackFixDomain);
        await ctx.api.sendMessage(tenant.chatId, `<b>${author}</b> posted:\n${fixed}`, { parse_mode: "HTML" }).catch(() => {});
      } else {
        await ctx.api.sendMessage(tenant.chatId, `Instagram download failed: ${errMsg}`).catch(() => {});
      }
      if (progress) {
        await ctx.api.deleteMessage(tenant.chatId, progress.message_id).catch(() => {});
      }
    } finally {
      if (tempDir) await temp.removePath(tempDir);
    }
  };
}

