import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CooldownGate,
  TelegramNetworkError,
  describeNetworkCause,
  isTransientNetworkError,
  retryWithTimeout,
  withRetries,
} from "../../apps/bot/src/networkRetry.ts";

Deno.test("isTransientNetworkError detects ETIMEDOUT nested in HttpError-like objects", () => {
  const err = Object.assign(new Error("Network request for 'getFile' failed!"), {
    name: "HttpError",
    error: Object.assign(new Error("request to https://api.telegram.org/botTOKEN/getFile failed"), {
      code: "ETIMEDOUT",
      errno: "ETIMEDOUT",
      type: "system",
    }),
  });
  assertEquals(isTransientNetworkError(err), true);
});

Deno.test("isTransientNetworkError is false for ordinary errors", () => {
  assertEquals(isTransientNetworkError(new Error("instagram: no media items")), false);
});

Deno.test("describeNetworkCause maps ETIMEDOUT to a concrete detail", () => {
  const err = Object.assign(new Error("Network request for 'getFile' failed!"), {
    name: "HttpError",
    error: { code: "ETIMEDOUT", message: "request failed, reason: " },
  });
  const described = describeNetworkCause(err);
  assertEquals(described.code, "ETIMEDOUT");
  assertEquals(described.detail, "TCP connection to api.telegram.org timed out");
});

Deno.test("withRetries returns after a transient failure", async () => {
  let calls = 0;
  const result = await withRetries(async () => {
    calls++;
    if (calls === 1) {
      const err = Object.assign(new Error("Network request for 'getFile' failed!"), {
        error: { code: "ETIMEDOUT" },
      });
      throw err;
    }
    return "ok";
  }, { attempts: 2, delaysMs: [1] });
  assertEquals(result, "ok");
  assertEquals(calls, 2);
});

Deno.test("withRetries does not retry non-transient errors", async () => {
  let calls = 0;
  await assertRejects(
    () =>
      withRetries(async () => {
        calls++;
        throw new Error("boom");
      }, { attempts: 3, delaysMs: [1] }),
    Error,
    "boom",
  );
  assertEquals(calls, 1);
});

Deno.test("retryWithTimeout wraps exhausted failures in TelegramNetworkError", async () => {
  const err = await assertRejects(
    () =>
      retryWithTimeout(
        "getFile",
        async () => {
          throw Object.assign(new Error("Network request for 'getFile' failed!"), {
            error: { code: "ETIMEDOUT" },
          });
        },
        { attempts: 2, timeoutMs: 50, delaysMs: [1] },
      ),
    TelegramNetworkError,
  );
  assertEquals(err.operation, "getFile");
  assertEquals(err.attempts, 2);
  assertEquals(err.timeoutMs, 50);
  assertEquals(err.causeCode, "ETIMEDOUT");
  assertEquals(
    err.message,
    "Telegram getFile failed after 2 attempt(s) (50ms each): ETIMEDOUT (TCP connection to api.telegram.org timed out)",
  );
});

Deno.test("retryWithTimeout succeeds after a transient failure", async () => {
  let calls = 0;
  const result = await retryWithTimeout(
    "getFile",
    async () => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("Network request for 'getFile' failed!"), {
          error: { code: "ETIMEDOUT" },
        });
      }
      return "ok";
    },
    { attempts: 3, timeoutMs: 50, delaysMs: [1] },
  );
  assertEquals(result, "ok");
  assertEquals(calls, 2);
});

Deno.test("CooldownGate opens after the failure threshold", () => {
  const gate = new CooldownGate(1, 60_000);
  assertEquals(gate.isOpen(), false);
  assertEquals(gate.recordFailure(), true);
  assertEquals(gate.isOpen(), true);
  gate.recordSuccess();
  assertEquals(gate.isOpen(), false);
});
