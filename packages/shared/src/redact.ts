const BOT_TOKEN_IN_URL = /\/bot\d+:[A-Za-z0-9_-]+/g;
const BOT_TOKEN_BARE = /\b\d{8,}:[A-Za-z0-9_-]{30,}\b/g;

/** Strip Telegram bot tokens from log lines and error messages. */
export function redactSecrets(text: string): string {
  return text
    .replace(BOT_TOKEN_IN_URL, "/bot<redacted>")
    .replace(BOT_TOKEN_BARE, "<redacted-token>");
}
