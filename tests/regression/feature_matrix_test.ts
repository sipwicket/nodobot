import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { defaultTenantSettingsV1, validateTenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";
import { extractThreadsPostCode, getThreadsPathname, normalizeLinkKey } from "@core/features/link/normalizers.ts";
import { isExclusiveWebmUrl } from "@core/features/webm/detectWebm.ts";

Deno.test("tenant settings defaults validate", () => {
  const s = defaultTenantSettingsV1();
  const validated = validateTenantSettingsV1(s);
  assertEquals(validated.schemaVersion, 1);
});

Deno.test("normalizeLinkKey normalizes youtube", () => {
  const k1 = normalizeLinkKey("https://youtube.com/watch?v=dQw4w9WgXcQ");
  const k2 = normalizeLinkKey("https://youtu.be/dQw4w9WgXcQ");
  assertEquals(k1, "YOUTUBE-dQw4w9WgXcQ");
  assertEquals(k2, "YOUTUBE-dQw4w9WgXcQ");
});

Deno.test("normalizeLinkKey normalizes twitter", () => {
  const k = normalizeLinkKey("https://x.com/user/status/1234567890");
  assertEquals(k, "TWITTER-1234567890");
});

Deno.test("threads link parsing and normalization", () => {
  const url = "https://www.threads.com/@danny_catmiau/post/DXu1DppDHMp";
  const pathname = getThreadsPathname(url);
  assertEquals(pathname, "/@danny_catmiau/post/DXu1DppDHMp");
  assertEquals(extractThreadsPostCode(pathname ?? ""), "DXu1DppDHMp");
  assertEquals(normalizeLinkKey(url), "THREADS-/@danny_catmiau/post/DXu1DppDHMp");
});

Deno.test("tenant settings include threads defaults and validation", () => {
  const defaults = defaultTenantSettingsV1();
  assertEquals(defaults.featureFlags.threadsDownload, true);
  assertEquals(defaults.threads.maxMediaGroupSize, 10);

  const validated = validateTenantSettingsV1({
    ...defaults,
    threads: {
      ...defaults.threads,
      maxMediaGroupSize: 999,
      minRequestIntervalMs: 20,
    },
  });
  assertEquals(validated.threads.maxMediaGroupSize, 10);
  assertEquals(validated.threads.minRequestIntervalMs, 500);
});

Deno.test("webm detection", () => {
  assertEquals(isExclusiveWebmUrl(" https://a.b/c.webm "), "https://a.b/c.webm");
  assertEquals(isExclusiveWebmUrl("hello https://a.b/c.webm"), null);
});
