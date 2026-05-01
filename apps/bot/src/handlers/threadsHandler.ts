import type { BotContext } from "../context.ts";
import { DenoTempFiles, ThreadsPostDownloader } from "@integrations/mod.ts";
import type { ThreadsDownloadProgress } from "@integrations/mod.ts";
import { getThreadsPathname, extractThreadsPostCode } from "@core/features/link/normalizers.ts";
import { generateProgressBar } from "@shared/progressBar.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor } from "../logger.ts";
import { InputFile } from "npm:grammy@1.36.0";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function inspectDownloadedMedia(path: string) {
  try {
    const stat = await Deno.stat(path);
    return {
      exists: true,
      size: stat.size,
      isFile: stat.isFile,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      exists: false,
      size: 0,
      isFile: false,
      statError: errMsg,
    };
  }
}

export function createThreadsHandler() {
  const temp = new DenoTempFiles();
  const progressTotal = 10;
  const stageProgressStep: Record<ThreadsDownloadProgress["stage"], number> = {
    "fetching-page": 3,
    "parsing-payload": 4,
    "extracting-candidates": 5,
    "downloading-media": 6,
    "refreshing-candidates": 7,
    "finalizing-download": 8,
  };

  return async function threadsHandler(ctx: BotContext) {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg || typeof msg.text !== "string") {
      logger.debug("[threadsHandler] skipped: missing tenant/message text");
      return;
    }
    if (!tenant.settings.featureFlags.threadsDownload) {
      logger.debug("[threadsHandler] skipped: threadsDownload feature flag disabled");
      return;
    }
    if (!tenant.settings.threads.preferNativeDownload) {
      logger.debug("[threadsHandler] skipped: preferNativeDownload disabled");
      return;
    }

    const entities = msg.entities ?? [];
    const urlEntities = entities.filter((e) => e.type === "url");
    if (urlEntities.length !== 1) {
      logger.debug("[threadsHandler] skipped: expected exactly one URL entity", {
        urlEntityCount: urlEntities.length,
      });
      return;
    }
    const url = msg.text.slice(urlEntities[0].offset, urlEntities[0].offset + urlEntities[0].length);
    const pathname = getThreadsPathname(url);
    if (!pathname) {
      logger.debug("[threadsHandler] skipped: message URL is not a Threads URL", { url });
      return;
    }
    const postCode = extractThreadsPostCode(pathname);
    if (!postCode) {
      logger.warn("[threadsHandler] unable to extract Threads post code", { url, pathname });
      return;
    }

    logger.info("[threadsHandler] Threads download triggered", { url, pathname, postCode });
    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";

    if (tenant.settings.threads.deleteOriginalMessage) {
      await ctx.api.deleteMessage(tenant.chatId, msg.message_id).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn("[threadsHandler] failed to delete original message", {
          error: errMsg,
          messageId: msg.message_id,
        });
      });
    }

    const progress = tenant.settings.threads.progressUpdates
      ? await ctx.api.sendMessage(tenant.chatId, `${generateProgressBar(1, progressTotal)} Starting Threads download...`)
      : null;
    const reporter = progress
      ? async (text: string) => {
        await ctx.api.editMessageText(tenant.chatId, progress.message_id, text).catch(() => { });
      }
      : undefined;

    const downloader = new ThreadsPostDownloader();
    let tempDir: string | null = null;
    try {
      if (reporter) await reporter(`${generateProgressBar(2, progressTotal)} Preparing to download...`);
      tempDir = await temp.createTempDir("nodobot-threads-");

      const postText = await downloader.extractPostText(url).catch((error) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.debug("[threadsHandler] failed to extract Threads post text", { error: errMsg, url });
        return null;
      });

      logger.info("[threadsHandler] starting media download", { url, tempDir });
      const downloaded = await downloader.downloadPostMedia(url, tempDir, {
        onProgress: async (update) => {
          if (!reporter) return;
          let step = stageProgressStep[update.stage];
          if (update.stage === "downloading-media" && update.current && update.total) {
            // Spread per-item download progress across steps 6..8 for a smoother bar.
            const ratio = Math.min(1, Math.max(0, update.current / update.total));
            step = 6 + Math.round(ratio * 2);
          }
          await reporter(`${generateProgressBar(step, progressTotal)} ${update.message}`);
        },
      });
      logger.info("[threadsHandler] media download completed", { mediaCount: downloaded.length });
      const diagnostics = await Promise.all(downloaded.map(async (item, index) => {
        const info = await inspectDownloadedMedia(item.path);
        return {
          index,
          kind: item.kind,
          path: item.path,
          ...info,
        };
      }));
      logger.debug("[threadsHandler] downloaded media diagnostics", {
        media: diagnostics,
      });
      const invalidMedia = diagnostics.filter((item) =>
        !item.exists || !item.isFile || item.size <= 0
      );
      if (invalidMedia.length > 0) {
        logger.warn("[threadsHandler] downloaded media contains invalid files", {
          invalidMedia,
        });
      }
      if (downloaded.length === 0) throw new Error("threads: no media items");
      if (reporter) await reporter(`${generateProgressBar(9.5, progressTotal)} Uploading...`);

      const escapedPostText = postText ? escapeHtml(postText) : "";
      const template = tenant.settings.threads.postTemplate;
      const renderedCaption = renderTemplate(template, {
        author,
        count: String(downloaded.length),
        text: escapedPostText,
      });
      const caption = escapedPostText && !template.includes("{text}")
        ? `${renderedCaption}\n\n${escapedPostText}`
        : renderedCaption;

      const batchSize = Math.min(tenant.settings.threads.maxMediaGroupSize, 10);
      logger.info("[threadsHandler] sending media groups", {
        mediaCount: downloaded.length,
        batchSize,
      });
      for (let i = 0; i < downloaded.length; i += batchSize) {
        const batch = downloaded.slice(i, i + batchSize);
        const batchDiagnostics = diagnostics.slice(i, i + batchSize);
        logger.debug("[threadsHandler] sending batch", {
          batchIndex: Math.floor(i / batchSize),
          batchStart: i,
          batchLength: batch.length,
          batchDiagnostics,
        });
        try {
          await ctx.api.sendMediaGroup(
            tenant.chatId,
            batch.map((it, idx) => ({
              type: it.kind === "video" ? "video" : "photo",
              media: new InputFile(it.path),
              caption: i === 0 && idx === 0 ? caption : undefined,
              parse_mode: "HTML",
            })) as any,
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error("[threadsHandler] sendMediaGroup failed for batch", {
            error: errMsg,
            batchIndex: Math.floor(i / batchSize),
            batchStart: i,
            batchLength: batch.length,
            batchDiagnostics,
          });
          throw error;
        }
      }
      if (progress) {
        await ctx.api.deleteMessage(tenant.chatId, progress.message_id).catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn("[threadsHandler] failed to delete progress message after upload", {
            error: errMsg,
            progressMessageId: progress.message_id,
          });
        });
      }
      logger.info("[threadsHandler] Threads media sent successfully", {
        totalMedia: downloaded.length,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("[threadsHandler] Threads download failed", { error: errMsg, url });
      await ctx.api.sendMessage(
        tenant.chatId,
        `Threads download failed: ${errMsg}. This handler currently supports public posts only.`,
      ).catch(() => { });
      if (progress) {
        await ctx.api.deleteMessage(tenant.chatId, progress.message_id).catch((err) => {
          const cleanupErr = err instanceof Error ? err.message : String(err);
          logger.warn("[threadsHandler] failed to delete progress message after failure", {
            error: cleanupErr,
            progressMessageId: progress.message_id,
          });
        });
      }
    } finally {
      if (tempDir) {
        logger.debug("[threadsHandler] cleaning up temp directory", { tempDir });
        await temp.removePath(tempDir).catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn("[threadsHandler] failed to remove temp directory", {
            error: errMsg,
            tempDir,
          });
        });
      }
    }
  };
}
