import fetch from 'node-fetch';

export interface InstagramApiResult {
  type: 'query_hash' | 'query_id';
  data: any;
}

/**
 * getBlobMedia
 * @description Get list of all media files in post/reel with shortcode.
 * Adapted from ig-helper/src/utils/api.js
 *
 * @param  {string}  shortcode - Instagram post/reel shortcode
 * @param  {string}  cookies - Optional session cookies for authentication
 * @return {Promise<InstagramApiResult>}
 */
export async function getBlobMedia(
  shortcode: string,
  cookies?: string
): Promise<InstagramApiResult> {
  if (!shortcode) {
    throw new Error('NOPATH: Shortcode is required');
  }

  const queryHash = '2c4c2e343a8f64c625ba02b2aa12c7f8';
  const variables = encodeURIComponent(
    JSON.stringify({ shortcode: shortcode })
  );
  const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${variables}`;

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10; Pixel 7 XL)Build/RP1A.20845.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 Chrome/117.0.5938.60 Mobile Safari/537.36 Instagram 307.0.0.34.111',
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  try {
    const response = await fetch(url, { headers });
    const obj = await response.json();

    if (obj.status === 'fail') {
      // Fallback to query_id method
      console.log('Request failed, trying fallback method:', shortcode);
      const fallbackResult = await getBlobMediaWithQueryID(shortcode, cookies);
      // Extract the nested data structure from query_id response
      const mediaData =
        fallbackResult?.xdt_api__v1__media__shortcode__web_info?.items?.[0] ||
        fallbackResult;
      return { type: 'query_id', data: mediaData };
    } else {
      return { type: 'query_hash', data: obj.data };
    }
  } catch (err) {
    console.error('getBlobMedia() error:', err);
    throw err;
  }
}

/**
 * getBlobMediaWithQueryID
 * @description Fallback method to get media files using query_id.
 * Adapted from ig-helper/src/utils/api.js
 *
 * @param  {string}  shortcode - Instagram post/reel shortcode
 * @param  {string}  cookies - Optional session cookies for authentication
 * @return {Promise<any>}
 */
export async function getBlobMediaWithQueryID(
  shortcode: string,
  cookies?: string
): Promise<any> {
  if (!shortcode) {
    throw new Error('NOPATH: Shortcode is required');
  }

  const queryId = '9496392173716084';
  const variables = encodeURIComponent(
    JSON.stringify({
      shortcode: shortcode,
      __relay_internal__pv__PolarisFeedShareMenurelayprovider: true,
      __relay_internal__pv__PolarisIsLoggedInrelayprovider: true,
    })
  );
  const url = `https://www.instagram.com/graphql/query/?query_id=${queryId}&variables=${variables}`;

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 10; Pixel 7 XL)Build/RP1A.20845.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 Chrome/117.0.5938.60 Mobile Safari/537.36 Instagram 307.0.0.34.111',
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  try {
    const response = await fetch(url, { headers });
    const obj = await response.json();

    if (obj.status === 'fail') {
      const errorMsg = `getBlobMediaWithQueryID(): Request failed with API response: ${obj.message}: ${obj.feedback_message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    } else {
      return obj.data;
    }
  } catch (err) {
    console.error('getBlobMediaWithQueryID() error:', err);
    throw err;
  }
}
