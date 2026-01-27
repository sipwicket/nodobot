import { Context } from 'telegraf/typings';
import { Update } from 'telegraf/typings/core/types/typegram';
import { MatchedContext } from '../types';
import { downloadToFile } from '../utils/downloadToBuffer.ts';
import { getBlobMedia } from '../utils/instagramApi.ts';
import { extractMediaUrls } from '../utils/instagramMedia.ts';
import { extractShortcode } from '../utils/getInstagramId.ts';
import { generateProgressBar } from '../utils/progressBar.ts';

type GroupItem = {
  filePath: string;
  type: 'video' | 'image';
  cleanup: () => Promise<void>;
};

/**
 * sendMediaGroupWithRetry
 * @description Send a media group with retry logic to ensure items are always grouped.
 * 
 * @param  {MatchedContext}  ctx - Telegram context
 * @param  {GroupItem[]}  currentGroup - Items to send as a group
 * @param  {number}  totalItems - Total number of items in the Instagram post
 * @param  {string}  author - Name of the original message sender
 * @param  {number}  itemsSent - Number of items already sent
 * @return {Promise<number>} Number of items sent in this group
 */
async function sendMediaGroupWithRetry(
  ctx: MatchedContext<Context<Update>, 'text'>,
  currentGroup: GroupItem[],
  totalItems: number,
  author: string,
  itemsSent: number
): Promise<number> {
  if (currentGroup.length === 0) {
    return 0;
  }

  const isFirstGroup = itemsSent === 0;
  const itemsSentSoFar = itemsSent + currentGroup.length;

  const mediaGroup = currentGroup.map((groupItem, index) => {
    const isFirstInGroup = index === 0;

    if (groupItem.type === 'video') {
      const caption = isFirstInGroup
        ? isFirstGroup
          ? totalItems > 1
            ? `<b>${author}</b> posted:\nInstagram media (${totalItems} items)`
            : `<b>${author}</b> posted:\nInstagram video`
          : `<b>${author}</b> posted:\nInstagram media (${totalItems} items) - ${itemsSentSoFar}/${totalItems}`
        : undefined;

      return {
        type: 'video' as const,
        media: { source: groupItem.filePath },
        ...(caption && { caption, parse_mode: 'HTML' }),
      };
    } else {
      const caption = isFirstInGroup
        ? isFirstGroup
          ? totalItems > 1
            ? `<b>${author}</b> posted:\nInstagram media (${totalItems} items)`
            : `<b>${author}</b> posted:\nInstagram photo`
          : `<b>${author}</b> posted:\nInstagram media (${totalItems} items) - ${itemsSentSoFar}/${totalItems}`
        : undefined;

      return {
        type: 'photo' as const,
        media: { source: groupItem.filePath },
        ...(caption && { caption, parse_mode: 'HTML' }),
      };
    }
  });

  // Retry logic to ensure media groups are always sent as groups
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      await ctx.replyWithMediaGroup(mediaGroup);
      
      // Clean up files immediately after sending (memory-efficient)
      for (const groupItem of currentGroup) {
        await groupItem.cleanup().catch((err) => {
          console.error('Failed to cleanup temporary file:', err);
        });
      }

      return currentGroup.length;
    } catch (error) {
      retryCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error sending media group (attempt ${retryCount}/${MAX_RETRIES}):`, errorMessage);

      if (retryCount < MAX_RETRIES) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
        console.log(`Retrying media group send after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // All retries failed - throw error to maintain grouping requirement
        console.error(`Failed to send media group after ${MAX_RETRIES} attempts`);
        throw new Error(`Failed to send media group after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
    }
  }

  return 0; // Should never reach here, but TypeScript needs it
}

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

    // Process media items one at a time to minimize memory usage
    // This is critical for low-RAM environments (<512MB)
    const MAX_MEDIA_GROUP_SIZE = 10;
    let currentGroup: GroupItem[] = [];
    let itemsProcessed = 0;
    let itemsSent = 0;
    
    try {
      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        let downloadedFile: { filePath: string; type: 'video' | 'image'; cleanup: () => Promise<void> } | null = null;
        
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
          
          // Determine file extension based on type
          const extension = item.type === 'video' ? 'mp4' : 'jpg';
          const result = await downloadToFile(item.url, extension);
          downloadedFile = { filePath: result.filePath, type: item.type, cleanup: result.cleanup };
          currentGroup.push(downloadedFile);
          itemsProcessed++;
          
          // Send group when it reaches max size or we're at the last item
          if (currentGroup.length >= MAX_MEDIA_GROUP_SIZE || i === mediaItems.length - 1) {
            // Update progress message
            if (progressMessage) {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                progressMessage.message_id,
                undefined,
                `Sending group ${Math.floor(itemsSent / MAX_MEDIA_GROUP_SIZE) + 1}...\n${generateProgressBar(itemsProcessed, mediaItems.length)}`
              );
            }

            // Send group with retry logic (ensures items are always grouped)
            const sentCount = await sendMediaGroupWithRetry(
              ctx,
              currentGroup,
              mediaItems.length,
              author,
              itemsSent
            );
            itemsSent += sentCount;

            // Small delay between groups to avoid rate limiting
            if (i < mediaItems.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            // Clear the group after sending and cleanup
            currentGroup = [];
          }
        } catch (error) {
          console.error(`Error downloading media item ${item.index}:`, error);
          // Clean up failed download if it was created
          if (downloadedFile) {
            await downloadedFile.cleanup().catch(() => {});
          }
          // Continue with other items even if one fails
          // If we're at the last item and have items in currentGroup, send them
          if (i === mediaItems.length - 1 && currentGroup.length > 0) {
            // Send remaining items as a group (ensures items are always grouped)
            const sentCount = await sendMediaGroupWithRetry(
              ctx,
              currentGroup,
              mediaItems.length,
              author,
              itemsSent
            );
            itemsSent += sentCount;
            currentGroup = [];
          }
        }
      }

      // Send any remaining items in currentGroup (edge case: if loop ended with items still pending)
      if (currentGroup.length > 0) {
        // Send remaining items as a group (ensures items are always grouped)
        const sentCount = await sendMediaGroupWithRetry(
          ctx,
          currentGroup,
          mediaItems.length,
          author,
          itemsSent
        );
        itemsSent += sentCount;
        currentGroup = [];
      }

      if (itemsSent === 0) {
        throw new Error('Failed to download and send any media items');
      }
    } catch (downloadError) {
      // Clean up any remaining files in current group
      for (const groupItem of currentGroup) {
        await groupItem.cleanup().catch((err) => {
          console.error('Failed to cleanup temporary file:', err);
        });
      }
      throw downloadError;
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
