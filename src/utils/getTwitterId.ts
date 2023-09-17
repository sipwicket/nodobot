// regex is stateful :)
export const TWITTER_FIXER_DOMAINS = [
  'vxtwitter.com',
  'fxtwitter.com',
]

const TWITTER_DOMAINS = [
  'x.com',
  'twitter.com',
  ...TWITTER_FIXER_DOMAINS
]

export const getTwitterId = (url: string) => {
  if (!TWITTER_DOMAINS.some(domain => url.includes(domain))) {
    return undefined
  }

  const twitterId =
    /\/(.\w+)(\/status\/)(\d+)/g.exec(
      url
    )?.[3];

  return twitterId;
};

export const twitterUrlIsFixed = (url: string) => TWITTER_FIXER_DOMAINS.some(
  domain => url.includes(domain)
);

export const getTwitterUser = (url: string) => {
  const twitterId =
    /\/(.\w+)(\/status\/)(\d+)/g.exec(
      url
    )?.[1];

  return twitterId;
};

export const fixTwitterUrl = (username: string, tweetId: string) => `https://${TWITTER_FIXER_DOMAINS[0]}/${username}/status/${tweetId}`
