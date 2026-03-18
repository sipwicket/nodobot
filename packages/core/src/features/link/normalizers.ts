export const TWITTER_FIXER_DOMAINS = ["fxtwitter.com", "vxtwitter.com"] as const;
export const TIKTOK_FIXER_DOMAINS = ['fxtiktok.com'] as const;
export const INSTAGRAM_FIXER_DOMAINS = ['kkinstagram.com'] as const;

const TWITTER_DOMAINS = [
  'x.com',
  'twitter.com',
  ...TWITTER_FIXER_DOMAINS,
] as const;
const TIKTOK_DOMAINS = ['tiktok.com', ...TIKTOK_FIXER_DOMAINS] as const;
const INSTAGRAM_DOMAINS = [
  'instagram.com',
  ...INSTAGRAM_FIXER_DOMAINS,
] as const;

export function getYoutubeId(url: string): string | undefined {
  return /(youtu.*be.*)\/(watch\?v=|embed\/|v|shorts|)(.*?((?=[&#?])|$))/g.exec(
    url,
  )?.[3];
}

export function getTwitterId(url: string): string | undefined {
  if (!TWITTER_DOMAINS.some(d => url.includes(d))) return undefined;
  return /\/(.\w+)(\/status\/)(\d+)/g.exec(url)?.[3];
}

export function twitterUrlIsFixed(url: string): boolean {
  return TWITTER_FIXER_DOMAINS.some(d => url.includes(d));
}

export function getTwitterUser(url: string): string | undefined {
  return /\/(.\w+)(\/status\/)(\d+)/g.exec(url)?.[1];
}

export function fixTwitterUrl(
  username: string,
  tweetId: string,
  fixerDomain: string = 'fxtwitter.com',
): string {
  return `https://${fixerDomain}/${username}/status/${tweetId}`;
}

export function getTiktokId(url: string): string | undefined {
  if (!TIKTOK_DOMAINS.some(d => url.includes(d))) return undefined;
  return /\/(.\w+)(\/video\/)(\d+)/g.exec(url)?.[3];
}

export function tiktokUrlIsFixed(url: string): boolean {
  return TIKTOK_FIXER_DOMAINS.some(d => url.includes(d));
}

export function getTiktokUser(url: string): string | undefined {
  return /\/(.\w+)(\/video\/)(\d+)/g.exec(url)?.[1];
}

export function fixTiktokUrl(
  username: string,
  videoId: string,
  fixerDomain: string = 'fxtiktok.com',
): string {
  return `https://${fixerDomain}/${username}/video/${videoId}`;
}

export function getInstagramPathname(url: string): string | undefined {
  if (!INSTAGRAM_DOMAINS.some((d) => url.includes(d))) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

export function instagramUrlIsFixed(url: string): boolean {
  return INSTAGRAM_FIXER_DOMAINS.some((d) => url.includes(d));
}

export function fixInstagramUrl(pathname: string, fixerDomain: string = "kkinstagram.com"): string {
  return `https://${fixerDomain}${pathname}`;
}

export function extractShortcode(pathname: string): string | null {
  if (!pathname) return null;
  const cleanPath = pathname.replace(/^\/|\/$/g, "");
  const postMatch = cleanPath.match(/^p\/([^\/]+)/);
  if (postMatch) return postMatch[1];
  const reelMatch = cleanPath.match(/^reels?\/([^\/]+)/);
  if (reelMatch) return reelMatch[1];
  if (/^[a-zA-Z0-9_-]+$/.test(cleanPath)) return cleanPath;
  return null;
}

export function normalizeLinkKey(url: string): string {
  const yt = getYoutubeId(url);
  if (yt) return `YOUTUBE-${yt}`;
  const tw = getTwitterId(url);
  if (tw) return `TWITTER-${tw}`;
  const tk = getTiktokId(url);
  if (tk) return `TIKTOK-${tk}`;
  const igPath = getInstagramPathname(url);
  if (igPath) return `INSTAGRAM-${igPath}`;
  return url;
}

