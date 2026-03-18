import type { BotContext } from "../context.ts";
import { DenoHttpDownloader } from "@integrations/mod.ts";
import type { ImageCachePort } from "@core/contracts/cachePorts.ts";
import { averageHash } from "@core/features/image/perceptualHash.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor } from "../logger.ts";

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export function createImageHandler(deps: { imageCache: ImageCachePort }) {
  const downloader = new DenoHttpDownloader();

  return async function imageHandler(ctx: BotContext) {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg) return;
    if (!tenant.settings.featureFlags.duplicateImages) {
      logger.debug("[imageHandler] duplicateImages feature flag is disabled for tenant", {
        feature: "duplicateImages",
      });
      return;
    }
    if (!msg.photo || msg.photo.length === 0) return;

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const dateMs = (msg.date ?? Math.floor(Date.now() / 1000)) * 1000;

    // Smallest thumbnail is first.
    const fileId = msg.photo[0].file_id;
    const file = await ctx.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${Deno.env.get("TELEGRAM_TOKEN")}/${file.file_path}`;

    const bytes = await downloader.downloadToBytes(url);
    const hash = await averageHash(bytes, tenant.settings.duplicateImages.hashBits);
    logger.debug("[imageHandler] computed image hash", {
      hash,
      bits: tenant.settings.duplicateImages.hashBits,
    });

    const hit = await deps.imageCache.get(tenant.tenantId, hash);
    logger.debug("[imageHandler] cache lookup", {
      hash,
      hit: Boolean(hit),
    });
    if (hit) {
      const caption = renderTemplate(tenant.settings.duplicateImages.responseTemplate, {
        author: hit.metadata.author,
        ago: formatTimeAgo(Date.now() - hit.metadata.dateMs),
      });
      await ctx.api.sendMessage(tenant.chatId, caption, { parse_mode: "HTML" }).catch(() => {});
      return;
    }

    await deps.imageCache.put(
      tenant.tenantId,
      { hash, metadata: { author, dateMs } },
      tenant.settings.duplicateImages.cacheSize,
    );
  };
}

