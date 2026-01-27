import fetch from 'node-fetch';

export interface InstagramApiResult {
  type: 'query_hash' | 'query_id';
  data: any;
}

// Rate limit tracking
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 2000; // 2 seconds between requests
const RATE_LIMIT_RETRY_DELAYS = [1000, 2000, 5000]; // 1s, 2s, 5s

/**
 * Wait for minimum delay between requests
 */
async function waitForRequestDelay(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
    const waitTime = MIN_REQUEST_DELAY - timeSinceLastRequest;
    console.log(`[Instagram API] Waiting ${waitTime}ms to respect minimum request delay (${MIN_REQUEST_DELAY}ms)`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  } else {
    console.log(`[Instagram API] Time since last request: ${timeSinceLastRequest}ms (no delay needed)`);
  }
  lastRequestTime = Date.now();
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

  console.log(`[Instagram API] getBlobMedia called for shortcode: ${shortcode}, cookies: ${cookies ? 'provided' : 'not provided'}`);

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

  // Wait for minimum delay between requests
  await waitForRequestDelay();

  // Retry logic with exponential backoff
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS.length; attempt++) {
    try {
      console.log(`[Instagram API] getBlobMedia attempt ${attempt + 1}/${RATE_LIMIT_RETRY_DELAYS.length + 1} for shortcode: ${shortcode}`);
      const requestStartTime = Date.now();
      
      const response = await fetch(url, { headers });
      const requestDuration = Date.now() - requestStartTime;
      
      console.log(`[Instagram API] Response received in ${requestDuration}ms, status: ${response.status}, statusText: ${response.statusText}`);
      
      const obj = await response.json();
      
      // Log full response for debugging
      console.log(`[Instagram API] Response body for shortcode ${shortcode}:`, JSON.stringify(obj, null, 2));

      if (obj.status === 'fail') {
        console.warn(`[Instagram API] API returned fail status for shortcode ${shortcode}. Message: ${obj.message || 'No message'}, Feedback: ${obj.feedback_message || 'No feedback'}`);
        
        // Check for rate limiting in primary request
        const isRateLimit =
          obj.message?.toLowerCase().includes('wait') ||
          obj.message?.toLowerCase().includes('rate limit') ||
          obj.message?.toLowerCase().includes('try again');
        
        if (isRateLimit) {
          console.warn(`[Instagram API] Rate limit detected for shortcode ${shortcode}. Attempt ${attempt + 1}/${RATE_LIMIT_RETRY_DELAYS.length + 1}`);
          
          if (attempt < RATE_LIMIT_RETRY_DELAYS.length) {
            // Retry after delay
            const delay = RATE_LIMIT_RETRY_DELAYS[attempt];
            console.log(`[Instagram API] Waiting ${delay}ms before retry ${attempt + 2}/${RATE_LIMIT_RETRY_DELAYS.length + 1}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Retry
          } else {
            const errorMsg = `Instagram rate limit: ${obj.message || 'Please wait a few minutes before trying again'}`;
            console.error(`[Instagram API] Rate limit error after all retries for shortcode ${shortcode}: ${errorMsg}`);
            throw new Error(errorMsg);
          }
        }
        
        // Fallback to query_id method
        console.log(`[Instagram API] Falling back to query_id method for shortcode: ${shortcode}`);
        const fallbackResult = await getBlobMediaWithQueryID(shortcode, cookies);
        // Extract the nested data structure from query_id response
        const mediaData =
          fallbackResult?.xdt_api__v1__media__shortcode__web_info?.items?.[0] ||
          fallbackResult;
        console.log(`[Instagram API] Successfully retrieved media using query_id fallback for shortcode: ${shortcode}`);
        return { type: 'query_id', data: mediaData };
      } else {
        console.log(`[Instagram API] Successfully retrieved media using query_hash for shortcode: ${shortcode}`);
        return { type: 'query_hash', data: obj.data };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Instagram API] Error in getBlobMedia attempt ${attempt + 1} for shortcode ${shortcode}:`, lastError.message);
      
      // Check if it's a rate limit error and we have retries left
      const isRateLimit = lastError.message.toLowerCase().includes('rate limit') ||
                         lastError.message.toLowerCase().includes('wait');
      
      if (isRateLimit && attempt < RATE_LIMIT_RETRY_DELAYS.length) {
        const delay = RATE_LIMIT_RETRY_DELAYS[attempt];
        console.log(`[Instagram API] Rate limit error detected, waiting ${delay}ms before retry ${attempt + 2}/${RATE_LIMIT_RETRY_DELAYS.length + 1}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue; // Retry
      }
      
      // If not rate limit or out of retries, throw
      if (attempt === RATE_LIMIT_RETRY_DELAYS.length || !isRateLimit) {
        console.error(`[Instagram API] Final error for shortcode ${shortcode} after ${attempt + 1} attempts:`, lastError.message);
        throw lastError;
      }
    }
  }
  
  // Should never reach here, but just in case
  console.error(`[Instagram API] Unexpected end of retry loop for shortcode ${shortcode}`);
  throw lastError || new Error('Unknown error in getBlobMedia');
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

  console.log(`[Instagram API] getBlobMediaWithQueryID called for shortcode: ${shortcode}, cookies: ${cookies ? 'provided' : 'not provided'}`);

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

  // Wait for minimum delay between requests
  await waitForRequestDelay();

  // Retry logic with exponential backoff
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS.length; attempt++) {
    try {
      console.log(`[Instagram API] getBlobMediaWithQueryID attempt ${attempt + 1}/${RATE_LIMIT_RETRY_DELAYS.length + 1} for shortcode: ${shortcode}`);
      const requestStartTime = Date.now();
      
      const response = await fetch(url, { headers });
      const requestDuration = Date.now() - requestStartTime;
      
      console.log(`[Instagram API] QueryID response received in ${requestDuration}ms, status: ${response.status}, statusText: ${response.statusText}`);
      
      const obj = await response.json();
      
      // Log full response for debugging
      console.log(`[Instagram API] QueryID response body for shortcode ${shortcode}:`, JSON.stringify(obj, null, 2));

      if (obj.status === 'fail') {
        console.warn(`[Instagram API] QueryID API returned fail status for shortcode ${shortcode}. Message: ${obj.message || 'No message'}, Feedback: ${obj.feedback_message || 'No feedback'}`);
        
        // Check for rate limiting
        const isRateLimit =
          obj.message?.toLowerCase().includes('wait') ||
          obj.message?.toLowerCase().includes('rate limit') ||
          obj.message?.toLowerCase().includes('try again');
        
        if (isRateLimit) {
          console.warn(`[Instagram API] Rate limit detected in QueryID method for shortcode ${shortcode}. Attempt ${attempt + 1}/${RATE_LIMIT_RETRY_DELAYS.length + 1}`);
          
          if (attempt < RATE_LIMIT_RETRY_DELAYS.length) {
            // Retry after delay
            const delay = RATE_LIMIT_RETRY_DELAYS[attempt];
            console.log(`[Instagram API] Waiting ${delay}ms before QueryID retry ${attempt + 2}/${RATE_LIMIT_RETRY_DELAYS.length + 1}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Retry
          } else {
            const errorMsg = `Instagram rate limit: ${obj.message || 'Please wait a few minutes before trying again'}`;
            console.error(`[Instagram API] Rate limit error after all QueryID retries for shortcode ${shortcode}: ${errorMsg}`);
            throw new Error(errorMsg);
          }
        }
        
        const errorMsg = `getBlobMediaWithQueryID(): Request failed with API response: ${obj.message || 'Unknown error'}${obj.feedback_message ? `: ${obj.feedback_message}` : ''}`;
        console.error(`[Instagram API] QueryID method failed for shortcode ${shortcode}: ${errorMsg}`);
        throw new Error(errorMsg);
      } else {
        console.log(`[Instagram API] Successfully retrieved media using query_id for shortcode: ${shortcode}`);
        return obj.data;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Instagram API] Error in getBlobMediaWithQueryID attempt ${attempt + 1} for shortcode ${shortcode}:`, lastError.message);
      
      // Check if it's a rate limit error and we have retries left
      const isRateLimit = lastError.message.toLowerCase().includes('rate limit') ||
                         lastError.message.toLowerCase().includes('wait');
      
      if (isRateLimit && attempt < RATE_LIMIT_RETRY_DELAYS.length) {
        const delay = RATE_LIMIT_RETRY_DELAYS[attempt];
        console.log(`[Instagram API] Rate limit error detected in QueryID, waiting ${delay}ms before retry ${attempt + 2}/${RATE_LIMIT_RETRY_DELAYS.length + 1}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue; // Retry
      }
      
      // If not rate limit or out of retries, throw
      if (attempt === RATE_LIMIT_RETRY_DELAYS.length || !isRateLimit) {
        console.error(`[Instagram API] Final QueryID error for shortcode ${shortcode} after ${attempt + 1} attempts:`, lastError.message);
        throw lastError;
      }
    }
  }
  
  // Should never reach here, but just in case
  console.error(`[Instagram API] Unexpected end of QueryID retry loop for shortcode ${shortcode}`);
  throw lastError || new Error('Unknown error in getBlobMediaWithQueryID');
}
