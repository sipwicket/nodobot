// regex is stateful :)
export const TIKTOK_FIXER_DOMAINS = [
  'vxtiktok.com',
]

const TIKTOK_DOMAINS = [
  'tiktok.com',
  ...TIKTOK_FIXER_DOMAINS
]

export const getTiktokId = (url: string) => {
  if (!TIKTOK_DOMAINS.some(domain => url.includes(domain))) {
    return undefined
  }

  const tiktokId =
    /\/(.\w+)(\/video\/)(\d+)/g.exec(
      url
    )?.[3];

  return tiktokId;
};

export const tiktokUrlIsFixed = (url: string) => TIKTOK_FIXER_DOMAINS.some(
  domain => url.includes(domain)
);

export const getTiktokUser = (url: string) => {
  const tiktokId =
    /\/(.\w+)(\/video\/)(\d+)/g.exec(
      url
    )?.[1];

  return tiktokId;
};

export const fixTiktokUrl = (username: string, tiktokvidId: string) => `https://${TIKTOK_FIXER_DOMAINS[0]}/${username}/video/${tiktokvidId}`
