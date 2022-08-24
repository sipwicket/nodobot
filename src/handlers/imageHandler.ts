import sharp from 'sharp';
import { Markup } from 'telegraf';
import { Context, Telegraf } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import {
  addToImageCache,
  bufferFromCachedImage,
  buildImageCacheItem,
  compareImages,
  downloadToBuffer,
  getComparisonSetting,
  getImageCache,
  getImageDimensions,
  resizeImage,
} from '../utils/index';
import { MatchedContext } from '../types';

import config from '../../config.json';

const downloadAndResizeImage = async (url: string) => {
  const imageBuffer = await downloadToBuffer(url);

  return await resizeImage(imageBuffer);
};

const getImageSimilarity = (resizedImageObject: {
  data: Buffer;
  info: sharp.OutputInfo;
}): {
  index: number;
  uniquePixels: number;
} => {
  const imageCache = getImageCache();
  const minNumberSimilarPixels = getComparisonSetting('similarNumPixels');

  const results = {
    index: -1,
    uniquePixels: -1,
  };

  imageCache.some((cachedImage, idx) => {
    const comparison = compareImages(
      resizedImageObject.data,
      cachedImage.buffer
    );

    if (comparison <= minNumberSimilarPixels) {
      results.index = idx;
      results.uniquePixels = comparison;
      return true;
    }

    return false;
  });

  return results;
};

type ReplyWithPhotoParams = {
  ctx: MatchedContext<Context<Update>, 'photo'>;
  imageBuffer: Buffer;
  author: string;
  date: number;
  messageId: number;
  uniquePixels: number;
};
const replyWithPhoto = ({
  ctx,
  imageBuffer,
  author,
  date,
  messageId,
  uniquePixels,
}: ReplyWithPhotoParams) => {
  // build date for message
  const currentDate = new Date().getTime() / 1000;
  const timeDifference = currentDate - date;
  const timeDifferenceMinutes = (timeDifference / 60).toFixed(1);
  const { x: sizeX, y: sizeY } = getImageDimensions();
  const totalPixels = sizeX * sizeY;
  const minNumberSimilarPixels = getComparisonSetting('similarNumPixels');

  return ctx.replyWithPhoto(
    {
      source: imageBuffer,
    },
    {
      caption: `${config.messages.foundImageSentBy} ${author}, ${timeDifferenceMinutes} ${config.messages.minutesAgo}.
${config.messages.similarPixels} ${uniquePixels}/${totalPixels}. ${config.messages.similarityThreshold} ${minNumberSimilarPixels}.`,
      reply_to_message_id: messageId,
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback(
          config.messages.reduceSensitivityBtn,
          config.messages.reduceSensitivityAction
        ),
      ]),
    }
  );
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

  const resizedImageObject = await downloadAndResizeImage(fileLink.href);
  const { index: similarImageIndex, uniquePixels } =
    getImageSimilarity(resizedImageObject); // -1 if none found

  if (similarImageIndex === -1) {
    return addToImageCache(
      buildImageCacheItem(resizedImageObject, messageDate, authorFirstName)
    );
  }

  const imageCache = getImageCache();
  const {
    metadata: { date, author },
  } = imageCache[similarImageIndex];

  // send the thumbnail in the reply, build buffer from raw cached image
  const cachedImageThumbnailBuffer = await bufferFromCachedImage(
    imageCache[similarImageIndex]
  );

  return await replyWithPhoto({
    ctx: ctx,
    imageBuffer: cachedImageThumbnailBuffer,
    author: author,
    date: date,
    messageId: messageId,
    uniquePixels,
  });
};
