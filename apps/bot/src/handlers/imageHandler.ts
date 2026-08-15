import type { BotContext } from "../context.ts";
import { DenoHttpDownloader } from "@integrations/mod.ts";
import type { ImageCachePort } from "@core/contracts/cachePorts.ts";
import { averageHash } from "@core/features/image/perceptualHash.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor } from "../logger.ts";
import {
  CooldownGate,
  TelegramNetworkError,
  retryWithTimeout,
} from "../networkRetry.ts";

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

function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function createImageHandler(deps: { imageCache: ImageCachePort }) {
  const timeoutMs = envInt("TELEGRAM_FILE_TIMEOUT_MS", 10_000);
  const attempts = envInt("TELEGRAM_FILE_ATTEMPTS", 3);
  const cooldownMs = envInt("TELEGRAM_FILE_COOLDOWN_MS", 60_000);
  const downloader = new DenoHttpDownloader({}, { timeoutMs });
  const fileApiCooldown = new CooldownGate(1, cooldownMs);

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

    if (fileApiCooldown.isOpen()) {
      logger.debug("[imageHandler] skipping duplicate check; telegram file API cooldown", {
        remainingMs: fileApiCooldown.remainingMs(),
      });
      return;
    }

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const dateMs = (msg.date ?? Math.floor(Date.now() / 1000)) * 1000;

    // Smallest thumbnail is first.
    const fileId = msg.photo[0].file_id;
    const token = Deno.env.get("TELEGRAM_TOKEN");
    if (!token) return;

    const retryOpts = { attempts, timeoutMs, delaysMs: [400, 1600] };

    let bytes: Uint8Array;
    try {
      const file = await retryWithTimeout(
        "getFile",
        (signal) => ctx.api.getFile(fileId, signal),
        retryOpts,
      );
      if (!file.file_path) {
        logger.warn("[imageHandler] getFile returned no file_path; skipping duplicate check");
        return;
      }
      const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      bytes = await retryWithTimeout(
        "downloadFile",
        (_signal) => downloader.downloadToBytes(url),
        retryOpts,
      );
      fileApiCooldown.recordSuccess();
    } catch (err) {
      const opened = fileApiCooldown.recordFailure();
      const networkErr = err instanceof TelegramNetworkError ? err : undefined;
      logger.warn("[imageHandler] skipped duplicate-image check; telegram file fetch failed", {
        reason: networkErr ? "telegram_file_unreachable" : "telegram_file_fetch_failed",
        operation: networkErr?.operation,
        attempts: networkErr?.attempts ?? attempts,
        timeoutMs: networkErr?.timeoutMs ?? timeoutMs,
        cause: networkErr?.causeCode,
        error: err instanceof Error ? err.message : String(err),
        cooldownMs: opened ? cooldownMs : undefined,
      });
      return;
    }

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
