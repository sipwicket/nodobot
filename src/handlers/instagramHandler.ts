import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';
import { downloadToBuffer } from '../utils/downloadToBuffer';
import { getBlobMedia } from '../utils/instagramApi';
import { extractMediaUrls } from '../utils/instagramMedia';
import { extractShortcode } from '../utils/getInstagramId';

/**
 * instagramMediaHandler
 * @description Download and send Instagram media (posts/reels) to Telegram.
 *
 * @param  {MatchedContext}  ctx - Telegram context
 * @param  {string}  pathname - Instagram URL pathname
 * @param  {string}  originalUrl - Original Instagram URL
 * @return {Promise<void>}
 */
export async function instagramMediaHandler(
  ctx: MatchedContext<Context<Update>, 'text'>,
  pathname: string,
  originalUrl: string
): Promise<void> {
  try {
    // Extract shortcode from pathname
    const shortcode = extractShortcode(pathname);
    if (!shortcode) {
      throw new Error('Invalid Instagram URL: Could not extract shortcode');
    }

    // Get cookies from environment variable
    const cookies = process.env.INSTAGRAM_COOKIES;

    // Fetch media data from Instagram API
    const result = await getBlobMedia(shortcode, cookies);

    // Extract media URLs from response
    const mediaItems = extractMediaUrls(result);

    if (mediaItems.length === 0) {
      throw new Error('No media found in Instagram post/reel');
    }

    // Download all media items to buffers
    const mediaBuffers: Array<{ buffer: Buffer; type: 'video' | 'image' }> = [];
    for (const item of mediaItems) {
      try {
        const buffer = await downloadToBuffer(item.url);
        mediaBuffers.push({ buffer, type: item.type });
      } catch (error) {
        console.error(`Error downloading media item ${item.index}:`, error);
        // Continue with other items even if one fails
      }
    }

    if (mediaBuffers.length === 0) {
      throw new Error('Failed to download any media items');
    }

    // Telegram media groups have a limit of 10 items
    const MAX_MEDIA_GROUP_SIZE = 10;
    const mediaGroups: Array<Array<{ buffer: Buffer; type: 'video' | 'image' }>> = [];

    // Split into groups of 10 if needed
    for (let i = 0; i < mediaBuffers.length; i += MAX_MEDIA_GROUP_SIZE) {
      mediaGroups.push(mediaBuffers.slice(i, i + MAX_MEDIA_GROUP_SIZE));
    }

    // Send each media group
    for (let groupIndex = 0; groupIndex < mediaGroups.length; groupIndex++) {
      const group = mediaGroups[groupIndex];
      const mediaGroup = group.map((item, index) => {
        const isFirstInGroup = index === 0;
        const isFirstGroup = groupIndex === 0;
        const globalIndex = groupIndex * MAX_MEDIA_GROUP_SIZE + index + 1;

        if (item.type === 'video') {
          return {
            type: 'video' as const,
            media: { source: item.buffer },
            caption:
              isFirstInGroup && isFirstGroup
                ? mediaItems.length > 1
                  ? `Instagram media (${mediaItems.length} items)`
                  : 'Instagram video'
                : undefined,
          };
        } else {
          return {
            type: 'photo' as const,
            media: { source: item.buffer },
            caption:
              isFirstInGroup && isFirstGroup
                ? mediaItems.length > 1
                  ? `Instagram media (${mediaItems.length} items)`
                  : 'Instagram photo'
                : undefined,
          };
        }
      });

      try {
        await ctx.replyWithMediaGroup(mediaGroup);
        // Small delay between groups to avoid rate limiting
        if (groupIndex < mediaGroups.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error sending media group ${groupIndex + 1}:`, error);
        // Fallback: send items individually if media group fails
        for (const item of group) {
          try {
            if (item.type === 'video') {
              await ctx.replyWithVideo({ source: item.buffer });
            } else {
              await ctx.replyWithPhoto({ source: item.buffer });
            }
          } catch (fallbackError) {
            console.error('Error in fallback send:', fallbackError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Instagram media handler error:', error);
    throw error; // Re-throw to let caller handle fallback
  }
}
