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
  getImageCache,
  resizeImage,
} from '../utils/index';
import { MatchedContext } from '../types';

import config from '../../config.json';

const MIN_MATCHED_PIXELS_THRESHOLD = 100;

const downloadAndResizeImage = async (url: string) => {
  const imageBuffer = await downloadToBuffer(url);

  return await resizeImage(imageBuffer);
};

const getImageSimilarity = (resizedImageObject: {
  data: Buffer;
  info: sharp.OutputInfo;
}): {
  index: number;
  numOfPixels: number;
} => {
  const imageCache = getImageCache();

  const results = {
    index: -1,
    numOfPixels: -1,
  };

  imageCache.some((cachedImage, idx) => {
    const comparison = compareImages(
      resizedImageObject.data,
      cachedImage.buffer
    );

    if (comparison <= MIN_MATCHED_PIXELS_THRESHOLD) {
      results.index = idx;
      results.numOfPixels = comparison;
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
  numOfPixels: number;
};
const replyWithPhoto = ({
  ctx,
  imageBuffer,
  author,
  date,
  messageId,
  numOfPixels,
}: ReplyWithPhotoParams) => {
  // build date for message
  const currentDate = new Date().getTime() / 1000;
  const timeDifference = currentDate - date;
  const timeDifferenceMinutes = (timeDifference / 60).toFixed(1);

  return ctx.replyWithPhoto(
    {
      source: imageBuffer,
    },
    {
      caption: `${config.messages.foundImageSentBy} ${author}, ${timeDifferenceMinutes} ${config.messages.minutesAgo}.
${config.messages.similarPixels} ${numOfPixels}/900. ${config.messages.similarityThreshold} ${MIN_MATCHED_PIXELS_THRESHOLD}.`,
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
  const { index: similarImageIndex, numOfPixels } =
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
    numOfPixels,
  });
};
