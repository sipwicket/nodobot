import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';
import { downloadToBuffer } from '../utils/downloadToBuffer.ts';
import { getBlobMedia } from '../utils/instagramApi.ts';
import { extractMediaUrls } from '../utils/instagramMedia.ts';
import { extractShortcode } from '../utils/getInstagramId.ts';
import { generateProgressBar } from '../utils/progressBar.ts';

/**
 * instagramMediaHandler
 * @description Download and send Instagram media (posts/reels) to Telegram.
 *
 * @param  {MatchedContext}  ctx - Telegram context
 * @param  {string}  pathname - Instagram URL pathname
 * @param  {string}  originalUrl - Original Instagram URL
 * @param  {string}  author - Name of the original message sender
 * @return {Promise<void>}
 */
export async function instagramMediaHandler(
  ctx: MatchedContext<Context<Update>, 'text'>,
  pathname: string,
  originalUrl: string,
  author: string
): Promise<void> {
  let progressMessage: any = null;
  
  try {
    console.log(`[Instagram Handler] Starting media handler for pathname: ${pathname}, originalUrl: ${originalUrl}`);
    
    // Extract shortcode from pathname
    const shortcode = extractShortcode(pathname);
    if (!shortcode) {
      console.error(`[Instagram Handler] Failed to extract shortcode from pathname: ${pathname}`);
      throw new Error('Invalid Instagram URL: Could not extract shortcode');
    }

    console.log(`[Instagram Handler] Extracted shortcode: ${shortcode}`);

    // Send initial progress message
    progressMessage = await ctx.reply('Fetching Instagram media...\n' + generateProgressBar(0, 1));

    // Get cookies from environment variable
    const cookies = process.env.INSTAGRAM_COOKIES;
    console.log(`[Instagram Handler] Cookies ${cookies ? 'available' : 'not available'} for shortcode: ${shortcode}`);

    // Fetch media data from Instagram API
    console.log(`[Instagram Handler] Calling getBlobMedia for shortcode: ${shortcode}`);
    const apiStartTime = Date.now();
    
    // Create status callback to update progress message
    const statusCallback = async (message: string) => {
      if (progressMessage) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            progressMessage.message_id,
            undefined,
            `${message}\n${generateProgressBar(0, 1)}`
          );
        } catch (error) {
          console.error('Failed to update status message:', error);
        }
      }
    };
    
    const result = await getBlobMedia(shortcode, cookies, statusCallback);
    const apiDuration = Date.now() - apiStartTime;
    console.log(`[Instagram Handler] getBlobMedia completed in ${apiDuration}ms, result type: ${result.type}`);

    // Extract media URLs from response
    console.log(`[Instagram Handler] Extracting media URLs from result for shortcode: ${shortcode}`);
    const mediaItems = extractMediaUrls(result);
    console.log(`[Instagram Handler] Extracted ${mediaItems.length} media item(s) for shortcode: ${shortcode}`);

    if (mediaItems.length === 0) {
      console.error(`[Instagram Handler] No media items found for shortcode: ${shortcode}`);
      throw new Error('No media found in Instagram post/reel');
    }

    // Update progress message
    if (progressMessage) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMessage.message_id,
        undefined,
        `Downloading ${mediaItems.length} media item${mediaItems.length > 1 ? 's' : ''}...\n${generateProgressBar(0, mediaItems.length)}`
      );
    }

    // Download all media items to buffers
    const mediaBuffers: Array<{ buffer: Buffer; type: 'video' | 'image' }> = [];
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      try {
        // Update progress for each item
        if (progressMessage) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            progressMessage.message_id,
            undefined,
            `Downloading ${i + 1}/${mediaItems.length}...\n${generateProgressBar(i + 1, mediaItems.length)}`
          );
        }
        
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

    // Update progress message
    if (progressMessage) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMessage.message_id,
        undefined,
        `Sending to Telegram...\n${generateProgressBar(mediaBuffers.length, mediaBuffers.length)}`
      );
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
      // Update progress for each group
      if (progressMessage) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          progressMessage.message_id,
          undefined,
          `Sending group ${groupIndex + 1}/${mediaGroups.length}...\n${generateProgressBar(groupIndex + 1, mediaGroups.length)}`
        );
      }
      const group = mediaGroups[groupIndex];
      // Calculate how many items have been sent so far (including this group)
      const itemsSentSoFar = groupIndex * MAX_MEDIA_GROUP_SIZE + group.length;
      const mediaGroup = group.map((item, index) => {
        const isFirstInGroup = index === 0;
        const isFirstGroup = groupIndex === 0;
        const globalIndex = groupIndex * MAX_MEDIA_GROUP_SIZE + index + 1;

        if (item.type === 'video') {
          const caption = isFirstInGroup
            ? isFirstGroup
              ? mediaItems.length > 1
                ? `<b>${author}</b> posted:\nInstagram media (${mediaItems.length} items)`
                : `<b>${author}</b> posted:\nInstagram video`
              : `<b>${author}</b> posted:\nInstagram media (${mediaItems.length} items) - ${itemsSentSoFar}/${mediaItems.length}`
            : undefined;
          
          return {
            type: 'video' as const,
            media: { source: item.buffer },
            ...(caption && { caption, parse_mode: 'HTML' }),
          };
        } else {
          const caption = isFirstInGroup
            ? isFirstGroup
              ? mediaItems.length > 1
                ? `<b>${author}</b> posted:\nInstagram media (${mediaItems.length} items)`
                : `<b>${author}</b> posted:\nInstagram photo`
              : `<b>${author}</b> posted:\nInstagram media (${mediaItems.length} items) - ${itemsSentSoFar}/${mediaItems.length}`
            : undefined;
          
          return {
            type: 'photo' as const,
            media: { source: item.buffer },
            ...(caption && { caption, parse_mode: 'HTML' }),
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
              await ctx.replyWithVideo(
                { source: item.buffer },
                {
                  caption: `<b>${author}</b> posted:\nInstagram video`,
                  parse_mode: 'HTML',
                }
              );
            } else {
              await ctx.replyWithPhoto(
                { source: item.buffer },
                {
                  caption: `<b>${author}</b> posted:\nInstagram photo`,
                  parse_mode: 'HTML',
                }
              );
            }
          } catch (fallbackError) {
            console.error('Error in fallback send:', fallbackError);
          }
        }
      }
    }

    // Delete progress message when done
    if (progressMessage) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, progressMessage.message_id);
      } catch (error) {
        console.error('Failed to delete progress message:', error);
        // Non-critical error, continue
      }
    }
  } catch (error) {
    // Delete progress message on error
    if (progressMessage) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, progressMessage.message_id);
      } catch (deleteError) {
        console.error('Failed to delete progress message:', deleteError);
      }
    }
    console.error('Instagram media handler error:', error);
    throw error; // Re-throw to let caller handle fallback
  }
}
