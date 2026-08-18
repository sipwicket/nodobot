import type { BotContext } from "../context.ts";
import { DenoTempFiles, InstaloaderPostDownloader } from "@integrations/mod.ts";
import type { LinkCachePort } from "@core/contracts/cachePorts.ts";
import { extractShortcode, getInstagramPathname, fixInstagramUrl } from "@core/features/link/normalizers.ts";
import { storeLink } from "@core/features/link/duplicateLinks.ts";
import { generateProgressBar } from "@shared/progressBar.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor } from "../logger.ts";
import {
  describeMediaPostFailure,
  isTelegramFloodWait,
  notifyChatAfterError,
  withFloodWaitRetry,
} from "../telegramErrors.ts";
import { InputFile } from "npm:grammy@1.36.0";

export function createInstagramHandler(deps: { linkCache: LinkCachePort }) {
  const temp = new DenoTempFiles();

  return async function instagramHandler(ctx: BotContext) {
    const logger = loggerFor(ctx);
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

    logger.info("[instagramHandler] Instagram download triggered", {
      url,
      pathname,
      shortcode,
    });

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const dateMs = (msg.date ?? Math.floor(Date.now() / 1000)) * 1000;

    // Delete original early (legacy behavior).
    if (tenant.settings.instagram.deleteOriginalMessage) {
      await ctx.api.deleteMessage(tenant.chatId, msg.message_id).catch(() => { });
    }

    // Progress message.
    const progress = tenant.settings.instagram.progressUpdates
      ? await ctx.api.sendMessage(tenant.chatId, `${generateProgressBar(1, 5)} Fetching Instagram media...`)
      : null;

    const reporter = progress
      ? async (text: string) => {
        await ctx.api.editMessageText(tenant.chatId, progress.message_id, text).catch(() => { });
      }
      : undefined;

    // gallery-dl no longer supports username/password login for Instagram
    // (its `_login_impl` for the instagram extractor returns empty cookies and logs
    // "Login with username & password is no longer supported. Use browser cookies instead.").
    // Authenticated Instagram downloads MUST be done via a cookies.txt exported from a
    // logged-in browser session.
    const igDownloader = new InstaloaderPostDownloader({
      command: Deno.env.get("GALLERY_DL_CMD") ?? Deno.env.get("INSTALOADER_CMD") ?? undefined,
      cookiesFile: Deno.env.get("INSTAGRAM_COOKIES_FILE") ?? Deno.env.get("GALLERY_DL_COOKIES_FILE") ??
        Deno.env.get("COOKIES_FILE") ?? "cookies.txt",
    });

    logger.info("[instagramHandler] gallery-dl using cookies file (--cookies)", {
      cookiesFile: igDownloader.resolvedCookiesFile,
    });

    let tempDir: string | null = null;
    try {
      tempDir = await temp.createTempDir("nodobot-ig-");
      if (reporter) await reporter(`${generateProgressBar(2, 5)} Downloading media...`);

      const downloaded = await igDownloader.downloadPost(shortcode, tempDir);
      if (downloaded.length === 0) throw new Error("instagram: no media items");

      logger.debug("[instagramHandler] gallery-dl download finished", {
        itemCount: downloaded.length,
      });

      const items: { kind: "image" | "video"; path: string; caption?: string }[] = downloaded.map((d) => ({
        kind: d.kind,
        path: d.path,
      }));

      const caption = renderTemplate(tenant.settings.instagram.postTemplate, { author, count: String(items.length) });
      // Remove progress before media so "Sending to chat..." never stays next to the album.
      if (progress) {
        await ctx.api.deleteMessage(tenant.chatId, progress.message_id).catch(() => { });
      }
      // Telegram albums max 10.
      const batchSize = Math.min(tenant.settings.instagram.maxMediaGroupSize, 10);
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize).map((it, idx) => ({
          ...it,
          caption: i === 0 && idx === 0 ? caption : undefined,
        }));
        logger.debug("[instagramHandler] sending media batch", {
          batchSize: batch.length,
          totalItems: items.length,
        });
        await withFloodWaitRetry(() =>
          ctx.api.sendMediaGroup(
            tenant.chatId,
            batch.map((it) => ({
              type: it.kind === "video" ? "video" : "photo",
              media: new InputFile(it.path),
              caption: it.caption,
              parse_mode: "HTML",
            })) as any,
          )
        );
      }

      if (tenant.settings.featureFlags.duplicateLinks) {
        await storeLink({
          tenantId: tenant.tenantId,
          url,
          author,
          dateMs,
          cache: deps.linkCache,
          cacheSize: tenant.settings.duplicateLinks.cacheSize,
        });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("[instagramHandler] Instagram download failed", {
        error: errMsg,
      });
      if (progress) {
        await ctx.api.deleteMessage(tenant.chatId, progress.message_id).catch(() => { });
      }

      const code = e !== null && typeof e === "object"
        ? (e as { error_code?: unknown }).error_code
        : undefined;
      const isTelegramSendError = isTelegramFloodWait(e) ||
        typeof code === "number" ||
        /Call to 'send(?:MediaGroup|Photo|Video|Message)' failed/i.test(errMsg);

      // URL fixer is only a fallback for download failures, not Telegram send/rate-limit errors.
      if (!isTelegramSendError && tenant.settings.featureFlags.instagramFallbackFix) {
        const fixed = fixInstagramUrl(pathname, tenant.settings.instagram.fallbackFixDomain);
        await ctx.api.sendMessage(tenant.chatId, `<b>${author}</b> posted:\n${fixed}`, { parse_mode: "HTML" }).catch(() => { });
      } else {
        const userMessage = describeMediaPostFailure(e, "Instagram");
        logger.info("[instagramHandler] explaining failure to chat", { userMessage });
        await notifyChatAfterError({
          err: e,
          send: () => ctx.api.sendMessage(tenant.chatId, userMessage),
          onSendFailure: (sendErr) => {
            logger.warn("[instagramHandler] failed to send error notice to chat", {
              error: sendErr instanceof Error ? sendErr.message : String(sendErr),
            });
          },
        });
      }
    } finally {
      if (tempDir) await temp.removePath(tempDir);
    }
  };
}
