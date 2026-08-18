export function getRetryAfterSeconds(err: unknown): number | null {
  if (err !== null && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    if (rec.error_code === 429) {
      const params = rec.parameters;
      if (params !== null && typeof params === "object") {
        const retryAfter = (params as Record<string, unknown>).retry_after;
        if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter > 0) {
          return retryAfter;
        }
      }
    }
  }

  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = /retry after (\d+)/i.exec(msg);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return null;
}

export function isTelegramFloodWait(err: unknown): boolean {
  if (getRetryAfterSeconds(err) != null) return true;
  if (err !== null && typeof err === "object" && (err as Record<string, unknown>).error_code === 429) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b429\b/.test(msg) && /too many requests/i.test(msg);
}

function errorCode(err: unknown): number | null {
  if (err !== null && typeof err === "object") {
    const code = (err as Record<string, unknown>).error_code;
    if (typeof code === "number") return code;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = /failed! \((\d+):/i.exec(msg);
  return match ? Number(match[1]) : null;
}

export function describeMediaPostFailure(err: unknown, platform: string): string {
  const retryAfter = getRetryAfterSeconds(err);
  const code = errorCode(err);
  const msg = err instanceof Error ? err.message : String(err ?? "");

  if (isTelegramFloodWait(err) || code === 429) {
    const wait = retryAfter != null
      ? ` Try posting the link again in ${Math.ceil(retryAfter)} seconds.`
      : " Try posting the link again in a moment.";
    return `Couldn't send the ${platform} media because Telegram asked the bot to slow down.${wait}`;
  }

  if (code === 413 || /too (?:large|big)|file is too big/i.test(msg)) {
    return `Couldn't send the ${platform} media because the file is too large for Telegram.`;
  }

  if (code === 400 && /chat not found|blocked by the user|bot was kicked|not enough rights/i.test(msg)) {
    return `Couldn't send the ${platform} media because the bot is missing permission in this chat.`;
  }

  if (
    /gallery-dl|no media items|instagram:|threads: no media/i.test(msg) ||
    /login|cookies|unauthorized|private/i.test(msg)
  ) {
    return `Couldn't download that ${platform} post. It may be private, deleted, or the site blocked the download.`;
  }

  return `Couldn't post that ${platform} media. You can try the link again.`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withFloodWaitRetry<T>(fn: () => Promise<T>, extraMs = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const retryAfter = getRetryAfterSeconds(err);
    if (retryAfter == null) throw err;
    await sleep(retryAfter * 1000 + extraMs);
    return await fn();
  }
}

export async function notifyChatAfterError(opts: {
  send: () => Promise<unknown>;
  err: unknown;
  extraMs?: number;
  onSendFailure?: (sendErr: unknown) => void;
}): Promise<void> {
  const retryAfter = getRetryAfterSeconds(opts.err);
  if (retryAfter != null) {
    await sleep(retryAfter * 1000 + (opts.extraMs ?? 500));
  }
  try {
    await opts.send();
  } catch (sendErr) {
    opts.onSendFailure?.(sendErr);
  }
}
