import { InstagramApiResult } from './instagramApi';

export interface MediaItem {
  url: string;
  type: 'video' | 'image';
  index: number;
}

/**
 * filterResourceData
 * @description Standardized resource object format.
 * Adapted from ig-helper/src/functions/post.js
 *
 * @param  {any}  data
 * @return {any}
 */
export function filterResourceData(data: any): any {
  let resource = data.shortcode_media ?? data;
  if (resource.owner == null && resource.user != null) {
    resource.owner = resource.user;
  }

  if (resource.owner == null) {
    console.error('carousel_media: undefined username');
    throw new Error('carousel_media: undefined username');
  }

  return resource;
}

/**
 * extractMediaUrls
 * @description Extract media URLs from Instagram API response.
 * Handles both GraphQL (query_hash) and legacy (query_id) response formats.
 *
 * @param  {InstagramApiResult}  result
 * @return {MediaItem[]}
 */
export function extractMediaUrls(result: InstagramApiResult): MediaItem[] {
  const mediaItems: MediaItem[] = [];
  let index = 1;

  if (result.type === 'query_hash') {
    // GraphQL API response format
    const resource = filterResourceData(result.data);

    // GraphVideo
    if (resource.__typename === 'GraphVideo' && resource.video_url) {
      mediaItems.push({
        url: resource.video_url,
        type: 'video',
        index: index++,
      });
    }
    // GraphImage
    else if (resource.__typename === 'GraphImage') {
      if (resource.display_resources && resource.display_resources.length > 0) {
        // Get highest resolution (last item is usually highest)
        const highestRes =
          resource.display_resources[resource.display_resources.length - 1];
        mediaItems.push({
          url: highestRes.src,
          type: 'image',
          index: index++,
        });
      }
    }
    // GraphSidecar (carousel)
    else if (
      resource.__typename === 'GraphSidecar' &&
      resource.edge_sidecar_to_children
    ) {
      for (const edge of resource.edge_sidecar_to_children.edges) {
        const node = edge.node;
        if (node.__typename === 'GraphVideo' && node.video_url) {
          mediaItems.push({
            url: node.video_url,
            type: 'video',
            index: index++,
          });
        } else if (node.__typename === 'GraphImage') {
          if (node.display_resources && node.display_resources.length > 0) {
            const highestRes =
              node.display_resources[node.display_resources.length - 1];
            mediaItems.push({
              url: highestRes.src,
              type: 'image',
              index: index++,
            });
          }
        }
      }
    }
  } else {
    // Legacy API response format (query_id)
    const resource = filterResourceData(result.data);

    if (resource.carousel_media) {
      // Carousel post
      resource.carousel_media.forEach((mda: any, ind: number) => {
        const idx = ind + 1;
        // Image
        if (mda.video_versions == null) {
          if (mda.image_versions2 && mda.image_versions2.candidates) {
            // Sort by quality (width or STP param length)
            const sorted = [...mda.image_versions2.candidates].sort(
              (a: any, b: any) => {
                const aSTP = new URL(a.url).searchParams.get('stp');
                const bSTP = new URL(b.url).searchParams.get('stp');

                if (aSTP && bSTP) {
                  if (aSTP.length > bSTP.length) return 1;
                  if (aSTP.length < bSTP.length) return -1;
                } else {
                  if (a.width < b.width) return 1;
                  if (a.width > b.width) return -1;
                }
                return 0;
              }
            );

            mediaItems.push({
              url: sorted[0].url,
              type: 'image',
              index: idx,
            });
          }
        }
        // Video
        else {
          if (mda.video_versions && mda.video_versions.length > 0) {
            mediaItems.push({
              url: mda.video_versions[0].url,
              type: 'video',
              index: idx,
            });
          }
        }
      });
    } else {
      // Single media post
      // Image
      if (resource.video_versions == null) {
        if (resource.image_versions2 && resource.image_versions2.candidates) {
          const sorted = [...resource.image_versions2.candidates].sort(
            (a: any, b: any) => {
              const aSTP = new URL(a.url).searchParams.get('stp');
              const bSTP = new URL(b.url).searchParams.get('stp');

              if (aSTP && bSTP) {
                if (aSTP.length > bSTP.length) return 1;
                if (aSTP.length < bSTP.length) return -1;
              } else {
                if (a.width < b.width) return 1;
                if (a.width > b.width) return -1;
              }
              return 0;
            }
          );

          mediaItems.push({
            url: sorted[0].url,
            type: 'image',
            index: index++,
          });
        }
      }
      // Video
      else {
        if (resource.video_versions && resource.video_versions.length > 0) {
          mediaItems.push({
            url: resource.video_versions[0].url,
            type: 'video',
            index: index++,
          });
        }
      }
    }
  }

  return mediaItems;
}

/**
 * isReelUrl
 * @description Check if URL pathname is a reel.
 *
 * @param  {string}  pathname
 * @return {boolean}
 */
export function isReelUrl(pathname: string): boolean {
  return pathname.startsWith('/reels/') || pathname.startsWith('/reel/');
}
