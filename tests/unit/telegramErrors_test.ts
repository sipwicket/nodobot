import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  describeMediaPostFailure,
  getRetryAfterSeconds,
  isTelegramFloodWait,
  withFloodWaitRetry,
} from "../../apps/bot/src/telegramErrors.ts";

Deno.test("getRetryAfterSeconds reads Grammy-like 429 objects", () => {
  const err = Object.assign(
    new Error("Call to 'sendMediaGroup' failed! (429: Too Many Requests: retry after 8)"),
    { error_code: 429, parameters: { retry_after: 8 } },
  );
  assertEquals(getRetryAfterSeconds(err), 8);
  assertEquals(isTelegramFloodWait(err), true);
});

Deno.test("getRetryAfterSeconds parses retry after from the error message", () => {
  const err = new Error("Call to 'sendMediaGroup' failed! (429: Too Many Requests: retry after 8)");
  assertEquals(getRetryAfterSeconds(err), 8);
});

Deno.test("describeMediaPostFailure explains Telegram rate limits", () => {
  const err = new Error("Call to 'sendMediaGroup' failed! (429: Too Many Requests: retry after 8)");
  assertEquals(
    describeMediaPostFailure(err, "Instagram"),
    "Couldn't send the Instagram media because Telegram asked the bot to slow down. Try posting the link again in 8 seconds.",
  );
});

Deno.test("describeMediaPostFailure explains download failures without dumping gallery-dl output", () => {
  const err = new Error("instagram: no media items");
  assertEquals(
    describeMediaPostFailure(err, "Instagram"),
    "Couldn't download that Instagram post. It may be private, deleted, or the site blocked the download.",
  );
});

Deno.test("withFloodWaitRetry retries after retry_after", async () => {
  let calls = 0;
  const result = await withFloodWaitRetry(async () => {
    calls++;
    if (calls === 1) {
      throw Object.assign(new Error("Call to 'sendMediaGroup' failed! (429: Too Many Requests: retry after 0)"), {
        error_code: 429,
        parameters: { retry_after: 0.001 },
      });
    }
    return "ok";
  }, 0);
  assertEquals(result, "ok");
  assertEquals(calls, 2);
});

Deno.test("withFloodWaitRetry does not retry non-flood errors", async () => {
  await assertRejects(
    () => withFloodWaitRetry(() => Promise.reject(new Error("instagram: no media items"))),
    Error,
    "instagram: no media items",
  );
});
