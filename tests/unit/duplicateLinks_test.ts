import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { InMemoryLinkCache } from "@integrations/cache/inMemoryCaches.ts";
import { checkAndStoreLink, findDuplicateLink, storeLink } from "@core/features/link/duplicateLinks.ts";

Deno.test("findDuplicateLink does not store", async () => {
  const cache = new InMemoryLinkCache();
  const url = "https://www.instagram.com/reel/DcJiQrzgRRT/";
  const miss = await findDuplicateLink({ tenantId: "t1", url, cache });
  assertEquals(miss, null);
  assertEquals(await cache.get("t1", "INSTAGRAM-/reel/DcJiQrzgRRT/"), null);
});

Deno.test("storeLink records a link after a successful post", async () => {
  const cache = new InMemoryLinkCache();
  const url = "https://www.instagram.com/reel/DcJiQrzgRRT/";
  await storeLink({
    tenantId: "t1",
    url,
    author: "Ada",
    dateMs: 1000,
    cache,
    cacheSize: 10,
  });
  const hit = await findDuplicateLink({ tenantId: "t1", url, cache });
  assertEquals(hit?.duplicateOf.author, "Ada");
  assertEquals(hit?.duplicateOf.dateMs, 1000);
});

Deno.test("checkAndStoreLink still stores immediately for non-deferred URLs", async () => {
  const cache = new InMemoryLinkCache();
  const url = "https://youtube.com/watch?v=dQw4w9WgXcQ";
  const first = await checkAndStoreLink({
    tenantId: "t1",
    url,
    author: "Ada",
    dateMs: 1,
    cache,
    cacheSize: 10,
  });
  assertEquals(first, null);
  const second = await checkAndStoreLink({
    tenantId: "t1",
    url,
    author: "Bob",
    dateMs: 2,
    cache,
    cacheSize: 10,
  });
  assertEquals(second?.duplicateOf.author, "Ada");
});
