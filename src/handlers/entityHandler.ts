import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';
import {
  addToLinkCache,
  buildLinkCacheItem,
  fixTiktokUrl,
  fixTwitterUrl,
  getLinkCache,
  getTiktokId,
  getTiktokUser,
  getTwitterId,
  getTwitterUser,
  getYoutubeId,
  tiktokUrlIsFixed,
  twitterUrlIsFixed,
  isExclusiveWebmUrl,
  convertWebmToMp4WithCleanup,
} from '../utils/index.ts';

import { config } from '../../index.ts';
import {
  fixInstagramUrl,
  getInstagramPathname,
  instagramUrlIsFixed,
} from '../utils/getInstagramId.ts';

type ReplyToLinkEntityParams = {
  ctx: MatchedContext<Context<Update>, 'text'>;
  author: string;
  date: number;
  messageId: number;
};
const replyToLinkEntity = ({
  ctx,
  author,
  date,
  messageId,
}: ReplyToLinkEntityParams) => {
  // build date for message
  const currentDate = new Date().getTime() / 1000;
  const timeDifference = currentDate - date;
  const timeDifferenceMinutes = (timeDifference / 60).toFixed(1);

  return ctx.reply(
    `${config.messages.foundLinkSentBy} ${author}, ${timeDifferenceMinutes} ${config.messages.minutesAgo}`,
    { reply_to_message_id: messageId }
  );
};

export const entityMessageHandler = async (
  ctx: MatchedContext<Context<Update>, 'text'>
) => {
  const {
    date: messageDate,

    from: { first_name: authorFirstName },
    message_id: messageId,
    entities,
  } = ctx.message;

  // Check if the message consists exclusively of a .webm URL
  const webmUrl = isExclusiveWebmUrl(ctx.message.text);
  if (webmUrl) {
    let cleanup: (() => Promise<void>) | null = null;
    try {
      console.log('Detected exclusive .webm URL, converting to mp4...');
      const result = await convertWebmToMp4WithCleanup(webmUrl);
      cleanup = result.cleanup;

      // Send the converted mp4 file
      await ctx.replyWithVideo(
        { source: result.buffer },
        {
          caption: `<b>${authorFirstName}</b> shared a video (converted from webm)`,
          parse_mode: 'HTML',
        }
      );

      // Delete the original message
      await ctx.deleteMessage(messageId);

      // Clean up temporary files after message is sent
      await cleanup();
      cleanup = null;

      console.log('Successfully converted and sent .webm as mp4');
      return;
    } catch (error) {
      console.error('Error converting webm to mp4:', error);

      // Clean up temporary files on error if they exist
      if (cleanup) {
        await cleanup().catch((err) => {
          console.error(
            'Failed to cleanup temporary files after error:',
            err.message
          );
        });
      }

      await ctx.reply(
        `Failed to convert webm video: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return;
    }
  }

  if (!entities || entities.length === 0) {
    return;
  }

  // check links for similarity, stop on the first cache hit
  entities.some(async (entity) => {
    if (entity.type !== 'url') {
      return false;
    }

    const { offset, length } = entity;
    const entityUrl = ctx.message.text.slice(offset, offset + length);

    const youtubeId = getYoutubeId(entityUrl);
    const youtubeIdCacheKey = youtubeId ? `YOUTUBE-${youtubeId}` : null;

    const twitterId = getTwitterId(entityUrl);
    const twitterIdCacheKey = twitterId ? `TWITTER-${twitterId}` : null;

    const tiktokId = getTiktokId(entityUrl);
    const tiktokIdCacheKey = tiktokId ? `TIKTOK-${tiktokId}` : null;

    const instagramId = getInstagramPathname(entityUrl);
    const instagramIdCacheKey = instagramId ? `INSTAGRAM-${instagramId}` : null;

    const linkCache = getLinkCache();
    const similarLink = linkCache.find(
      (cachedLink) =>
        cachedLink.url ===
        (twitterIdCacheKey ||
          youtubeIdCacheKey ||
          tiktokIdCacheKey ||
          instagramIdCacheKey ||
          entityUrl)
    );

    if (!similarLink) {
      addToLinkCache(
        buildLinkCacheItem(
          twitterIdCacheKey ||
            youtubeIdCacheKey ||
            tiktokIdCacheKey ||
            instagramIdCacheKey ||
            entityUrl,
          messageDate,
          authorFirstName
        )
      );

      const tgAuthor = ctx.message.from.first_name;
      const urlRemovedMessage = ctx.message.text.replace(entityUrl, '');
      const replyPrefix = `<b>${tgAuthor}</b> posted:\n${
        urlRemovedMessage?.length > 0 ? `<pre>${urlRemovedMessage}</pre>` : ''
      }`;

      // autofix twitter/x.com
      if (twitterId && !twitterUrlIsFixed(entityUrl)) {
        const tweetAuthor = getTwitterUser(entityUrl);
        if (!tweetAuthor) return;

        const fixedUrl = fixTwitterUrl(tweetAuthor, twitterId);

        try {
          ctx.reply(`${replyPrefix}${fixedUrl}`, {
            parse_mode: 'HTML',
          });

          ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          console.error('Done fucked up:', error);
          ctx.reply(`Sipchan done died: ${error}`);
        }
      }

      // autofix tiktok.com URLs
      if (tiktokId && !tiktokUrlIsFixed(entityUrl)) {
        const tiktokAuthor = getTiktokUser(entityUrl);
        if (!tiktokAuthor) return;

        const fixedUrl = fixTiktokUrl(tiktokAuthor, tiktokId);

        try {
          ctx.reply(`${replyPrefix}${fixedUrl}`, {
            parse_mode: 'HTML',
          });

          ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          console.error('Done fucked up:', error);
          ctx.reply(`Sipchan done died: ${error}`);
        }
      }

      // autofix instagram.com URLs
      if (instagramId && !instagramUrlIsFixed(entityUrl)) {
        const fixedUrl = fixInstagramUrl(instagramId);

        try {
          ctx.reply(`${replyPrefix}${fixedUrl}`, {
            parse_mode: 'HTML',
          });

          ctx.deleteMessage(ctx.message.message_id);
        } catch (error) {
          console.error('Done fucked up:', error);
          ctx.reply(`Sipchan done died: ${error}`);
        }
      }

      return false;
    }

    const {
      metadata: { date, author },
    } = similarLink;

    await replyToLinkEntity({
      ctx,
      author: author,
      date: date,
      messageId: messageId,
    });

    return true;
  });
};
