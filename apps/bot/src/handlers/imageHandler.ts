import type { BotContext } from "../context.ts";
import { DenoHttpDownloader } from "@integrations/mod.ts";
import type { ImageCachePort } from "@core/contracts/cachePorts.ts";
import { averageHash } from "@core/features/image/perceptualHash.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";

export function createImageHandler(deps: { imageCache: ImageCachePort }) {
  const downloader = new DenoHttpDownloader();

  return async function imageHandler(ctx: BotContext) {
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg || !tenant.settings.featureFlags.duplicateImages) return;
    if (!msg.photo || msg.photo.length === 0) return;

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const dateMs = (msg.date ?? Math.floor(Date.now() / 1000)) * 1000;

    // Smallest thumbnail is first.
    const fileId = msg.photo[0].file_id;
    const file = await ctx.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${Deno.env.get("TELEGRAM_TOKEN")}/${file.file_path}`;

    const bytes = await downloader.downloadToBytes(url);
    const hash = await averageHash(bytes, tenant.settings.duplicateImages.hashBits);

    const hit = await deps.imageCache.get(tenant.tenantId, hash);
    if (hit) {
      const agoHours = (Date.now() - hit.metadata.dateMs) / 3600000;
      const caption = renderTemplate(tenant.settings.duplicateImages.responseTemplate, {
        author: hit.metadata.author,
        ago: `${agoHours.toFixed(1)} hours ago`,
      });
      const warningBytes = await downloader.downloadToBytes(tenant.settings.duplicateImages.warningImageUrl);
      await ctx.api.sendPhoto(tenant.chatId, warningBytes, { caption, parse_mode: "HTML" }).catch(() => {});
      return;
    }

    await deps.imageCache.put(
      tenant.tenantId,
      { hash, metadata: { author, dateMs } },
      tenant.settings.duplicateImages.cacheSize,
    );
  };
}

