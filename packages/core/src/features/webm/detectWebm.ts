export function isExclusiveWebmUrl(text: string): string | null {
  const trimmedText = text.trim();
  const webmUrlRegex = /^https?:\/\/[^\s]+\.webm(\?[^\s]*)?$/i;
  return webmUrlRegex.test(trimmedText) ? trimmedText : null;
}

