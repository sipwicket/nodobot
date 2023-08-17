import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';
import {
  addToLinkCache,
  buildLinkCacheItem,
  getLinkCache,
} from '../utils/index';

import config from '../../config.json';

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

    const linkCache = getLinkCache();
    const similarLink = linkCache.find(
      (cachedLink) => cachedLink.url === (youtubeIdCacheKey || entityUrl)
    );

    if (!similarLink) {
      addToLinkCache(
        buildLinkCacheItem((youtubeIdCacheKey || entityUrl), messageDate, authorFirstName)
      );

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
