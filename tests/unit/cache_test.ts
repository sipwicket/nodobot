import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { InMemoryLinkCache } from "@integrations/cache/inMemoryCaches.ts";

Deno.test("InMemoryLinkCache evicts FIFO", async () => {
  const cache = new InMemoryLinkCache();
  const tenantId = "t1";
  await cache.put(tenantId, { key: "a", url: "a", metadata: { author: "x", dateMs: 1 } }, 2);
  await cache.put(tenantId, { key: "b", url: "b", metadata: { author: "x", dateMs: 2 } }, 2);
  await cache.put(tenantId, { key: "c", url: "c", metadata: { author: "x", dateMs: 3 } }, 2);
  assertEquals(await cache.get(tenantId, "a"), null);
  assertEquals((await cache.get(tenantId, "b"))?.url, "b");
  assertEquals((await cache.get(tenantId, "c"))?.url, "c");
});

