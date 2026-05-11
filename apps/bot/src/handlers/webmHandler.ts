import type { BotContext } from "../context.ts";
import {
  DenoHttpDownloader,
  DenoTempFiles,
  FfmpegTranscoder,
} from "@integrations/mod.ts";
import { isExclusiveWebmUrl } from "@core/features/webm/detectWebm.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor } from "../logger.ts";
import { InputFile } from "npm:grammy@1.36.0";

function resolveUploadTimeoutMs(): number {
  const raw = Deno.env.get("WEBM_UPLOAD_TIMEOUT_MS");
  if (!raw) return 180_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 180_000;
  return Math.floor(parsed);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

export function createWebmHandler() {
  const downloader = new DenoHttpDownloader();
  const temp = new DenoTempFiles();
  const transcoder = new FfmpegTranscoder();
  const uploadTimeoutMs = resolveUploadTimeoutMs();

  return async function webmHandler(ctx: BotContext) {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!msg || typeof msg.text !== "string") return;

    const rawText = msg.text;
    const trimmedText = rawText.trim();
    const lower = rawText.toLowerCase();
    // For your test URL specifically (4cdn). This avoids flooding logs for
    // every text message while still proving whether this handler runs.
    const looksLike4cdnCandidate = lower.includes("4cdn.org");
    const looksLikeWebmCandidate = lower.includes(".webm");

    if (!tenant) {
      if (looksLike4cdnCandidate || looksLikeWebmCandidate) {
        const shortRaw =
          rawText.length > 300 ? `${rawText.slice(0, 297)}...` : rawText;
        logger.info("[webmHandler] candidate received but tenant missing", {
          shortRawText: shortRaw,
          looksLike4cdnCandidate,
          looksLikeWebmCandidate,
        });
      }
      return;
    }

    const url = isExclusiveWebmUrl(rawText);

    if (looksLike4cdnCandidate || looksLikeWebmCandidate) {
      const shortRaw =
        rawText.length > 300 ? `${rawText.slice(0, 297)}...` : rawText;
      const shortTrimmed =
        trimmedText.length > 300
          ? `${trimmedText.slice(0, 297)}...`
          : trimmedText;
      const exclusiveWebmMatched = url != null;
      const checksPassed =
        tenant.settings.featureFlags.webmConversion && exclusiveWebmMatched;
      logger.info("[webmHandler] incoming text (webm session)", {
        shortRawText: shortRaw,
        shortTrimmedText: shortTrimmed,
        exclusiveWebmMatch: url,
        featureFlagWebmConversion: tenant.settings.featureFlags.webmConversion,
        exclusiveWebmMatched,
        checksPassed,
      });
    }

    if (!tenant.settings.featureFlags.webmConversion) return;
    if (!url) return;

    logger.info("[webmHandler] WebM conversion triggered", {
      url,
      mode: tenant.settings.webmConversion.mode,
    });

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const tmpDir = await temp.createTempDir("nodobot-webm-");
    const inPath = `${tmpDir}/input.webm`;
    const outPath = `${tmpDir}/output.mp4`;
    let statusMessageId: number | null = null;
    const updateStatus = async (text: string) => {
      if (statusMessageId == null) return;
      await ctx.api
        .editMessageText(tenant.chatId, statusMessageId, text)
        .catch(() => {});
    };
    try {
      if (tenant.settings.webmConversion.deleteOriginalMessage) {
        logger.info("[webmHandler] step: delete original start", {
          originalMessageId: msg.message_id,
        });
        await ctx.api
          .deleteMessage(tenant.chatId, msg.message_id)
          .catch(() => {});
        logger.info("[webmHandler] step: delete original done");
      }

      logger.info("[webmHandler] step: status message start");
      const status = await ctx.api.sendMessage(
        tenant.chatId,
        "Converting WebM to MP4...",
      );
      statusMessageId = status.message_id;
      logger.info("[webmHandler] step: status message done", {
        statusMessageId,
      });

      await updateStatus("Converting WebM to MP4... (1/3 Downloading)");
      logger.info("[webmHandler] step: download start", {
        inPath,
        sourceUrl: url,
      });
      logger.debug("[webmHandler] downloading WebM to temp file", {
        inPath,
      });
      await downloader.downloadToFile(url, inPath);
      const inStat = await Deno.stat(inPath);
      logger.info("[webmHandler] step: download done", {
        inPath,
        sizeBytes: inStat.size,
      });

      await updateStatus("Converting WebM to MP4... (2/3 Converting)");
      logger.info("[webmHandler] step: transcode start", {
        inPath,
        outPath,
        mode: tenant.settings.webmConversion.mode,
      });
      await transcoder.webmToMp4(inPath, outPath, {
        crf: tenant.settings.webmConversion.crf,
        audioBitrateKbps: tenant.settings.webmConversion.audioBitrateKbps,
        ffmpegPreset: tenant.settings.webmConversion.ffmpegPreset,
      });
      logger.info("[webmHandler] step: transcode done", { outPath });

      logger.debug("[webmHandler] WebM transcoded to MP4", {
        outPath,
      });

      const outStat = await Deno.stat(outPath);
      logger.info("[webmHandler] prepared MP4 for upload", {
        outPath,
        sizeBytes: outStat.size,
      });

      const caption = renderTemplate(
        tenant.settings.webmConversion.postTemplate,
        { author },
      );
      await updateStatus("Converting WebM to MP4... (3/3 Uploading)");
      logger.info("[webmHandler] step: upload start", {
        filename: "converted.mp4",
        sizeBytes: outStat.size,
        timeoutMs: uploadTimeoutMs,
      });
      const prepareStartMs = Date.now();
      const inputFile = new InputFile(outPath, "converted.mp4");
      logger.info("[webmHandler] step: upload file prepared", {
        filename: "converted.mp4",
        sourcePath: outPath,
        elapsedMs: Date.now() - prepareStartMs,
      });

      const uploadStartMs = Date.now();
      await withTimeout(
        ctx.api.sendVideo(tenant.chatId, inputFile, {
          caption,
          parse_mode: "HTML",
        }),
        uploadTimeoutMs,
        "telegram sendVideo",
      );
      logger.info("[webmHandler] step: upload done", {
        elapsedMs: Date.now() - uploadStartMs,
      });
      if (statusMessageId != null) {
        logger.info("[webmHandler] step: status message cleanup start", {
          statusMessageId,
        });
        await ctx.api
          .deleteMessage(tenant.chatId, statusMessageId)
          .catch(() => {});
        logger.info("[webmHandler] step: status message cleanup done", {
          statusMessageId,
        });
        statusMessageId = null;
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      logger.error("[webmHandler] WebM conversion failed", {
        error: err,
        stack,
        inPath,
        outPath,
      });
      await ctx.api
        .sendMessage(tenant.chatId, `WebM conversion failed: ${err}`)
        .catch(() => {});
    } finally {
      if (statusMessageId != null) {
        logger.info(
          "[webmHandler] step: status message cleanup start (finally)",
          {
            statusMessageId,
          },
        );
        await ctx.api
          .deleteMessage(tenant.chatId, statusMessageId)
          .catch(() => {});
        logger.info(
          "[webmHandler] step: status message cleanup done (finally)",
          {
            statusMessageId,
          },
        );
      }
      logger.debug("[webmHandler] cleaning up temp directory", {
        tmpDir,
      });
      await temp.removePath(tmpDir);
    }
  };
}
