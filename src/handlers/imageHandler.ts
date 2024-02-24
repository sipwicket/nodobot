import { Context, Telegraf } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { config } from '../../index.ts';
import { MatchedContext } from '../types.ts';
import ago from 's-ago';
import {
  addToImageCache,
  bufferFromCachedImage,
  buildImageCacheItem,
  downloadToBuffer,
  getImageCache,
  getImageDimensions,
  resizeImage,
  generateHash,
} from '../utils/index.ts';

const downloadImageToHash = async (url: string) => {
  const imageBuffer = await downloadToBuffer(url);

  return await generateHash(new Uint8Array(Buffer.from(imageBuffer)));
};

const getImageSimilarity = (
  hash: string
): {
  index: number;
} => {
  const imageCache = getImageCache();

  const results = {
    index: -1,
  };

  imageCache.some((cachedImage, idx) => {
    const identicalHash = cachedImage.hash === hash;

    if (identicalHash) {
      results.index = idx;
      return true;
    }

    return false;
  });

  return results;
};

type ReplyWithPhotoParams = {
  ctx: MatchedContext<Context<Update>, 'photo'>;
  author: string;
  date: number;
  messageId: number;
};

const replyWithPhoto = ({
  ctx,
  author,
  date,
  messageId,
}: ReplyWithPhotoParams) => {
  return ctx.replyWithPhoto('https://i.imgur.com/dkM7RqX.png', {
    caption: `${config.messages.foundImageSentBy} ${author}, ${ago(date)}.`,
    reply_to_message_id: messageId,
    parse_mode: 'Markdown',
  });
};

export const photoMessageHandler = async (
  ctx: MatchedContext<Context<Update>, 'photo'>,
  bot: Telegraf<Context<Update>>
) => {
  const {
    date: messageDate,
    from: { first_name: authorFirstName },
    message_id: messageId,
    photo: messagePhoto,
  } = ctx.message;

  const photoId = messagePhoto?.[0]?.file_id;
  if (!photoId) {
    return;
  }

  const fileLink = await bot.telegram.getFileLink(photoId);
  if (!fileLink?.href) {
    return;
  }

  const imageHash = await downloadImageToHash(fileLink.href);

  if (!imageHash) {
    return;
  }

  const { index: similarImageIndex } = getImageSimilarity(imageHash); // -1 if none found

  if (similarImageIndex === -1) {
    return addToImageCache(
      buildImageCacheItem(imageHash, messageDate, authorFirstName)
    );
  }

  const imageCache = getImageCache();
  const {
    metadata: { date, author },
  } = imageCache[similarImageIndex];

  return await replyWithPhoto({
    ctx: ctx,
    author: author,
    date: date,
    messageId: messageId,
  });
};
