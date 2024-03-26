import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';
import {
  addToLinkCache,
  buildLinkCacheItem,
  fixTwitterUrl,
  getLinkCache,
  getTwitterId,
  getTwitterUser,
  getYoutubeId,
  twitterUrlIsFixed,
  getTiktokId,
  getTiktokUser,
  tiktokUrlIsFixed,
} from '../utils/index.ts';

import config from '../../config.json' assert { type: 'json' };
import { bot } from '../../index.ts';

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

    const linkCache = getLinkCache();
    const similarLink = linkCache.find(
      (cachedLink) => cachedLink.url === (twitterIdCacheKey || youtubeIdCacheKey || tiktokIdCacheKey || entityUrl)
    );

    if (!similarLink) {
      addToLinkCache(
        buildLinkCacheItem(
          twitterIdCacheKey || youtubeIdCacheKey || tiktokIdCacheKey || entityUrl,
          messageDate,
          authorFirstName
        )
      );

      // autofix twitter/x.com and tiktok.com URLs     
      if ((twitterId && !twitterUrlIsFixed(entityUrl)) || (tiktokId && !tiktokUrlIsFixed(entityUrl))) {
        const tweetAuthor = getTwitterUser(entityUrl)
        const tiktokAuthor = getTiktokUser(entityUrl)
        
        if (!tweetAuthor) {
          return
        } else if (!tiktokAuthor) {
          return
        }
        
        const fixedUrl = twitterId ? fixTwitterUrl(tweetAuthor, twitterId) : fixTiktokUrl(tiktokAuthor, tiktokId);

        const tgAuthor = ctx.message.from.first_name

        const urlRemovedMessage = ctx.message.text.replace(entityUrl, '')

        const replyPrefix = `<b>${tgAuthor}</b> posted:\n\n${urlRemovedMessage?.length > 0 ? `<pre>${urlRemovedMessage}</pre>` : ''}`

        try {
          ctx.reply(`${replyPrefix}${fixedUrl}`, {
            parse_mode: 'HTML'
          })

          ctx.deleteMessage(ctx.message.message_id)
        } catch (error) {
          console.error('Done fucked up:', error);

          ctx.reply(`Sipchan done died: ${error}`)
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
