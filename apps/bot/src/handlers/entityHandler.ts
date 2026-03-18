import type { BotContext } from "../context.ts";
import { extractUrlsFromEntities } from "@core/features/link/urlExtract.ts";
import {
  fixInstagramUrl,
  fixTiktokUrl,
  fixTwitterUrl,
  getInstagramPathname,
  getTiktokId,
  getTiktokUser,
  getTwitterId,
  getTwitterUser,
  instagramUrlIsFixed,
  tiktokUrlIsFixed,
  twitterUrlIsFixed,
} from "@core/features/link/normalizers.ts";
import { checkAndStoreLink } from "@core/features/link/duplicateLinks.ts";
import type { LinkCachePort } from "@core/contracts/cachePorts.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";

export function createEntityHandler(deps: { linkCache: LinkCachePort }) {
  return async function entityHandler(ctx: BotContext) {
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg || typeof msg.text !== "string") return;

    const entities = msg.entities ?? [];
    const urls = extractUrlsFromEntities(msg.text, entities as any);
    if (urls.length === 0) return;

    const author = msg.from?.first_name ?? msg.from?.username ?? "Someone";
    const dateMs = (msg.date ?? Math.floor(Date.now() / 1000)) * 1000;

    // Duplicate detection applies to all URLs.
    if (tenant.settings.featureFlags.duplicateLinks) {
      for (const url of urls) {
        const dup = await checkAndStoreLink({
          tenantId: tenant.tenantId,
          url,
          author,
          dateMs,
          cache: deps.linkCache,
          cacheSize: tenant.settings.duplicateLinks.cacheSize,
        });
        if (dup) {
          const agoMin = (Date.now() - dup.duplicateOf.dateMs) / 60000;
          const text = renderTemplate(tenant.settings.duplicateLinks.responseTemplate, {
            author: dup.duplicateOf.author,
            ago: `${agoMin.toFixed(1)} minutes ago`,
          });
          await ctx.reply(text, { reply_to_message_id: msg.message_id });
        }
      }
    }

    // Embed fixers: if message contains a single URL, we rewrite and delete original.
    // This mirrors legacy behavior where fixer is a primary action for those platforms.
    if (urls.length !== 1) return;
    const url = urls[0];

    // Twitter
    if (tenant.settings.featureFlags.twitterFix && getTwitterId(url) && !twitterUrlIsFixed(url)) {
      const user = getTwitterUser(url);
      const id = getTwitterId(url);
      if (user && id) {
        const fixed = fixTwitterUrl(user, id, tenant.settings.twitterFix.fixerDomain);
        const text = renderTemplate(tenant.settings.twitterFix.postTemplate, { author, url: fixed });
        await ctx.api.sendMessage(tenant.chatId, text, { parse_mode: "HTML", disable_web_page_preview: false });
        if (tenant.settings.twitterFix.deleteOriginalMessage) {
          await ctx.api.deleteMessage(tenant.chatId, msg.message_id);
        }
      }
      return;
    }

    // TikTok
    if (tenant.settings.featureFlags.tiktokFix && getTiktokId(url) && !tiktokUrlIsFixed(url)) {
      const user = getTiktokUser(url);
      const id = getTiktokId(url);
      if (user && id) {
        const fixed = fixTiktokUrl(user, id, tenant.settings.tiktokFix.fixerDomain);
        const text = renderTemplate(tenant.settings.tiktokFix.postTemplate, { author, url: fixed });
        await ctx.api.sendMessage(tenant.chatId, text, { parse_mode: "HTML", disable_web_page_preview: false });
        if (tenant.settings.tiktokFix.deleteOriginalMessage) {
          await ctx.api.deleteMessage(tenant.chatId, msg.message_id);
        }
      }
      return;
    }

    // Instagram fallback fixer (native download handler will supersede later).
    if (
      tenant.settings.featureFlags.instagramFallbackFix &&
      getInstagramPathname(url) &&
      !instagramUrlIsFixed(url)
    ) {
      const pathname = getInstagramPathname(url);
      if (pathname) {
        const fixed = fixInstagramUrl(pathname, tenant.settings.instagram.fallbackFixDomain);
        const text = renderTemplate(tenant.settings.instagram.postTemplate, { author, count: "0" })
          .replace("Instagram media (0 items)", fixed);
        await ctx.api.sendMessage(tenant.chatId, `<b>${author}</b> posted:\n${fixed}`, {
          parse_mode: "HTML",
          disable_web_page_preview: false,
        });
        if (tenant.settings.instagram.deleteOriginalMessage) {
          await ctx.api.deleteMessage(tenant.chatId, msg.message_id);
        }
      }
      return;
    }
  };
}

