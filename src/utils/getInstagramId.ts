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
