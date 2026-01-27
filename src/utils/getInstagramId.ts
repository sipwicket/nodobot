// regex is stateful :)
export const INSTAGRAM_FIXER_DOMAINS = ['kkinstagram.com'];

const INSTAGRAM_DOMAINS = ['instagram.com', ...INSTAGRAM_FIXER_DOMAINS];

export const getInstagramPathname = (url: string) => {
  if (!INSTAGRAM_DOMAINS.some((domain) => url.includes(domain))) {
    return undefined;
  }

  try {
    return new URL(url).pathname;
  } catch (error) {
    console.error('Error getting Instagram ID:', error, url);
  }
};

export const instagramUrlIsFixed = (url: string) =>
  INSTAGRAM_FIXER_DOMAINS.some((domain) => url.includes(domain));

export const fixInstagramUrl = (pathname: string) =>
  `https://${INSTAGRAM_FIXER_DOMAINS[0]}${pathname}`;

/**
 * extractShortcode
 * @description Extract shortcode from Instagram URL pathname.
 * Handles /p/SHORTCODE/, /reels/SHORTCODE/, /reel/SHORTCODE/ formats.
 *
 * @param  {string}  pathname - Instagram URL pathname
 * @return {string | null} - Shortcode or null if invalid
 */
export function extractShortcode(pathname: string): string | null {
  if (!pathname) return null;

  // Remove leading/trailing slashes
  const cleanPath = pathname.replace(/^\/|\/$/g, '');

  // Match /p/SHORTCODE/ or /reels/SHORTCODE/ or /reel/SHORTCODE/
  const postMatch = cleanPath.match(/^p\/([^\/]+)/);
  if (postMatch) {
    return postMatch[1];
  }

  const reelMatch = cleanPath.match(/^reels?\/([^\/]+)/);
  if (reelMatch) {
    return reelMatch[1];
  }

  // If pathname is just a shortcode (no prefix)
  if (/^[a-zA-Z0-9_-]+$/.test(cleanPath)) {
    return cleanPath;
  }

  return null;
}
