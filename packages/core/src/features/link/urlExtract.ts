export type TelegramEntity = {
  type: string;
  offset: number;
  length: number;
};

export function extractUrlsFromEntities(text: string, entities: TelegramEntity[]): string[] {
  const urls: string[] = [];
  for (const e of entities) {
    if (e.type !== "url") continue;
    const raw = text.slice(e.offset, e.offset + e.length);
    if (raw) urls.push(raw);
  }
  return urls;
}

