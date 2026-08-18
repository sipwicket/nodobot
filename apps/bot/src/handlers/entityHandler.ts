import { GrammyError } from "npm:grammy@1.36.0";
import type { BotContext } from "../context.ts";
import { extractUrlsFromEntities } from "@core/features/link/urlExtract.ts";
import {
  fixInstagramUrl,
  fixTiktokUrl,
  fixTwitterUrl,
  getInstagramPathname,
  getThreadsPathname,
  getTiktokId,
  getTiktokUser,
  getTwitterId,
  getTwitterUser,
  instagramUrlIsFixed,
  tiktokUrlIsFixed,
  twitterUrlIsFixed,
} from "@core/features/link/normalizers.ts";
import { checkAndStoreLink, findDuplicateLink } from "@core/features/link/duplicateLinks.ts";
import type { LinkCachePort } from "@core/contracts/cachePorts.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor, type TenantAwareLogger } from "../logger.ts";

async function deleteOriginalIfPossible(
  ctx: BotContext,
  logger: TenantAwareLogger,
  chatId: string,
  originalMessageId: number,
  deleteMessage: (chatId: string, messageId: number) => Promise<unknown>,
): Promise<void> {
  try {
    await deleteMessage(chatId, originalMessageId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[entityHandler] deleteMessage failed; original left in chat", {
      chatId,
      messageId: originalMessageId,
      error: message,
    });

    const isDeleteFailure =
      err instanceof GrammyError &&
      err.method === "deleteMessage" &&
      err.error_code === 400 &&
      err.description.toLowerCase().includes("can't be deleted");

    if (!isDeleteFailure) return;

    let botUserId: number;
    try {
      botUserId = (await ctx.api.getMe()).id;
    } catch {
      return;
    }

    let canDelete: boolean | undefined;
    try {
      const member = await ctx.api.getChatMember(chatId, botUserId);
      if (member.status === "creator") canDelete = true;
      else if (member.status === "administrator") canDelete = member.can_delete_messages === true;
      else canDelete = false;
    } catch {
      return;
    }

    if (canDelete !== false) return;

    const hint =
      "I couldn’t delete the original message. Make me a group admin and turn on <b>Delete messages</b> so I can remove the raw link after posting the fixed version.";

    await ctx.api
      .sendMessage(chatId, hint, {
        parse_mode: "HTML",
        reply_parameters: { message_id: originalMessageId },
      })
      .catch((sendErr: unknown) => {
        logger.warn("[entityHandler] failed to send delete-permissions hint", {
          error: sendErr instanceof Error ? sendErr.message : String(sendErr),
        });
      });
  }
}

function isNativeDownloadCandidate(
  tenant: NonNullable<BotContext["tenant"]>,
  url: string,
): boolean {
  const flags = tenant.settings.featureFlags;
  if (
    flags.instagramDownload &&
    tenant.settings.instagram.preferNativeDownload &&
    getInstagramPathname(url)
  ) {
    return true;
  }
  if (
    flags.threadsDownload &&
    tenant.settings.threads.preferNativeDownload &&
    getThreadsPathname(url)
  ) {
    return true;
  }
  return false;
}

export function createEntityHandler(deps: { linkCache: LinkCachePort }) {
  return async function entityHandler(ctx: BotContext) {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg || typeof msg.text !== 'string') return;

    const entities = msg.entities ?? [];
    const urls = extractUrlsFromEntities(msg.text, entities as any);
    if (urls.length === 0) return;

    // Lightweight info-level logging for your `.webm` debugging session.
    // This confirms whether Telegram entities give us any `.webm` URLs.
    const lowerText = msg.text.toLowerCase();
    const looksLikeWebm =
      lowerText.includes('.webm') ||
      urls.some(u => u.toLowerCase().includes('.webm'));
    if (looksLikeWebm) {
      const shortRawText =
        msg.text.length > 300 ? `${msg.text.slice(0, 297)}...` : msg.text;
      logger.info('[entityHandler] extracted URLs (.webm session)', {
        shortRawText,
        urls,
      });
    }

    logger.debug('[entityHandler] URLs detected in message', {
      urlCount: urls.length,
      features: {
        duplicateLinks: tenant.settings.featureFlags.duplicateLinks,
        twitterFix: tenant.settings.featureFlags.twitterFix,
        tiktokFix: tenant.settings.featureFlags.tiktokFix,
        instagramFallbackFix: tenant.settings.featureFlags.instagramFallbackFix,
      },
    });

    const author = msg.from?.first_name ?? msg.from?.username ?? 'Someone';
    const dateMs = (msg.date ?? Math.floor(Date.now() / 1000)) * 1000;

    // Duplicate detection applies to all URLs.
    // Native Instagram/Threads downloads store the link only after media is actually sent,
    // so a failed download (rate limit, gallery-dl error, etc.) can be retried.
    if (tenant.settings.featureFlags.duplicateLinks) {
      logger.debug(
        '[entityHandler] duplicateLinks feature enabled, checking cache',
        {
          urlCount: urls.length,
        },
      );
      const deferStore = urls.length === 1 && isNativeDownloadCandidate(tenant, urls[0]);
      for (const url of urls) {
        const dup = deferStore
          ? await findDuplicateLink({
            tenantId: tenant.tenantId,
            url,
            cache: deps.linkCache,
          })
          : await checkAndStoreLink({
            tenantId: tenant.tenantId,
            url,
            author,
            dateMs,
            cache: deps.linkCache,
            cacheSize: tenant.settings.duplicateLinks.cacheSize,
          });
        if (dup) {
          logger.info('[entityHandler] duplicate link detected', {
            url,
            originalAuthor: dup.duplicateOf.author,
            originalDateMs: dup.duplicateOf.dateMs,
          });
          const agoMin = (Date.now() - dup.duplicateOf.dateMs) / 60000;
          const text = renderTemplate(
            tenant.settings.duplicateLinks.responseTemplate,
            {
              author: dup.duplicateOf.author,
              ago: `${agoMin.toFixed(1)} minutes ago`,
            },
          );
          await ctx.reply(text, { reply_to_message_id: msg.message_id });
        }
      }
    }

    // Embed fixers: if message contains a single URL, we rewrite and delete original.
    // This mirrors legacy behavior where fixer is a primary action for those platforms.
    if (urls.length !== 1) return;
    const url = urls[0];

    // Twitter
    if (
      tenant.settings.featureFlags.twitterFix &&
      getTwitterId(url) &&
      !twitterUrlIsFixed(url)
    ) {
      const user = getTwitterUser(url);
      const id = getTwitterId(url);
      if (user && id) {
        logger.info('[entityHandler] applying Twitter fixer', {
          url,
          user,
          id,
        });
        const fixed = fixTwitterUrl(
          user,
          id,
          tenant.settings.twitterFix.fixerDomain,
        );
        const text = renderTemplate(tenant.settings.twitterFix.postTemplate, {
          author,
          url: fixed,
        });
        await ctx.api.sendMessage(tenant.chatId, text, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: false },
        });
        if (tenant.settings.twitterFix.deleteOriginalMessage) {
          await deleteOriginalIfPossible(
            ctx,
            logger,
            tenant.chatId,
            msg.message_id,
            (c, m) => ctx.api.deleteMessage(c, m),
          );
        }
      }
      return;
    }

    // TikTok
    if (
      tenant.settings.featureFlags.tiktokFix &&
      getTiktokId(url) &&
      !tiktokUrlIsFixed(url)
    ) {
      const user = getTiktokUser(url);
      const id = getTiktokId(url);
      if (user && id) {
        logger.info('[entityHandler] applying TikTok fixer', {
          url,
          user,
          id,
        });
        const fixed = fixTiktokUrl(
          user,
          id,
          tenant.settings.tiktokFix.fixerDomain,
        );
        const text = renderTemplate(tenant.settings.tiktokFix.postTemplate, {
          author,
          url: fixed,
        });
        await ctx.api.sendMessage(tenant.chatId, text, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: false },
        });
        if (tenant.settings.tiktokFix.deleteOriginalMessage) {
          await deleteOriginalIfPossible(
            ctx,
            logger,
            tenant.chatId,
            msg.message_id,
            (c, m) => ctx.api.deleteMessage(c, m),
          );
        }
      }
      return;
    }

    // Instagram kksave link: only when native download is off (or not preferred).
    // If native download runs, instagramHandler posts the fixer only after a failed download.
    const instagramNativeFirst =
      tenant.settings.featureFlags.instagramDownload &&
      tenant.settings.instagram.preferNativeDownload;
    if (
      !instagramNativeFirst &&
      tenant.settings.featureFlags.instagramFallbackFix &&
      getInstagramPathname(url) &&
      !instagramUrlIsFixed(url)
    ) {
      const pathname = getInstagramPathname(url);
      if (pathname) {
        logger.info('[entityHandler] applying Instagram fallback fixer', {
          url,
          pathname,
        });
        const fixed = fixInstagramUrl(
          pathname,
          tenant.settings.instagram.fallbackFixDomain,
        );
        const text = renderTemplate(tenant.settings.instagram.postTemplate, {
          author,
          count: '0',
        }).replace('Instagram media (0 items)', fixed);
        await ctx.api.sendMessage(
          tenant.chatId,
          `<b>${author}</b> posted:\n${fixed}`,
          {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: false },
          },
        );
        if (tenant.settings.instagram.deleteOriginalMessage) {
          await deleteOriginalIfPossible(
            ctx,
            logger,
            tenant.chatId,
            msg.message_id,
            (c, m) => ctx.api.deleteMessage(c, m),
          );
        }
      }
      return;
    }
  };
}

