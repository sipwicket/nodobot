import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactSecrets } from "../../packages/shared/src/redact.ts";

Deno.test("redactSecrets strips bot tokens from Telegram API URLs", () => {
  const input =
    "request to https://api.telegram.org/bot123456789:AAHexampleTokenValueThatIsLongEnough123/getFile failed";
  const out = redactSecrets(input);
  assertEquals(out.includes("AAHexampleTokenValueThatIsLongEnough123"), false);
  assertEquals(out.includes("/bot<redacted>/getFile"), true);
});

Deno.test("redactSecrets strips bare bot tokens", () => {
  const input = "token=123456789:AAHexampleTokenValueThatIsLongEnough123";
  const out = redactSecrets(input);
  assertEquals(out.includes("AAHexampleTokenValueThatIsLongEnough123"), false);
  assertEquals(out.includes("<redacted-token>"), true);
});
