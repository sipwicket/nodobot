/**
 * Detects if a message consists exclusively of a single URL ending in .webm
 */
export const isExclusiveWebmUrl = (text: string): string | null => {
  // Remove any whitespace from start and end
  const trimmedText = text.trim();

  // Check if the text is a URL ending in .webm (case insensitive)
  const webmUrlRegex = /^https?:\/\/[^\s]+\.webm(\?[^\s]*)?$/i;

  if (webmUrlRegex.test(trimmedText)) {
    return trimmedText;
  }

  return null;
};
